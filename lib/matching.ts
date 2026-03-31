import { db } from "@/lib/db";
import { spools, tagMappings, amsSlots } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
}

export interface MatchCandidate {
  spool_id: string;
  filament_name: string;
  vendor_name: string;
  material: string;
  color_hex: string | null;
  remaining_weight: number;
  confidence: number;
  match_method: "rfid_exact" | "bambu_idx_exact" | "fuzzy";
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
const HIGH_CONFIDENCE_THRESHOLD = 0.95;
const MIN_CONFIDENCE_THRESHOLD = 0.2;

// ─── Main Matching Function ─────────────────────────────────────────────────

export async function matchSpool(
  request: MatchRequest,
  weights: MatchWeights = DEFAULT_WEIGHTS
): Promise<MatchResponse> {
  // Tier 1a: RFID exact match
  if (request.tag_uid && request.tag_uid !== NO_TAG) {
    const rfidMatch = await matchByRfid(request.tag_uid);
    if (rfidMatch) {
      return { match: rfidMatch, candidates: [] };
    }
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

  // Tier 2: Fuzzy match
  const candidates = await fuzzyMatch(request, weights);

  const match = candidates.length > 0 ? candidates[0] : null;

  // If top match is very high confidence, return it directly
  if (match && match.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return { match, candidates: candidates.slice(1, 6) };
  }

  return {
    match,
    candidates: candidates.slice(1, 6),
  };
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

  const scored: MatchCandidate[] = [];

  for (const spool of allSpools) {
    let score = 0;
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
        score += weights.material;
        reasons.push(`material match: ${request.tray_type}`);
      }
    }

    // 3. Color distance (0-25 points)
    if (requestColor && spool.filament.colorHex) {
      const de = deltaEHex(requestColor, spool.filament.colorHex);
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
        spool_id: spool.id,
        filament_name: spool.filament.name,
        vendor_name: spool.filament.vendor.name,
        material: spool.filament.material,
        color_hex: spool.filament.colorHex,
        remaining_weight: spool.remainingWeight,
        confidence: Math.round(confidence * 100) / 100,
        match_method: "fuzzy",
        match_reasons: reasons,
      });
    }
  }

  // Sort by confidence descending, then by creation date (oldest first) for ties
  scored.sort((a, b) => b.confidence - a.confidence);

  return scored;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalize Bambu color format (RRGGBBAA → RRGGBB) */
export function normalizeColor(color?: string): string | null {
  if (!color) return null;
  const clean = color.replace("#", "");
  // Bambu sends RRGGBBAA, we only need RRGGBB
  return clean.slice(0, 6);
}
