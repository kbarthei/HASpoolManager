import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints, amsSlots, spools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { matchSpool } from "@/lib/matching";

/**
 * POST /api/v1/events/printer-sync
 *
 * Full printer state sync — called by HA every 60 seconds.
 * Accepts FLAT key-value pairs from HA sensors (no complex JSON construction needed).
 * All parsing and normalization happens here, not in HA Jinja2 templates.
 *
 * Idempotent: safe to call 100x with the same state.
 */

type PrintTransition = "none" | "started" | "finished" | "failed";

// ── State classification ─────────────────────────────────────────────────────
// Accept both MQTT protocol values AND HA Bambu Lab integration values
// (any case — we normalize to uppercase)
const ACTIVE_STATES = new Set([
  "RUNNING", "PRINTING", "PREPARE", "SLICING", "PAUSE",
  "DRUCKEN", "VORBEREITEN",  // German variants just in case
]);
const FINISH_STATES = new Set(["FINISH", "FINISHED", "COMPLETE", "COMPLETED"]);
const FAILED_STATES = new Set(["FAILED", "CANCELED", "CANCELLED", "ERROR"]);
const IDLE_STATES = new Set(["IDLE", "OFFLINE", "UNKNOWN", ""]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a string to number, returning the default for any non-numeric value */
function num(val: unknown, def = 0): number {
  if (val === null || val === undefined || val === "" || val === "None" || val === "unknown" || val === "unavailable") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

/** Parse a string to boolean */
function bool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const lower = val.toLowerCase().trim();
    return lower === "true" || lower === "on" || lower === "1" || lower === "yes";
  }
  return false;
}

/** Clean a string value — treat HA's "None", "unknown", "unavailable" as empty */
function str(val: unknown, def = ""): string {
  if (val === null || val === undefined) return def;
  const s = String(val).trim();
  if (s === "None" || s === "unknown" || s === "unavailable" || s === "null") return def;
  return s;
}

/** Build a stable ha_event_id from the print name + UTC date */
function buildEventId(printName: string, printerId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = printName.trim().toLowerCase().replace(/\s+/g, "_");
  return `sync_${printerId.slice(0, 8)}_${date}_${safeName}`.slice(0, 200);
}

