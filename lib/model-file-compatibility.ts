/**
 * Compatibility check between a 3MF's required filaments and the current spool
 * inventory. Used by GET /api/v1/models/[id] and the Pre-Print-Modal.
 *
 * Match strategy (in order of strength):
 *   1. trayInfoIdx (e.g. "GFA00") → exact match on `filaments.bambuIdx`
 *   2. type + colorHex → match on `filaments.material` (case-insensitive) + colorHex (uppercase)
 *
 * Returns one entry per filament slot in the model, with all currently-active
 * spools that satisfy it, sorted: AMS first (any printer), then storage with
 * highest remaining weight.
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { spools, modelFileFilaments, amsSlots } from "./db/schema";

export interface CompatibilitySpool {
  spoolId: string;
  filamentId: string;
  filamentName: string;
  vendorName: string;
  colorHex: string | null;
  remainingWeight: number;
  location: string;
  inAms: boolean;
  matchedBy: "trayInfoIdx" | "type+color";
}

export interface CompatibilityEntry {
  filamentSlotId: string;       // model_file_filaments.id
  plateIndex: number;
  sequenceId: number;
  required: {
    trayInfoIdx: string | null;
    type: string | null;
    colorHex: string | null;
    usedGrams: number | null;
  };
  matches: CompatibilitySpool[];
}

export async function computeCompatibility(modelFileId: string): Promise<CompatibilityEntry[]> {
  const slots = await db.select().from(modelFileFilaments).where(eq(modelFileFilaments.modelFileId, modelFileId));
  if (slots.length === 0) return [];

  // Pull the spool universe once: active spools with their filament + vendor.
  const allSpools = await db.query.spools.findMany({
    where: eq(spools.status, "active"),
    with: { filament: { with: { vendor: true } } },
  });

  // AMS spool IDs across every printer (used to mark inAms+sort).
  const amsRows = await db.select({ spoolId: amsSlots.spoolId }).from(amsSlots);
  const amsSpoolIds = new Set<string>(amsRows.map((r) => r.spoolId).filter((id): id is string => !!id));

  return slots.map((slot) => {
    const matches: CompatibilitySpool[] = [];
    for (const s of allSpools) {
      const f = s.filament;
      if (!f) continue;
      let matchedBy: CompatibilitySpool["matchedBy"] | null = null;
      if (slot.trayInfoIdx && f.bambuIdx && slot.trayInfoIdx === f.bambuIdx) {
        matchedBy = "trayInfoIdx";
      } else if (
        slot.filamentType &&
        slot.colorHex &&
        f.material?.toUpperCase() === slot.filamentType.toUpperCase() &&
        f.colorHex?.toUpperCase() === slot.colorHex.toUpperCase()
      ) {
        matchedBy = "type+color";
      }
      if (matchedBy) {
        matches.push({
          spoolId: s.id,
          filamentId: f.id,
          filamentName: f.name,
          vendorName: f.vendor?.name ?? "",
          colorHex: f.colorHex ?? null,
          remainingWeight: s.remainingWeight,
          location: s.location ?? "storage",
          inAms: amsSpoolIds.has(s.id),
          matchedBy,
        });
      }
    }
    matches.sort((a, b) => {
      if (a.inAms !== b.inAms) return a.inAms ? -1 : 1;
      return b.remainingWeight - a.remainingWeight;
    });
    return {
      filamentSlotId: slot.id,
      plateIndex: slot.plateIndex,
      sequenceId: slot.sequenceId,
      required: {
        trayInfoIdx: slot.trayInfoIdx,
        type: slot.filamentType,
        colorHex: slot.colorHex,
        usedGrams: slot.usedGrams,
      },
      matches,
    };
  });
}

