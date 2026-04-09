import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { prints, amsSlots, spools, syncLog, printUsage, vendors, filaments, tagMappings } from "@/lib/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { matchSpool } from "@/lib/matching";
import {
  num, bool, str,
  classifyGcodeState, isCalibrationJob,
  buildEventId, bambuColorName, bambuFilamentName, calculateWeightSync,
} from "@/lib/printer-sync-helpers";
import { sqlCount, sqlNowMinusHours } from "@/lib/db/sql-helpers";

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
    // Guard: check if a spool (draft or active) is already assigned to this slot
    // This prevents creating 100+ duplicate drafts on every 60s sync
    const existingSlot = await db.query.amsSlots.findFirst({
      where: and(
        eq(amsSlots.slotType, slotDef.slotType),
        eq(amsSlots.amsIndex, slotDef.amsIndex),
        eq(amsSlots.trayIndex, slotDef.trayIndex),
      ),
    });
    if (existingSlot?.spoolId) return existingSlot.spoolId;

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
 * Create print_usage records: link print to all spools used, deduct weight, calculate cost.
 * Reads activeSpoolIds (accumulated during print) from the print record.
 * Uses proportional weight distribution based on remain deltas when available.
 * Falls back to equal split if deltas are all zero or unavailable.
 * Falls back to single activeSpoolId for backward compatibility.
 */
