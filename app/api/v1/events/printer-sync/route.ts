import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { prints, amsSlots, spools, syncLog, printUsage, vendors, filaments, tagMappings } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
  "DRUCKEN", "VORBEREITEN",  // German variants
  // Bambu Lab calibration/preparation sub-states
  "CALIBRATING_EXTRUSION", "CLEANING_NOZZLE_TIP", "SWEEPING_XY_MECH_MODE",
  "HEATBED_PREHEATING", "NOZZLE_PREHEATING", "CHANGE_FILAMENT",
  "M400_PAUSE", "FILAMENT_RUNOUT_PAUSE", "FRONT_COVER_PAUSE",
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

// ── Bambu color hex → human-readable name map (common colors) ────────────────

const BAMBU_COLOR_NAMES: Record<string, string> = {
  "FFFFFF": "White",
  "000000": "Black",
  "FF0000": "Red",
  "00FF00": "Green",
  "0000FF": "Blue",
  "FFFF00": "Yellow",
  "FF6600": "Orange",
  "FF00FF": "Magenta",
  "00FFFF": "Cyan",
  "808080": "Grey",
  "C0C0C0": "Silver",
  "A0522D": "Brown",
  "FFC0CB": "Pink",
  "800080": "Purple",
  "00FF80": "Jade",
  "1E90FF": "Blue (Light)",
  "B0C4DE": "Steel Blue",
  "F5F5DC": "Beige",
  "FFD700": "Gold",
};

function bambuColorName(hex: string): string {
  const upper = hex.toUpperCase().slice(0, 6);
  if (BAMBU_COLOR_NAMES[upper]) return BAMBU_COLOR_NAMES[upper];
  // Fallback: "#{hex}" shorthand
  return `#${upper}`;
}

/** Derive a human-friendly filament name from tray_type + bambu_idx */
function bambuFilamentName(trayType: string, bambuIdx: string): string {
  // Known Bambu product lines by prefix
  if (bambuIdx.startsWith("GFA")) return `${trayType} Basic`;
  if (bambuIdx.startsWith("GFB")) return `${trayType} Matte`;
  if (bambuIdx.startsWith("GFC")) return `${trayType} Silk`;
  if (bambuIdx.startsWith("GFT")) return `${trayType} Translucent`;
  if (bambuIdx.startsWith("GFN")) return `${trayType} Tough`;
  if (bambuIdx.startsWith("GFG")) return `${trayType} Galaxy`;
  if (bambuIdx.startsWith("GFX")) return `${trayType} Support`;
  return trayType || "Filament";
}

/**
 * Auto-create a Bambu Lab spool for a known RFID tag that has no match.
 * Returns the new spool ID or null on failure.
 */
async function autoCreateBambuSpool(
  tagUid: string,
  bambuIdx: string,
  trayType: string,
  trayColor: string,
  slotDef: (typeof SLOT_DEFS)[number],
): Promise<string | null> {
  try {
    // Guard: don't create if tag_mapping already exists (race-condition safety)
    const existingMapping = await db.query.tagMappings.findFirst({
      where: eq(tagMappings.tagUid, tagUid),
    });
    if (existingMapping) return existingMapping.spoolId;

    // 1. Find or create "Bambu Lab" vendor
    let bambuVendor = await db.query.vendors.findFirst({
      where: eq(vendors.name, "Bambu Lab"),
    });
    if (!bambuVendor) {
      [bambuVendor] = await db.insert(vendors).values({ name: "Bambu Lab" }).returning();
    }

    // 2. Find or create filament by bambu_idx + color
    const colorHex = trayColor.slice(0, 6).toUpperCase();
    const filamentName = bambuFilamentName(trayType, bambuIdx);
    const colorName = bambuColorName(colorHex);

    let filament = bambuIdx
      ? await db.query.filaments.findFirst({
          where: and(
            eq(filaments.bambuIdx, bambuIdx),
            eq(filaments.colorHex, colorHex),
          ),
        })
      : null;

    if (!filament) {
      // Also try matching by vendor + name + color (uq_filaments_vendor_name_color)
      filament = await db.query.filaments.findFirst({
        where: and(
          eq(filaments.vendorId, bambuVendor.id),
          eq(filaments.name, filamentName),
          eq(filaments.colorHex, colorHex),
        ),
      });
    }

    if (!filament) {
      [filament] = await db.insert(filaments).values({
        vendorId: bambuVendor.id,
        name: filamentName,
        material: trayType || "PLA",
        colorHex,
        colorName,
        bambuIdx: bambuIdx || null,
        spoolWeight: 1000,
      }).returning();
    }

    // 3. Create spool
    const locationMap: Record<string, string> = {
      ams: "ams",
      ams_ht: "ams-ht",
      external: "external",
    };
    const [spool] = await db.insert(spools).values({
      filamentId: filament.id,
      initialWeight: 1000,
      remainingWeight: 1000,
      status: "active",
      location: locationMap[slotDef.slotType] ?? "ams",
    }).returning();

    // 4. Create tag mapping
    await db.insert(tagMappings).values({
      tagUid,
      spoolId: spool.id,
      source: "bambu",
    });

    console.log(
      `[printer-sync] AUTO-CREATED: Bambu Lab ${filamentName} ${colorName} (tag=${tagUid.slice(0, 8)}... bambu_idx=${bambuIdx})`
    );

    return spool.id;
  } catch (error) {
    console.error("[printer-sync] autoCreateBambuSpool error:", error);
    return null;
  }
}

