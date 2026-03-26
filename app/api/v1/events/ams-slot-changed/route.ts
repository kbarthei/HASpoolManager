import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amsSlots, spools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { matchSpool } from "@/lib/matching";

/**
 * POST /api/v1/events/ams-slot-changed
 *
 * Called by HA when an AMS slot sensor state changes.
 * Updates AMS slot data and runs matching engine to identify the spool.
 *
 * Body:
 *   printer_id: string (UUID)
 *   slot_type?: "ams" | "ams_ht" | "external" (defaults to "ams")
 *   ams_index: number (0 = AMS unit 1, 1 = AMS HT, -1 = external)
 *   tray_index: number (0-3 for AMS, 0 for AMS HT/external)
 *   tray_info_idx?: string (Bambu filament code, e.g. "GFA00")
 *   tray_type?: string (material, e.g. "PLA")
 *   tray_color?: string (hex with alpha, e.g. "161616FF")
 *   tag_uid?: string (RFID tag UID)
 *   tray_sub_brands?: string (sub-brand string)
 *   tray_weight?: number (spool weight in grams)
 *   remain?: number (remaining percentage, -1 = unknown)
 *   nozzle_temp_min?: number
 *   nozzle_temp_max?: number
 *   is_empty?: boolean
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    if (body.printer_id == null || body.ams_index == null || body.tray_index == null) {
      return NextResponse.json(
        { error: "printer_id, ams_index, and tray_index are required" },
        { status: 400 }
      );
    }

    const slotType = body.slot_type || "ams";

    // Find or create the AMS slot
    let slot = await db.query.amsSlots.findFirst({
      where: and(
        eq(amsSlots.printerId, body.printer_id),
        eq(amsSlots.slotType, slotType),
        eq(amsSlots.amsIndex, body.ams_index),
        eq(amsSlots.trayIndex, body.tray_index)
      ),
    });

    const isEmpty = body.is_empty === true;
    const normalizedColor = body.tray_color?.replace("#", "").slice(0, 8) || null;

    // Run matching engine if slot is not empty
    let matchResult = null;
    let matchedSpoolId: string | null = null;

    if (!isEmpty) {
      matchResult = await matchSpool({
        tag_uid: body.tag_uid,
        tray_info_idx: body.tray_info_idx,
        tray_type: body.tray_type,
        tray_color: body.tray_color,
        tray_sub_brands: body.tray_sub_brands,
        printer_id: body.printer_id,
        ams_index: body.ams_index,
        tray_index: body.tray_index,
      });

      if (matchResult.match) {
        matchedSpoolId = matchResult.match.spool_id;

        // Update the matched spool's location based on slot type
        const locationMap = { ams: "ams", ams_ht: "ams-ht", external: "external" } as const;
        await db
          .update(spools)
          .set({ location: locationMap[slotType as keyof typeof locationMap] || "ams", updatedAt: new Date() })
          .where(eq(spools.id, matchedSpoolId));
      }
    }

    // If the slot previously had a spool and now it's different or empty,
    // update the old spool's location back to storage
    if (slot?.spoolId && slot.spoolId !== matchedSpoolId) {
      await db
        .update(spools)
        .set({ location: "storage", updatedAt: new Date() })
        .where(eq(spools.id, slot.spoolId));
    }

    const slotData = {
      printerId: body.printer_id,
      slotType,
      amsIndex: body.ams_index,
      trayIndex: body.tray_index,
      spoolId: matchedSpoolId,
      bambuTrayIdx: body.tray_info_idx || null,
      bambuColor: normalizedColor,
      bambuType: body.tray_type || null,
      bambuTagUid: body.tag_uid || null,
      bambuRemain: body.remain ?? -1,
      isEmpty,
      updatedAt: new Date(),
    };

    if (slot) {
      await db
        .update(amsSlots)
        .set(slotData)
        .where(eq(amsSlots.id, slot.id));
    } else {
      [slot] = await db.insert(amsSlots).values(slotData).returning();
    }

    return NextResponse.json({
      slot_id: slot!.id,
      ams_index: body.ams_index,
      tray_index: body.tray_index,
      is_empty: isEmpty,
      matched_spool: matchResult?.match
        ? {
            spool_id: matchResult.match.spool_id,
            filament_name: matchResult.match.filament_name,
            vendor_name: matchResult.match.vendor_name,
            confidence: matchResult.match.confidence,
            match_method: matchResult.match.match_method,
          }
        : null,
      candidates: matchResult?.candidates?.slice(0, 3) || [],
    });
  } catch (error) {
    console.error("POST /api/v1/events/ams-slot-changed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
