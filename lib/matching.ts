import { db } from "@/lib/db";
import { spools, tagMappings, amsSlots } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { deltaEHex } from "@/lib/color";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchRequest {
  tag_uid?: string;
  tray_info_idx?: string;
  tray_type?: string;
  tray_color?: string; // RRGGBBAA or RRGGBB
  tray_sub_brands?: string;
  printer_id?: string;
  ams_index?: number;
  tray_index?: number;
  /** Printer's remaining-% estimate; required to learn an unknown tag. */
  remain?: number;
}

export interface MatchCandidate {
  spool_id: string;
  filament_name: string;
  vendor_name: string;
  material: string;
  color_hex: string | null;
  remaining_weight: number;
  confidence: number;
  /**
   * - rfid_exact: tag_uid is mapped to this spool
   * - rfid_learn: tag_uid is unknown; this is the single untagged spool that
   *   strictly matches (bambu_idx + material + colour + weight vs remain%).
   *   Callers that persist state should
   *   insert the tag mapping so the next sync is an rfid_exact hit.
   */
  match_method: "rfid_exact" | "rfid_learn" | "bambu_idx_exact" | "fuzzy";
  match_reasons: string[];
}

export interface MatchResponse {
  match: MatchCandidate | null;
  candidates: MatchCandidate[];
}

// ─── Configurable Weights ───────────────────────────────────────────────────

export interface MatchWeights {
  bambu_idx: number;
  material: number;
  color: number;
  vendor: number;
  location: number;
}

const DEFAULT_WEIGHTS: MatchWeights = {
  bambu_idx: 40,
  material: 20,
  color: 25,
  vendor: 10,
  location: 5,
};

// ─── Constants ──────────────────────────────────────────────────────────────

const NO_TAG = "0000000000000000";
const MIN_CONFIDENCE_THRESHOLD = 0.2;

// ─── Main Matching Function ─────────────────────────────────────────────────

export async function matchSpool(
  request: MatchRequest,
  weights: MatchWeights = DEFAULT_WEIGHTS
): Promise<MatchResponse> {
  const boundElsewhere = await spoolsBoundToOtherSlots(request);

  // Tier 1a: RFID exact match
  if (isRealTag(request.tag_uid)) {
    const rfidMatch = await matchByRfid(request.tag_uid);
    if (rfidMatch) {
      return { match: rfidMatch, candidates: [] };
    }
    // A real tag the DB doesn't know is a strong identity signal: it is a
    // specific physical spool. Only let it claim an untagged spool that
    // strictly matches; otherwise return no match so the caller
    // auto-creates. Never fall through to slot-binding or fuzzy — that is
    // how one spool ended up bound to three different trays.
    const learned = await matchUnknownTag(request, boundElsewhere);
    return { match: learned, candidates: [] };
  }

  // Tier 1b: Bambu filament index + AMS slot exact match
  if (request.tray_info_idx && request.printer_id != null && request.ams_index != null && request.tray_index != null) {
    const slotMatch = await matchBySlotAndIdx(
      request.printer_id,
      request.ams_index,
      request.tray_index,
      request.tray_info_idx
    );
    if (slotMatch) {
      return { match: slotMatch, candidates: [] };
    }
  }

  // Tier 2: Fuzzy match — a spool already loaded in another slot can't be here
  const candidates = (await fuzzyMatch(request, weights)).filter(
    (c) => !boundElsewhere.has(c.spool_id)
  );

  return {
    match: candidates[0] ?? null,
    candidates: candidates.slice(1, 6),
  };
}

/** True for a real RFID tag (Bambu sends 16 zeros when there is none). */
export function isRealTag(tagUid: string | undefined | null): tagUid is string {
  return !!tagUid && tagUid !== NO_TAG && /[1-9A-Fa-f]/.test(tagUid);
}

/**
 * Spool IDs bound to any slot other than the one being matched. Empty when
 * the request carries no slot coordinates (e.g. the /match lookup API).
 */
async function spoolsBoundToOtherSlots(request: MatchRequest): Promise<Set<string>> {
  if (request.printer_id == null || request.ams_index == null || request.tray_index == null) {
    return new Set();
  }
  const bound = await db.query.amsSlots.findMany({
    where: isNotNull(amsSlots.spoolId),
    columns: { spoolId: true, printerId: true, amsIndex: true, trayIndex: true },
  });
  const ids = new Set<string>();
  for (const s of bound) {
    const isThisSlot =
      s.printerId === request.printer_id &&
      s.amsIndex === request.ams_index &&
      s.trayIndex === request.tray_index;
    if (!isThisSlot && s.spoolId) ids.add(s.spoolId);
  }
  return ids;
}