/**
 * Auto-create a draft spool for an unmatched non-Bambu slot (no RFID).
 * Draft spools need user review before becoming active.
 * Returns the new spool ID or null on failure.
 */
async function autoCreateDraftSpool(
  trayType: string,
  trayColor: string,
  slotDef: (typeof SLOT_DEFS)[number],
): Promise<string | null> {
  try {
    // 1. Find or create "Unknown" vendor
    let unknownVendor = await db.query.vendors.findFirst({
      where: eq(vendors.name, "Unknown"),
    });
    if (!unknownVendor) {
      [unknownVendor] = await db.insert(vendors).values({ name: "Unknown" }).returning();
    }

    // 2. Find or create a generic filament for this material + color
    const colorHex = trayColor.slice(0, 6).toUpperCase() || "888888";
    const material = trayType || "Unknown";

    let filament = await db.query.filaments.findFirst({
      where: and(
        eq(filaments.vendorId, unknownVendor.id),
        eq(filaments.name, material),
        eq(filaments.colorHex, colorHex),
      ),
    });

    if (!filament) {
      [filament] = await db.insert(filaments).values({
        vendorId: unknownVendor.id,
        name: material,
        material,
        colorHex,
        colorName: bambuColorName(colorHex),
        spoolWeight: 1000,
      }).returning();
    }

    // 3. Create draft spool
    const locationMap: Record<string, string> = {
      ams: "ams",
      ams_ht: "ams-ht",
      external: "external",
    };
    const [spool] = await db.insert(spools).values({
      filamentId: filament.id,
      initialWeight: 1000,
      remainingWeight: 1000,
      status: "draft",
      location: locationMap[slotDef.slotType] ?? "ams",
    }).returning();

    console.log(
      `[printer-sync] DRAFT-CREATED: Unknown ${material} ${colorHex} in ${slotDef.slotType} slot ${slotDef.trayIndex + 1} (spool=${spool.id})`
    );

    return spool.id;
  } catch (error) {
    console.error("[printer-sync] autoCreateDraftSpool error:", error);
    return null;
  }
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

/**
 * Create print_usage record: link print to spool, deduct weight, calculate cost.
 * Uses the stored activeSpoolId from the print record (captured while printing),
 * NOT the current sync payload (which is cleared by the printer when it goes idle).
 */
async function createPrintUsage(
  printId: string,
  _printerId: string,
  weightUsed: number,
) {
  try {
    // Get the stored active spool from the print record
    const print = await db.query.prints.findFirst({
      where: eq(prints.id, printId),
    });

    const spoolId = print?.activeSpoolId;
    if (!spoolId) {
      console.log(`[printer-sync] No activeSpoolId stored on print, skipping usage record`);
      return;
    }

    // Get the spool to calculate cost
    const spool = await db.query.spools.findFirst({
      where: eq(spools.id, spoolId),
      with: { filament: true },
    });
    if (!spool) return;

    // Calculate cost: (weight_used / initial_weight) * purchase_price
    let cost: string | null = null;
    if (spool.purchasePrice && spool.initialWeight > 0) {
      const pricePerGram = Number(spool.purchasePrice) / spool.initialWeight;
      cost = (pricePerGram * weightUsed).toFixed(2);
    }

    // Check for existing usage record (idempotency)
    const existing = await db.query.printUsage.findFirst({
      where: eq(printUsage.printId, printId),
    });
    if (existing) return;

    // Create usage record
    await db.insert(printUsage).values({
      printId,
      spoolId,
      weightUsed,
      cost,
    });

    // Deduct weight from spool
    const newWeight = Math.max(0, spool.remainingWeight - weightUsed);
    await db.update(spools).set({
      remainingWeight: newWeight,
      status: newWeight <= 0 ? "empty" : "active",
      updatedAt: new Date(),
    }).where(eq(spools.id, spoolId));

    // Update total cost on print
    await db.update(prints).set({
      totalCost: cost,
      updatedAt: new Date(),
    }).where(eq(prints.id, printId));

    console.log(`[printer-sync] USAGE: spool=${spool.filament.name} weight=${weightUsed}g cost=${cost}€ remaining=${newWeight}g`);
  } catch (error) {
    console.error("[printer-sync] Error creating print usage:", error);
  }
}

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
      // New print started — no running print exists, so create one.
      // Use a unique event ID: if a finished print with the same name+date exists,
      // append a counter to make the ID unique.
      let haEventId = buildEventId(printName || "unknown", printer_id);
      const existingCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(prints)
        .where(sql`${prints.haEventId} LIKE ${haEventId + '%'}`);
      if (existingCount[0].count > 0) {
        haEventId = `${haEventId}_${existingCount[0].count + 1}`;
      }

      // Try to identify active spool at print start
      let startActiveSpoolId: string | null = null;
      const startTag = str(body.active_slot_tag);
      if (startTag && startTag !== "0000000000000000") {
        const startMatch = await matchSpool({
          tag_uid: startTag,
          tray_info_idx: str(body.active_slot_filament_id) || undefined,
          tray_type: str(body.active_slot_type) || undefined,
          tray_color: str(body.active_slot_color).replace("#", "").slice(0, 8) || undefined,
          printer_id,
          ams_index: 0,
          tray_index: 0,
        });
        if (startMatch.match) startActiveSpoolId = startMatch.match.spool_id;
      }

      const [newPrint] = await db
        .insert(prints)
        .values({
          printerId: printer_id,
          name: printName || null,
          status: "running",
          startedAt: new Date(),
          totalLayers: printLayersTotal || null,
          printWeight: printWeight || null,
          activeSpoolId: startActiveSpoolId,
          haEventId,
        })
        .returning();
      affectedPrintId = newPrint.id;
      printTransition = "started";
      console.log(`[printer-sync] STARTED: "${printName}" id=${newPrint.id} event=${haEventId}`);
    } else if (runningPrint && (isFinished || (isIdle && !printError))) {
      // Print completed (or idle = missed finish)
      const finalWeight = printWeight || runningPrint.printWeight;
      await db.update(prints).set({
        status: "finished",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        printWeight: finalWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "finished";

      // Create print_usage record and deduct weight from active spool
      await createPrintUsage(runningPrint.id, printer_id, finalWeight || 0);

      console.log(`[printer-sync] FINISHED: "${runningPrint.name}" weight=${finalWeight}g`);
    } else if (runningPrint && isFailed) {
      // Print failed/cancelled — still record partial usage
      const finalWeight = printWeight || runningPrint.printWeight;
      await db.update(prints).set({
        status: "failed",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        printWeight: finalWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "failed";

      if (finalWeight && finalWeight > 0) {
        await createPrintUsage(runningPrint.id, printer_id, finalWeight);
      }

      console.log(`[printer-sync] FAILED: "${runningPrint.name}"`);
    } else if (runningPrint && isActive) {
      // Still running — update weight and track active spool
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (printWeight > 0) updates.printWeight = printWeight;

      // Store the active spool ID on the print while we still have the data
      // (the printer clears active_slot when it goes idle)
      const activeTag = str(body.active_slot_tag);
      if (activeTag && activeTag !== "0000000000000000") {
        const activeMatch = await matchSpool({
          tag_uid: activeTag,
          tray_info_idx: str(body.active_slot_filament_id) || undefined,
          tray_type: str(body.active_slot_type) || undefined,
          tray_color: str(body.active_slot_color).replace("#", "").slice(0, 8) || undefined,
          printer_id,
          ams_index: 0,
          tray_index: 0,
        });
        if (activeMatch.match) {
          updates.activeSpoolId = activeMatch.match.spool_id;
        }
      }

      await db.update(prints).set(updates).where(eq(prints.id, runningPrint.id));
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

      // Feature 1: Auto-create Bambu Lab spool for unmatched non-zero RFID tags
      if (!matchedSpoolId && !isEmpty && tagUid && tagUid !== "0000000000000000" && tagUid.length > 8) {
        matchedSpoolId = await autoCreateBambuSpool(tagUid, filamentId, trayType, trayColor, def);
      }

      // Feature 2: Auto-create draft spool for unmatched slots with no RFID (third-party filament)
      if (!matchedSpoolId && !isEmpty && trayType && (!tagUid || tagUid === "0000000000000000")) {
        matchedSpoolId = await autoCreateDraftSpool(trayType, trayColor, def);
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

    const responseData = {
      synced: true,
      print_state: rawState,
      print_state_raw: str(body.print_state),
      print_error: printError,
      print_transition: printTransition,
      print_id: affectedPrintId,
      slots_updated: slotsUpdated,
      timestamp: new Date().toISOString(),
    };

    // Invalidate cached pages when state changes
    if (printTransition !== "none") {
      revalidatePath("/");        // Dashboard
      revalidatePath("/prints");  // Print history
      revalidatePath("/ams");     // AMS slots
      revalidatePath("/spools");  // Spools (weight changes)
    }
    if (slotsUpdated > 0) {
      revalidatePath("/");        // Dashboard AMS mini view
      revalidatePath("/ams");     // AMS page
    }

    // Log this sync for the admin dashboard
    await db.insert(syncLog).values({
      printerId: printer_id,
      rawState: str(body.print_state),
      normalizedState: rawState,
      printTransition,
      printName: printName || null,
      printError,
      slotsUpdated,
      responseJson: JSON.stringify({ request: body, response: responseData }),
    }).catch(() => {}); // fire-and-forget, don't fail the sync

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("POST /api/v1/events/printer-sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