// ── Slot definition (maps HA sensor names to our slot types) ─────────────────
const SLOT_DEFS = [
  { key: "slot_1", slotType: "ams", amsIndex: 0, trayIndex: 0 },
  { key: "slot_2", slotType: "ams", amsIndex: 0, trayIndex: 1 },
  { key: "slot_3", slotType: "ams", amsIndex: 0, trayIndex: 2 },
  { key: "slot_4", slotType: "ams", amsIndex: 0, trayIndex: 3 },
  { key: "slot_ht",  slotType: "ams_ht", amsIndex: 1, trayIndex: 0 },
  { key: "slot_ext", slotType: "external", amsIndex: -1, trayIndex: 0 },
] as const;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    // ── Extract and normalize values ──────────────────────────────────────
    const printer_id = str(body.printer_id);
    if (!printer_id) {
      return NextResponse.json({ error: "printer_id required" }, { status: 400 });
    }

    const rawState = str(body.print_state).toUpperCase();
    const printName = str(body.print_name);
    const printWeight = num(body.print_weight);
    const printLayersTotal = num(body.print_layers_total);
    const printError = bool(body.print_error);

    // Log what we received for debugging
    console.log(`[printer-sync] state=${rawState} name="${printName}" weight=${printWeight} error=${printError}`);

    // Classify the state
    const isActive = ACTIVE_STATES.has(rawState);
    const isFinished = FINISH_STATES.has(rawState);
    const isFailed = FAILED_STATES.has(rawState);
    const isIdle = IDLE_STATES.has(rawState) || (!isActive && !isFinished && !isFailed);

    // ── 1. Print state transitions ────────────────────────────────────────

    const runningPrint = await db.query.prints.findFirst({
      where: and(eq(prints.printerId, printer_id), eq(prints.status, "running")),
    });

    let printTransition: PrintTransition = "none";
    let affectedPrintId: string | null = runningPrint?.id ?? null;

    if (!runningPrint && isActive) {
      // New print started
      const haEventId = buildEventId(printName || "unknown", printer_id);
      const existing = await db.query.prints.findFirst({
        where: eq(prints.haEventId, haEventId),
      });

      if (!existing) {
        const [newPrint] = await db
          .insert(prints)
          .values({
            printerId: printer_id,
            name: printName || null,
            status: "running",
            startedAt: new Date(),
            totalLayers: printLayersTotal || null,
            printWeight: printWeight || null,
            haEventId,
          })
          .returning();
        affectedPrintId = newPrint.id;
        printTransition = "started";
        console.log(`[printer-sync] STARTED: "${printName}" id=${newPrint.id}`);
      } else {
        affectedPrintId = existing.id;
      }
    } else if (runningPrint && isFinished) {
      // Print completed
      await db.update(prints).set({
        status: "finished",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        printWeight: printWeight || runningPrint.printWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "finished";
      console.log(`[printer-sync] FINISHED: "${runningPrint.name}"`);
    } else if (runningPrint && isFailed) {
      // Print failed/cancelled
      await db.update(prints).set({
        status: "failed",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "failed";
      console.log(`[printer-sync] FAILED: "${runningPrint.name}"`);
    } else if (runningPrint && isIdle && !printError) {
      // Idle without error = missed finish event
      await db.update(prints).set({
        status: "finished",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        printWeight: printWeight || runningPrint.printWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "finished";
      console.log(`[printer-sync] FINISHED (idle detected): "${runningPrint.name}"`);
    } else if (runningPrint && isActive && printWeight > 0) {
      // Still running — update weight
      await db.update(prints).set({
        printWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
    }
    // runningPrint && isIdle && printError → keep running (waiting for spool swap)

    // ── 2. Update AMS slots (flat key-value) ──────────────────────────────

    let slotsUpdated = 0;

    for (const def of SLOT_DEFS) {
      const prefix = def.key;
      // Check if this slot's data was sent
      const hasSlotData = body[`${prefix}_type`] !== undefined || body[`${prefix}_empty`] !== undefined;
      if (!hasSlotData) continue;

      const slotType = def.slotType;
      const trayType = str(body[`${prefix}_type`]);
      const trayColor = str(body[`${prefix}_color`]).replace("#", "").slice(0, 8);
      const tagUid = str(body[`${prefix}_tag`]);
      const filamentId = str(body[`${prefix}_filament_id`]);
      const remain = num(body[`${prefix}_remain`], -1);
      const isEmpty = bool(body[`${prefix}_empty`]) || trayType === "" || trayType === "Empty";

      // Find existing slot
      const existingSlot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, printer_id),
          eq(amsSlots.slotType, slotType),
          eq(amsSlots.amsIndex, def.amsIndex),
          eq(amsSlots.trayIndex, def.trayIndex)
        ),
      });

      // Match spool when slot is occupied
      let matchedSpoolId: string | null = null;
      if (!isEmpty && trayType) {
        const matchResult = await matchSpool({
          tag_uid: tagUid || undefined,
          tray_info_idx: filamentId || undefined,
          tray_type: trayType || undefined,
          tray_color: trayColor || undefined,
          printer_id,
          ams_index: def.amsIndex,
          tray_index: def.trayIndex,
        });

        if (matchResult.match) {
          matchedSpoolId = matchResult.match.spool_id;
          const locationMap = { ams: "ams", ams_ht: "ams-ht", external: "external" } as const;
          await db.update(spools).set({
            location: locationMap[slotType as keyof typeof locationMap] || "ams",
            updatedAt: new Date(),
          }).where(eq(spools.id, matchedSpoolId));
        }
      }

      // Move old spool back to storage if swapped
      if (existingSlot?.spoolId && existingSlot.spoolId !== matchedSpoolId) {
        await db.update(spools).set({
          location: "storage",
          updatedAt: new Date(),
        }).where(eq(spools.id, existingSlot.spoolId));
      }

      const slotData = {
        printerId: printer_id,
        slotType,
        amsIndex: def.amsIndex,
        trayIndex: def.trayIndex,
        spoolId: matchedSpoolId,
        bambuTrayIdx: filamentId || null,
        bambuColor: trayColor || null,
        bambuType: trayType || null,
        bambuTagUid: tagUid || null,
        bambuRemain: remain,
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

    return NextResponse.json({
      synced: true,
      print_state: rawState,
      print_state_raw: str(body.print_state),
      print_error: printError,
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