// ─── Tier 1a: RFID Exact Match ──────────────────────────────────────────────

async function matchByRfid(tagUid: string): Promise<MatchCandidate | null> {
  const result = await db.query.tagMappings.findFirst({
    where: eq(tagMappings.tagUid, tagUid),
    with: {
      spool: {
        with: {
          filament: {
            with: { vendor: true },
          },
        },
      },
    },
  });

  if (!result?.spool) return null;

  const spool = result.spool;
  return {
    spool_id: spool.id,
    filament_name: spool.filament.name,
    vendor_name: spool.filament.vendor.name,
    material: spool.filament.material,
    color_hex: spool.filament.colorHex,
    remaining_weight: spool.remainingWeight,
    confidence: 1.0,
    match_method: "rfid_exact",
    match_reasons: [`RFID tag ${tagUid} matched`],
  };
}

// ─── Tier 1c: Unknown RFID → learn onto a strictly-matching untagged spool ─

/** Max ΔE between Bambu's tray colour and the stored filament colour for a
 *  tag to be learned. Bambu reports Matte Charcoal as 000000 while users
 *  often store 1C1C1C (ΔE≈10); Bone White vs Ivory White is ΔE≈21. */
export const LEARN_MAX_DELTA_E = 15;

export interface LearnCandidate {
  spoolId: string;
  bambuIdx: string | null;
  material: string;
  colorHex: string | null;
  initialWeight: number;
  remainingWeight: number;
  hasTag: boolean;
  boundElsewhere: boolean;
  boundToThisSlot: boolean;
}

/** Max |stored weight − initial × remain%| as a fraction of initial weight.
 *  A full 1000 g rack spool must not be learned onto a tray at 55 %. */
export const LEARN_MAX_WEIGHT_GAP = 0.1;

/**
 * Pick the untagged spool an unknown RFID tag should be learned onto, or
 * null. Learning moves the spool (often out of a rack), so it must be
 * unambiguous: exact bambu_idx + material, ΔE < LEARN_MAX_DELTA_E, weight
 * within LEARN_MAX_WEIGHT_GAP of the printer's remain%, and exactly ONE
 * such candidate. The current slot binding is not evidence — it may itself
 * be the product of an earlier bad match. Null → caller auto-creates.
 */
export function pickLearnCandidate(
  candidates: LearnCandidate[],
  tray: { bambuIdx?: string; material?: string; color?: string; remain?: number }
): LearnCandidate | null {
  const color = normalizeColor(tray.color);
  const { remain } = tray;
  if (!tray.bambuIdx || !tray.material || !color) return null;
  if (remain == null || remain < 0 || remain > 100) return null;

  // A spool bound to this slot AND others is a duplicate binding (all are
  // suspect) — don't let the other bindings disqualify it here.
  const eligible = candidates
    .filter((c) => !c.hasTag && (c.boundToThisSlot || !c.boundElsewhere))
    .filter((c) => c.bambuIdx === tray.bambuIdx)
    .filter((c) => c.material.toLowerCase() === tray.material!.toLowerCase())
    .filter((c) => c.colorHex && deltaEHex(color, c.colorHex) < LEARN_MAX_DELTA_E)
    .filter(
      (c) =>
        c.initialWeight > 0 &&
        Math.abs(c.remainingWeight - (c.initialWeight * remain) / 100) <=
          c.initialWeight * LEARN_MAX_WEIGHT_GAP
    );

  return eligible.length === 1 ? eligible[0] : null;
}