async function createPrintUsage(
  printId: string,
  printerId: string,
  totalWeight: number,
  endRemains?: Record<string, number>,
) {
  try {
    const print = await db.query.prints.findFirst({
      where: eq(prints.id, printId),
    });

    // Collect all spool IDs used in this print
    let spoolIds: string[] = [];
    if (print?.activeSpoolIds) {
      try { spoolIds = JSON.parse(print.activeSpoolIds); } catch { /* ignore */ }
    }
    // Fallback to single spool for backward compatibility
    if (spoolIds.length === 0 && print?.activeSpoolId) {
      spoolIds = [print.activeSpoolId];
    }
    if (spoolIds.length === 0) {
      console.log(`[printer-sync] No spool IDs stored on print, skipping usage record`);
      return;
    }

    // ── Proportional weight distribution using remain deltas ──────────────
    let proportionalWeights: Record<string, number> | null = null;

    const startRemains: Record<string, number> = print?.remainSnapshot
      ? (() => { try { return JSON.parse(print.remainSnapshot!); } catch { return {}; } })()
      : {};

    if (Object.keys(startRemains).length > 0 && endRemains && spoolIds.length > 1) {
      const deltas: { spoolId: string; delta: number }[] = [];

      for (const spoolId of spoolIds) {
        // Find which slot this spool is currently in
        const slot = await db.query.amsSlots.findFirst({
          where: and(eq(amsSlots.printerId, printerId), eq(amsSlots.spoolId, spoolId)),
        });
        if (slot) {
          const defKey = SLOT_DEFS.find(
            (d) => d.slotType === slot.slotType && d.amsIndex === slot.amsIndex && d.trayIndex === slot.trayIndex
          )?.key;
          if (defKey && startRemains[defKey] !== undefined && endRemains[defKey] !== undefined) {
            const delta = startRemains[defKey] - endRemains[defKey];
            deltas.push({ spoolId, delta: Math.max(0, delta) });
          } else {
            // Can't compute delta for this spool — push 0 so it can still share via fallback
            deltas.push({ spoolId, delta: 0 });
          }
        } else {
          deltas.push({ spoolId, delta: 0 });
        }
      }

      const totalDelta = deltas.reduce((s, d) => s + d.delta, 0);
      if (totalDelta > 0) {
        proportionalWeights = {};
        for (const d of deltas) {
          proportionalWeights[d.spoolId] = totalWeight * (d.delta / totalDelta);
        }
        console.log(`[printer-sync] PROPORTIONAL: totalDelta=${totalDelta.toFixed(1)}% → ${deltas.map(d => `${d.spoolId.slice(0,8)}=${((d.delta/totalDelta)*100).toFixed(0)}%`).join(", ")}`);
      } else {
        console.log(`[printer-sync] PROPORTIONAL: all deltas zero, falling back to equal split`);
      }
    }

    const getWeightForSpool = (spoolId: string): number => {
      if (proportionalWeights && proportionalWeights[spoolId] !== undefined) {
        return proportionalWeights[spoolId];
      }
      return totalWeight / spoolIds.length;
    };

    let totalCost = 0;

    for (const spoolId of spoolIds) {
      // Idempotency: skip if usage record already exists for this print+spool
      const existing = await db.query.printUsage.findFirst({
        where: and(eq(printUsage.printId, printId), eq(printUsage.spoolId, spoolId)),
      });
      if (existing) continue;

      const spool = await db.query.spools.findFirst({
        where: eq(spools.id, spoolId),
        with: { filament: true },
      });
      if (!spool) continue;

      const weightForSpool = getWeightForSpool(spoolId);

      // Calculate cost: (weight_for_spool / initial_weight) * purchase_price
      let cost: number | null = null;
      if (spool.purchasePrice && spool.initialWeight > 0) {
        const pricePerGram = spool.purchasePrice / spool.initialWeight;
        cost = Math.round(pricePerGram * weightForSpool * 100) / 100;
        totalCost += cost;
      }

      await db.insert(printUsage).values({
        printId,
        spoolId,
        weightUsed: weightForSpool,
        cost,
      });

      const newWeight = Math.max(0, spool.remainingWeight - weightForSpool);
      await db.update(spools).set({
        remainingWeight: newWeight,
        status: newWeight <= 0 ? "empty" : "active",
        updatedAt: new Date(),
      }).where(eq(spools.id, spoolId));

      console.log(`[printer-sync] USAGE: spool=${spool.filament.name} weight=${weightForSpool.toFixed(1)}g cost=${cost}€ remaining=${newWeight}g`);
    }

    // Update total cost on print
    if (totalCost > 0) {
      await db.update(prints).set({
        totalCost: Math.round(totalCost * 100) / 100,
        updatedAt: new Date(),
      }).where(eq(prints.id, printId));
    }
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

    // gcode_state: coarse lifecycle state (10 values, stable)
    // print_state: fine-grained stage (68+ values, for display/spool tracking)
    const gcodeState = str(body.gcode_state).toUpperCase();
    const rawState = str(body.print_state).toUpperCase(); // stg_cur — kept for display
    const printName = str(body.print_name);
    const printWeight = num(body.print_weight);
    const printLayersTotal = num(body.print_layers_total);
    const printLayersCurrent = num(body.print_layers_current);
    const printProgress = num(body.print_progress);
    const printError = bool(body.print_error);

    // Use gcode_state for lifecycle decisions (reliable, 10 values)
    // Fall back to stg_cur classification if gcode_state is not provided (backward compat)
    const lifecycle = gcodeState ? classifyGcodeState(gcodeState) : classifyGcodeState(rawState);

    const isActive = lifecycle === "active";
    const isFinished = lifecycle === "finished";
    const isFailed = lifecycle === "failed";
    const isIdle = lifecycle === "idle";
    // "ambiguous" (OFFLINE, UNKNOWN) → don't change running state

    // Log what we received for debugging
    console.log(`[printer-sync] gcode=${gcodeState} stg=${rawState} lifecycle=${lifecycle} name="${printName}" weight=${printWeight}`);

    // ── 1. Print state transitions ────────────────────────────────────────

    const runningPrint = await db.query.prints.findFirst({
      where: and(eq(prints.printerId, printer_id), eq(prints.status, "running")),
    });

    let printTransition: PrintTransition = "none";
    let affectedPrintId: string | null = runningPrint?.id ?? null;

    if (!runningPrint && isActive && !isCalibrationJob(printName)) {
      // New print started — no running print exists, so create one.
      // Use a unique event ID: if a finished print with the same name+date exists,
      // append a counter to make the ID unique.
      let haEventId = buildEventId(printName || "unknown", printer_id);
      const existingCount = await db.select({ count: sqlCount() })
        .from(prints)
        .where(sql`${prints.haEventId} LIKE ${haEventId + '%'}`);
      if (existingCount[0].count > 0) {
        haEventId = `${haEventId}_${existingCount[0].count + 1}`;
      }

      // Try to identify active spool at print start
      // Use RFID tag if available, otherwise fall back to fuzzy matching (type+color+filament_id)
      let startActiveSpoolId: string | null = null;
      const startTag = str(body.active_slot_tag);
      const startType = str(body.active_slot_type);
      const startColor = str(body.active_slot_color).replace("#", "").slice(0, 8);
      const startFilamentId = str(body.active_slot_filament_id);
      if (startType || (startTag && startTag !== "0000000000000000")) {
        const startMatch = await matchSpool({
          tag_uid: startTag !== "0000000000000000" ? startTag : undefined,
          tray_info_idx: startFilamentId || undefined,
          tray_type: startType || undefined,
          tray_color: startColor || undefined,
          printer_id,
          ams_index: 0,
          tray_index: 0,
        });
        if (startMatch.match) startActiveSpoolId = startMatch.match.spool_id;
      }

      const startIds = startActiveSpoolId ? [startActiveSpoolId] : [];

      // Snapshot remain values for all slots at print start (for proportional weight distribution)
      const remainSnapshot: Record<string, number> = {};
      for (const def of SLOT_DEFS) {
        const remain = num(body[`${def.key}_remain`], -1);
        if (remain >= 0) {
          remainSnapshot[def.key] = remain;
        }
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
          activeSpoolIds: JSON.stringify(startIds),
          remainSnapshot: Object.keys(remainSnapshot).length > 0 ? JSON.stringify(remainSnapshot) : null,
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

      // Build endRemains from current sync payload for proportional weight distribution
      // (slots haven't been updated in DB yet, but we read from the body directly)
      const endRemainsFinish: Record<string, number> = {};
      for (const def of SLOT_DEFS) {
        const remain = num(body[`${def.key}_remain`], -1);
        if (remain >= 0) endRemainsFinish[def.key] = remain;
      }

      // Create print_usage record and deduct weight from active spool
      await createPrintUsage(runningPrint.id, printer_id, finalWeight || 0, endRemainsFinish);

      console.log(`[printer-sync] FINISHED: "${runningPrint.name}" weight=${finalWeight}g`);
    } else if (runningPrint && isFailed) {
      // Print failed/cancelled — record partial usage scaled by progress
      const totalWeight = printWeight || runningPrint.printWeight;
      await db.update(prints).set({
        status: "failed",
        finishedAt: new Date(),
        durationSeconds: runningPrint.startedAt
          ? Math.floor((Date.now() - new Date(runningPrint.startedAt).getTime()) / 1000)
          : null,
        printWeight: totalWeight,
        updatedAt: new Date(),
      }).where(eq(prints.id, runningPrint.id));
      printTransition = "failed";

      if (totalWeight && totalWeight > 0) {
        const endRemainsFailed: Record<string, number> = {};
        for (const def of SLOT_DEFS) {
          const remain = num(body[`${def.key}_remain`], -1);
          if (remain >= 0) endRemainsFailed[def.key] = remain;
        }

        // Scale weight by progress — don't charge full slicer weight for a partial print
        const progress = printProgress > 0 ? printProgress
          : (printLayersCurrent > 0 && printLayersTotal > 0)
            ? (printLayersCurrent / printLayersTotal) * 100
            : null;
        const partialWeight = progress !== null && progress < 100
          ? Math.round(totalWeight * (progress / 100) * 100) / 100
          : totalWeight;

        await createPrintUsage(runningPrint.id, printer_id, partialWeight, endRemainsFailed);
        console.log(`[printer-sync] FAILED: "${runningPrint.name}" progress=${progress ?? "unknown"}% partialWeight=${partialWeight}g (total=${totalWeight}g)`);
      } else {
        console.log(`[printer-sync] FAILED: "${runningPrint.name}" (no weight)`);
      }
    } else if (runningPrint && isActive) {
      // Still running — update weight and track active spool
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (printWeight > 0) updates.printWeight = printWeight;

      // Store the active spool ID on the print while we still have the data
      // (the printer clears active_slot when it goes idle)
      // Use RFID tag if available, otherwise fall back to fuzzy matching
      const activeTag = str(body.active_slot_tag);
      const activeType = str(body.active_slot_type);
      const activeColor = str(body.active_slot_color).replace("#", "").slice(0, 8);
      const activeFilamentId = str(body.active_slot_filament_id);
      if (activeType || (activeTag && activeTag !== "0000000000000000")) {
        const activeMatch = await matchSpool({
          tag_uid: activeTag !== "0000000000000000" ? activeTag : undefined,
          tray_info_idx: activeFilamentId || undefined,
          tray_type: activeType || undefined,
          tray_color: activeColor || undefined,
          printer_id,
          ams_index: 0,
          tray_index: 0,
        });
        if (activeMatch.match) {
          // Still update single activeSpoolId for backward compatibility
          updates.activeSpoolId = activeMatch.match.spool_id;

          // Accumulate all spool IDs seen during this print
          const existingIds: string[] = runningPrint.activeSpoolIds
            ? (() => { try { return JSON.parse(runningPrint.activeSpoolIds); } catch { return []; } })()
            : [];
          if (!existingIds.includes(activeMatch.match.spool_id)) {
            existingIds.push(activeMatch.match.spool_id);
            updates.activeSpoolIds = JSON.stringify(existingIds);
          }
        }
      }

      await db.update(prints).set(updates).where(eq(prints.id, runningPrint.id));
    }
    // runningPrint && isIdle && printError → keep running (waiting for spool swap)

    // ── 2. Update AMS slots (flat key-value) ──────────────────────────────

    let slotsUpdated = 0;
    const weightSyncs: Array<{ spoolId: string; from: number; to: number; remain: number }> = [];

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

      // Move old spool: to surplus if slot became empty (unloaded), to workbench if swapped
      if (existingSlot?.spoolId && existingSlot.spoolId !== matchedSpoolId) {
        const oldSpoolLocation = isEmpty ? "surplus" : "workbench";
        await db.update(spools).set({
          location: oldSpoolLocation,
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

      // Weight sync from AMS remain (only when idle, only Bambu spools)
      if (matchedSpoolId && !isEmpty && remain >= 0) {
        const spool = await db.query.spools.findFirst({
          where: eq(spools.id, matchedSpoolId),
        });
        if (spool) {
          const syncResult = calculateWeightSync({
            remain,
            initialWeight: spool.initialWeight,
            currentWeight: spool.remainingWeight,
            tagUid,
            isIdle,
          });
          if (syncResult.shouldUpdate && syncResult.newWeight !== null) {
            await db.update(spools).set({
              remainingWeight: syncResult.newWeight,
              updatedAt: new Date(),
            }).where(eq(spools.id, matchedSpoolId));
            weightSyncs.push({
              spoolId: matchedSpoolId,
              from: spool.remainingWeight,
              to: syncResult.newWeight,
              remain,
            });
            console.log(`[printer-sync] WEIGHT-SYNC: spool=${matchedSpoolId} ${spool.remainingWeight}g→${syncResult.newWeight}g (remain=${remain}%)`);
          }
        }
      }
    }

    const responseData = {
      synced: true,
      gcode_state: gcodeState,
      print_state: rawState,
      lifecycle,
      print_state_raw: str(body.print_state),
      print_error: printError,
      print_transition: printTransition,
      print_id: affectedPrintId,
      slots_updated: slotsUpdated,
      weight_syncs: weightSyncs,
      timestamp: new Date().toISOString(),
    };

    // Invalidate cached pages when state changes
    if (printTransition !== "none") {
      revalidatePath("/");          // Dashboard
      revalidatePath("/prints");    // Print history
      revalidatePath("/inventory"); // Inventory (AMS + rack)
      revalidatePath("/spools");    // Spools (weight changes)
    }
    if (slotsUpdated > 0) {
      revalidatePath("/");          // Dashboard AMS mini view
      revalidatePath("/inventory"); // Inventory
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

    // Retention: delete sync logs older than 72 hours (run every ~60 syncs ≈ 1 hour)
    if (Math.random() < 0.017) {
      await db.delete(syncLog)
        .where(lt(syncLog.createdAt, sqlNowMinusHours(72)))
        .catch(() => {});
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("POST /api/v1/events/printer-sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
