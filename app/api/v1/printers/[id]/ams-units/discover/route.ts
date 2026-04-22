import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printerAmsUnits } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

const discoverBodySchema = z.object({
  devices: z
    .array(
      z.object({
        id: z.string(),
        model: z.string(),
        name: z.string().optional(),
      }),
    )
    .max(10),
});

// POST /api/v1/printers/[id]/ams-units/discover
// Called by the sync worker after HA discovery. Upserts printer_ams_units rows
// for every discovered AMS device. User customizations (displayName, enabled)
// are preserved on re-discovery.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id: printerId } = await ctx.params;

  try {
    const raw = await request.json();
    const parsed = discoverBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let created = 0;
    let refreshed = 0;

    // Deterministic amsIndex assignment:
    // - HT device (model includes "ht") → amsIndex = 1 (preserves legacy convention)
    // - AMS devices → amsIndex = 0, 2, 3, ... (skip 1 to reserve for HT)
    let nextAmsIndex = 0;
    for (const device of parsed.data.devices) {
      const modelLower = device.model.toLowerCase();
      const slotType: "ams_ht" | "ams" = modelLower.includes("ht") ? "ams_ht" : "ams";

      // Check for existing unit by haDeviceId
      const existingByDevice = await db.query.printerAmsUnits.findFirst({
        where: eq(printerAmsUnits.haDeviceId, device.id),
      });

      if (existingByDevice) {
        // Refresh discoveredAt; preserve user-edited displayName + enabled
        await db
          .update(printerAmsUnits)
          .set({ discoveredAt: new Date() })
          .where(eq(printerAmsUnits.id, existingByDevice.id));
        refreshed++;
        continue;
      }

      const amsIndex = slotType === "ams_ht" ? 1 : nextAmsIndex === 1 ? 2 : nextAmsIndex;
      if (slotType === "ams") {
        nextAmsIndex = amsIndex === 0 ? 2 : amsIndex + 1;
      }

      const displayName = slotType === "ams_ht" ? "AMS HT" : `AMS ${amsIndex + 1}`;

      // Guard against unique-constraint conflicts (race with parallel discovery runs)
      const conflict = await db.query.printerAmsUnits.findFirst({
        where: and(
          eq(printerAmsUnits.printerId, printerId),
          eq(printerAmsUnits.amsIndex, amsIndex),
          eq(printerAmsUnits.slotType, slotType),
        ),
      });
      if (conflict) {
        // Fill in the haDeviceId on the existing row if missing
        if (!conflict.haDeviceId) {
          await db
            .update(printerAmsUnits)
            .set({ haDeviceId: device.id, discoveredAt: new Date() })
            .where(eq(printerAmsUnits.id, conflict.id));
          refreshed++;
        }
        continue;
      }

      await db.insert(printerAmsUnits).values({
        printerId,
        amsIndex,
        slotType,
        haDeviceId: device.id,
        displayName,
        enabled: true,
      });
      created++;
    }

    return NextResponse.json({ created, refreshed });
  } catch (error) {
    console.error("POST /api/v1/printers/[id]/ams-units/discover error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