async function matchUnknownTag(
  request: MatchRequest,
  boundElsewhere: Set<string>
): Promise<MatchCandidate | null> {
  if (!request.tray_info_idx) return null;

  const [rows, tagged, thisSlot] = await Promise.all([
    db.query.spools.findMany({
      where: eq(spools.status, "active"),
      with: { filament: { with: { vendor: true } } },
    }),
    db.query.tagMappings.findMany({ columns: { spoolId: true } }),
    request.printer_id != null && request.ams_index != null && request.tray_index != null
      ? db.query.amsSlots.findFirst({
          where: and(
            eq(amsSlots.printerId, request.printer_id),
            eq(amsSlots.amsIndex, request.ams_index),
            eq(amsSlots.trayIndex, request.tray_index)
          ),
          columns: { spoolId: true },
        })
      : Promise.resolve(undefined),
  ]);
  const taggedIds = new Set(tagged.map((t) => t.spoolId));

  const picked = pickLearnCandidate(
    rows.map((s) => ({
      spoolId: s.id,
      bambuIdx: s.filament.bambuIdx,
      material: s.filament.material,
      colorHex: s.filament.colorHex,
      initialWeight: s.initialWeight,
      remainingWeight: s.remainingWeight,
      hasTag: taggedIds.has(s.id),
      boundElsewhere: boundElsewhere.has(s.id),
      boundToThisSlot: thisSlot?.spoolId === s.id,
    })),
    {
      bambuIdx: request.tray_info_idx,
      material: request.tray_type,
      color: request.tray_color,
      remain: request.remain,
    }
  );
  if (!picked) return null;

  const spool = rows.find((s) => s.id === picked.spoolId)!;
  return {
    spool_id: spool.id,
    filament_name: spool.filament.name,
    vendor_name: spool.filament.vendor.name,
    material: spool.filament.material,
    color_hex: spool.filament.colorHex,
    remaining_weight: spool.remainingWeight,
    confidence: 0.9,
    match_method: "rfid_learn",
    match_reasons: [
      `RFID tag ${request.tag_uid} unknown`,
      `single untagged spool matches bambu_idx ${request.tray_info_idx} + material + colour + weight`,
    ],
  };
}

// ─── Tier 1b: Bambu Index + AMS Slot Match ──────────────────────────────────

async function matchBySlotAndIdx(
  printerId: string,
  amsIndex: number,
  trayIndex: number,
  trayInfoIdx: string
): Promise<MatchCandidate | null> {
  const slot = await db.query.amsSlots.findFirst({
    where: and(
      eq(amsSlots.printerId, printerId),
      eq(amsSlots.amsIndex, amsIndex),
      eq(amsSlots.trayIndex, trayIndex)
    ),
    with: {
      spool: {
        with: {
          filament: {
            with: { vendor: true },
          },
        },
      },
    },
  });

  if (!slot?.spool?.filament) return null;

  // Verify the filament's bambu_idx matches
  if (slot.spool.filament.bambuIdx === trayInfoIdx) {
    return {
      spool_id: slot.spool.id,
      filament_name: slot.spool.filament.name,
      vendor_name: slot.spool.filament.vendor.name,
      material: slot.spool.filament.material,
      color_hex: slot.spool.filament.colorHex,
      remaining_weight: slot.spool.remainingWeight,
      confidence: 0.95,
      match_method: "bambu_idx_exact",
      match_reasons: [
        `AMS slot ${amsIndex}:${trayIndex} has spool assigned`,
        `Bambu idx ${trayInfoIdx} matches filament`,
      ],
    };
  }

  return null;
}

// ─── Tier 2: Fuzzy Match ────────────────────────────────────────────────────

