import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints, amsSlots, spools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { matchSpool } from "@/lib/matching";
import { validateBody, printerSyncSchema } from "@/lib/validations";

/**
 * POST /api/v1/events/printer-sync
 *
 * Full printer state sync — called by HA every 60 seconds.
 * Handles print state transitions and updates all AMS slots atomically.
 * Idempotent: safe to call 100x with the same state.
 *
 * Body: PrinterSyncPayload (see printerSyncSchema in lib/validations.ts)
 */

type PrintTransition = "none" | "started" | "finished" | "failed";

/** States that indicate an active / in-progress print */
const ACTIVE_PRINT_STATES = new Set(["RUNNING", "PAUSE", "SLICING", "PREPARE"]);
/** States that mean the print ended successfully */
const FINISH_STATES = new Set(["FINISH"]);
/** States that mean the print ended with a failure */
const FAILED_STATES = new Set(["FAILED"]);
/** States that mean the printer is idle — treat a previously running print as finished */
const IDLE_STATES = new Set(["IDLE"]);

/** Build a stable ha_event_id from the print name + UTC date (YYYY-MM-DD) */
function buildEventId(printName: string, printerId: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // Normalise the print name so minor whitespace differences are ignored
  const safeName = printName.trim().toLowerCase().replace(/\s+/g, "_");
  return `sync_${printerId.slice(0, 8)}_${date}_${safeName}`.slice(0, 200);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(printerSyncSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    const { printer_id, print_state, print_name, print_weight, print_layers_total, ams_slots } =
      body;

    // ── 1. Detect print state transition ──────────────────────────────────────

    // Find any currently running print for this printer
    const runningPrint = await db.query.prints.findFirst({
      where: and(eq(prints.printerId, printer_id), eq(prints.status, "running")),
    });

    let printTransition: PrintTransition = "none";
    let affectedPrintId: string | null = runningPrint?.id ?? null;

    const isActive = ACTIVE_PRINT_STATES.has(print_state);
    const isFinished = FINISH_STATES.has(print_state);
    const isFailed = FAILED_STATES.has(print_state);
    const isIdle = IDLE_STATES.has(print_state);

    if (!runningPrint && isActive) {
      // ── Transition: IDLE → RUNNING (print started) ──────────────────────
      const haEventId = buildEventId(print_name || "unknown", printer_id);

      // Idempotency: don't create a duplicate if we already recorded this start
      const existing = await db.query.prints.findFirst({
        where: eq(prints.haEventId, haEventId),
      });

      if (!existing) {
        const [newPrint] = await db
          .insert(prints)
          .values({
            printerId: printer_id,
            name: print_name || null,
            status: "running",
            startedAt: new Date(),
            totalLayers: print_layers_total || null,
            printWeight: print_weight || null,
            haEventId,
          })
          .returning();
        affectedPrintId = newPrint.id;
        printTransition = "started";
      } else {
        affectedPrintId = existing.id;
        // Already started — no new transition
      }
    } else if (runningPrint && (isFinished || isIdle)) {
      // ── Transition: RUNNING → FINISH or missed-FINISH (treat as finished) ─
      await db
        .update(prints)
        .set({
          status: "finished",
          finishedAt: new Date(),
          durationSeconds: runningPrint.startedAt
            ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
            : null,
          printWeight: print_weight || runningPrint.printWeight,
          updatedAt: new Date(),
        })
        .where(eq(prints.id, runningPrint.id));
      printTransition = "finished";
    } else if (runningPrint && isFailed) {
      // ── Transition: RUNNING → FAILED ────────────────────────────────────
      await db
        .update(prints)
        .set({
          status: "failed",
          finishedAt: new Date(),
          durationSeconds: runningPrint.startedAt
            ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(prints.id, runningPrint.id));
      printTransition = "failed";
    } else if (runningPrint && isActive) {
      // ── Still running — update progress fields only ──────────────────────
      // Only update weight if it's non-zero (avoid clobbering with 0 during PREPARE)
      if (print_weight && print_weight > 0) {
        await db
          .update(prints)
          .set({ printWeight: print_weight, updatedAt: new Date() })
          .where(eq(prints.id, runningPrint.id));
      }
      // printTransition stays "none"
    }

    // ── 2. Update all AMS slots ────────────────────────────────────────────────

    let slotsUpdated = 0;

    for (const slotPayload of ams_slots) {
      const slotType = slotPayload.slot_type;
      const isEmpty = slotPayload.is_empty === true;
      const normalizedColor = slotPayload.tray_color?.replace("#", "").slice(0, 8) ?? null;

      // Find existing slot record
      const existingSlot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, printer_id),
          eq(amsSlots.slotType, slotType),
          eq(amsSlots.amsIndex, slotPayload.ams_index),
          eq(amsSlots.trayIndex, slotPayload.tray_index)
        ),
      });

      // Run matching engine when slot is occupied
      let matchedSpoolId: string | null = null;

      if (!isEmpty) {
        const matchResult = await matchSpool({
          tag_uid: slotPayload.tag_uid ?? undefined,
          tray_info_idx: slotPayload.filament_id ?? undefined,
          tray_type: slotPayload.tray_type ?? undefined,
          tray_color: slotPayload.tray_color ?? undefined,
          printer_id,
          ams_index: slotPayload.ams_index,
          tray_index: slotPayload.tray_index,
        });

        if (matchResult.match) {
          matchedSpoolId = matchResult.match.spool_id;

          // Update spool location to reflect it's now in the AMS
          const locationMap = {
            ams: "ams",
            ams_ht: "ams-ht",
            external: "external",
          } as const;
          await db
            .update(spools)
            .set({
              location: locationMap[slotType as keyof typeof locationMap] || "ams",
              updatedAt: new Date(),
            })
            .where(eq(spools.id, matchedSpoolId));
        }
      }

      // If slot previously held a different spool, move it back to storage
      if (existingSlot?.spoolId && existingSlot.spoolId !== matchedSpoolId) {
        await db
          .update(spools)
          .set({ location: "storage", updatedAt: new Date() })
          .where(eq(spools.id, existingSlot.spoolId));
      }

      const slotData = {
        printerId: printer_id,
        slotType,
        amsIndex: slotPayload.ams_index,
        trayIndex: slotPayload.tray_index,
        spoolId: matchedSpoolId,
        bambuTrayIdx: slotPayload.filament_id || null,
        bambuColor: normalizedColor,
        bambuType: slotPayload.tray_type || null,
        bambuTagUid: slotPayload.tag_uid || null,
        bambuRemain: slotPayload.remain ?? -1,
        isEmpty,
        updatedAt: new Date(),
      };

      if (existingSlot) {
        await db.update(amsSlots).set(slotData).where(eq(amsSlots.id, existingSlot.id));
      } else {
        await db.insert(amsSlots).values(slotData);
      }

      slotsUpdated++;
    }

    // ── 3. Response ───────────────────────────────────────────────────────────

    return NextResponse.json({
      synced: true,
      print_state,
      print_transition: printTransition,
      print_id: affectedPrintId,
      slots_updated: slotsUpdated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/v1/events/printer-sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