async function fuzzyMatch(
  request: MatchRequest,
  weights: MatchWeights
): Promise<MatchCandidate[]> {
  // Get all active spools with their filament and vendor
  const allSpools = await db.query.spools.findMany({
    where: eq(spools.status, "active"),
    with: {
      filament: {
        with: { vendor: true },
      },
    },
  });

  const maxScore = weights.bambu_idx + weights.material + weights.color + weights.vendor + weights.location;
  const requestColor = normalizeColor(request.tray_color);

  const scored: FuzzyScored[] = [];

  for (const spool of allSpools) {
    let score = 0;
    let de: number | null = null;
    let materialMatch = false;
    const reasons: string[] = [];

    // 1. Bambu filament index match (0-40 points)
    if (request.tray_info_idx && spool.filament.bambuIdx) {
      if (spool.filament.bambuIdx === request.tray_info_idx) {
        score += weights.bambu_idx;
        reasons.push(`bambu_idx exact match: ${request.tray_info_idx}`);
      } else if (
        spool.filament.bambuIdx.slice(0, 3) === request.tray_info_idx.slice(0, 3)
      ) {
        score += weights.bambu_idx * 0.3;
        reasons.push(`bambu_idx product line match: ${request.tray_info_idx.slice(0, 3)}`);
      }
    }

    // 2. Material type match (0-20 points)
    if (request.tray_type) {
      if (spool.filament.material.toLowerCase() === request.tray_type.toLowerCase()) {
        materialMatch = true;
        score += weights.material;
        reasons.push(`material match: ${request.tray_type}`);
      }
    }

    // 3. Color distance (0-25 points)
    if (requestColor && spool.filament.colorHex) {
      de = deltaEHex(requestColor, spool.filament.colorHex);
      if (de < 2.3) {
        score += weights.color;
        reasons.push(`color imperceptible (ΔE=${de.toFixed(1)})`);
      } else if (de < 5) {
        score += weights.color * 0.8;
        reasons.push(`color close (ΔE=${de.toFixed(1)})`);
      } else if (de < 10) {
        score += weights.color * 0.4;
        reasons.push(`color perceptible (ΔE=${de.toFixed(1)})`);
      } else if (de < 20) {
        score += weights.color * 0.1;
        reasons.push(`color different (ΔE=${de.toFixed(1)})`);
      }
      // de >= 20: totally different, 0 points
    }

    // 4. Vendor keyword match (0-10 points)
    if (request.tray_sub_brands && spool.filament.vendor.name) {
      if (
        request.tray_sub_brands
          .toLowerCase()
          .includes(spool.filament.vendor.name.toLowerCase())
      ) {
        score += weights.vendor;
        reasons.push(`vendor match: ${spool.filament.vendor.name}`);
      }
    }

    // 5. Location bonus (0-5 points)
    if (spool.location === "ams" || spool.location === "ams-ht") {
      score += weights.location;
      reasons.push("spool is in AMS");
    }

    const confidence = score / maxScore;

    if (confidence >= MIN_CONFIDENCE_THRESHOLD) {
      scored.push({
        de,
        materialMatch,
        inRack: isRackLocation(spool.location),
        candidate: {
          spool_id: spool.id,
          filament_name: spool.filament.name,
          vendor_name: spool.filament.vendor.name,
          material: spool.filament.material,
          color_hex: spool.filament.colorHex,
          remaining_weight: spool.remainingWeight,
          confidence: Math.round(confidence * 100) / 100,
          match_method: "fuzzy",
          match_reasons: reasons,
        },
      });
    }
  }

  return applyFuzzyGuards(scored)
    .map((x) => x.candidate)
    .sort((a, b) => b.confidence - a.confidence);
}

// ─── Fuzzy guards (untagged trays) ──────────────────────────────────────────

/** Fuzzy candidates need real colour evidence; material alone never counts. */
export const FUZZY_MAX_DELTA_E = 10;
/** A rack spool is only taken on a strong match — the rack is user-managed. */
export const FUZZY_RACK_MAX_DELTA_E = 5;

export interface FuzzyScored {
  candidate: MatchCandidate;
  /** ΔE tray vs filament colour; null when either colour is unknown. */
  de: number | null;
  materialMatch: boolean;
  inRack: boolean;
}

export function isRackLocation(location: string | null | undefined): boolean {
  return !!location && location.startsWith("rack:");
}

/**
 * Drop fuzzy candidates that would bind on weak evidence:
 * - no colour evidence (ΔE unknown or ≥ FUZZY_MAX_DELTA_E) — a material-only
 *   score of 0.20 once pulled a Pink PLA out of the rack for a grey tray
 * - rack spools unless material matches, ΔE < FUZZY_RACK_MAX_DELTA_E, and
 *   exactly one rack spool qualifies (never guess which rack slot emptied)
 */
export function applyFuzzyGuards(items: FuzzyScored[]): FuzzyScored[] {
  const coloured = items.filter((x) => x.de != null && x.de < FUZZY_MAX_DELTA_E);
  const strongRack = coloured.filter(
    (x) => x.inRack && x.materialMatch && x.de! < FUZZY_RACK_MAX_DELTA_E
  );
  const rackAllowed = strongRack.length === 1 ? strongRack[0] : null;
  return coloured.filter((x) => !x.inRack || x === rackAllowed);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalize Bambu color format (RRGGBBAA → RRGGBB) */
export function normalizeColor(color?: string): string | null {
  if (!color) return null;
  const clean = color.replace("#", "");
  // Bambu sends RRGGBBAA, we only need RRGGBB
  return clean.slice(0, 6);
}
