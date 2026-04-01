/**
 * Pure helpers extracted from app/api/v1/events/printer-sync/route.ts
 * All functions are side-effect-free and fully unit-testable.
 */

// ── State classification ──────────────────────────────────────────────────────
// Accept both MQTT protocol values AND HA Bambu Lab integration values
// (any case — we normalize to uppercase)
export const ACTIVE_STATES = new Set([
  "RUNNING", "PRINTING", "PREPARE", "SLICING", "PAUSE",
  "DRUCKEN", "VORBEREITEN",  // German variants
  // Bambu Lab calibration/preparation sub-states
  "CALIBRATING_EXTRUSION", "CLEANING_NOZZLE_TIP", "SWEEPING_XY_MECH_MODE",
  "HEATBED_PREHEATING", "NOZZLE_PREHEATING",
  "CHANGE_FILAMENT", "CHANGING_FILAMENT",
  "M400_PAUSE", "FILAMENT_RUNOUT_PAUSE", "FRONT_COVER_PAUSE",
  // Pre-print preparation states (part of the print job)
  "AUTO_BED_LEVELING", "HOMING_TOOLHEAD", "HOMING",
  "CHECKING_EXTRUDER_TEMP", "HEATING", "BED_LEVELING",
  // Temporary connectivity loss — printer is still printing
  "OFFLINE", "UNKNOWN",
]);
export const FINISH_STATES = new Set(["FINISH", "FINISHED", "COMPLETE", "COMPLETED"]);
export const FAILED_STATES = new Set(["FAILED", "CANCELED", "CANCELLED", "ERROR"]);
export const IDLE_STATES = new Set(["IDLE", ""]);

// ── State classifier ──────────────────────────────────────────────────────────

/** Classify a raw state string into one of four categories */
export function classifyState(rawState: string): "active" | "finished" | "failed" | "idle" {
  const upper = rawState.toUpperCase();
  if (ACTIVE_STATES.has(upper)) return "active";
  if (FINISH_STATES.has(upper)) return "finished";
  if (FAILED_STATES.has(upper)) return "failed";
  return "idle";
}

// ── Value parsers ─────────────────────────────────────────────────────────────

/** Parse a string to number, returning the default for any non-numeric value */
export function num(val: unknown, def = 0): number {
  if (val === null || val === undefined || val === "" || val === "None" || val === "unknown" || val === "unavailable") return def;
  const n = Number(val);
  return isNaN(n) ? def : n;
}

/** Parse a string to boolean */
export function bool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const lower = val.toLowerCase().trim();
    return lower === "true" || lower === "on" || lower === "1" || lower === "yes";
  }
  return false;
}

/** Clean a string value — treat HA's "None", "unknown", "unavailable" as empty */
export function str(val: unknown, def = ""): string {
  if (val === null || val === undefined) return def;
  const s = String(val).trim();
  if (s === "None" || s === "unknown" || s === "unavailable" || s === "null") return def;
  return s;
}

// ── Event ID builder ──────────────────────────────────────────────────────────

/** Build a stable ha_event_id from the print name + UTC date */
export function buildEventId(printName: string, printerId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = printName.trim().toLowerCase().replace(/\s+/g, "_");
  return `sync_${printerId.slice(0, 8)}_${date}_${safeName}`.slice(0, 200);
}

// ── Bambu color hex → human-readable name map (common colors) ────────────────

export const BAMBU_COLOR_NAMES: Record<string, string> = {
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

export function bambuColorName(hex: string): string {
  const upper = hex.toUpperCase().slice(0, 6);
  if (BAMBU_COLOR_NAMES[upper]) return BAMBU_COLOR_NAMES[upper];
  // Fallback: "#{hex}" shorthand
  return `#${upper}`;
}

// ── Bambu filament name ───────────────────────────────────────────────────────

/** Derive a human-friendly filament name from tray_type + bambu_idx */
// ── Weight sync from AMS remain ───────────────────────────────────────────────

export interface WeightSyncResult {
  shouldUpdate: boolean;
  newWeight: number | null;
  reason: string;
}

/**
 * Determine if a spool's weight should be updated from AMS remain percentage.
 * Returns shouldUpdate=true with newWeight if an update is warranted.
 */
export function calculateWeightSync(params: {
  remain: number;        // AMS remain percentage (0-100, -1 = unknown)
  initialWeight: number; // spool initial weight in grams
  currentWeight: number; // spool current remaining weight in grams
  tagUid: string;        // RFID tag UID (zeros = no RFID)
  isIdle: boolean;       // printer is idle (not printing)
  threshold?: number;    // minimum delta as fraction of initialWeight (default 0.05 = 5%)
}): WeightSyncResult {
  const { remain, initialWeight, currentWeight, tagUid, isIdle, threshold = 0.05 } = params;

  // Rule 1: Only when idle
  if (!isIdle) return { shouldUpdate: false, newWeight: null, reason: "printer_active" };

  // Rule 2: Only Bambu spools (non-zero RFID tag)
  if (!tagUid || tagUid === "0000000000000000" || tagUid.length < 8) {
    return { shouldUpdate: false, newWeight: null, reason: "no_rfid" };
  }

  // Rule 3: Only valid remain
  if (remain < 0 || remain > 100) {
    return { shouldUpdate: false, newWeight: null, reason: "invalid_remain" };
  }

  // Calculate weight from percentage
  if (initialWeight <= 0) {
    return { shouldUpdate: false, newWeight: null, reason: "no_initial_weight" };
  }

  const calculatedWeight = Math.round(initialWeight * (remain / 100));

  // Rule 5: Never increase weight
  if (calculatedWeight >= currentWeight) {
    return { shouldUpdate: false, newWeight: null, reason: "would_increase" };
  }

  // Rule 4: 5% threshold
  const delta = currentWeight - calculatedWeight;
  const minDelta = initialWeight * threshold;
  if (delta < minDelta) {
    return { shouldUpdate: false, newWeight: null, reason: "below_threshold" };
  }

  return { shouldUpdate: true, newWeight: calculatedWeight, reason: "synced" };
}

// ── Bambu filament name ───────────────────────────────────────────────────────

/** Derive a human-friendly filament name from tray_type + bambu_idx */
export function bambuFilamentName(trayType: string, bambuIdx: string): string {
  // Known Bambu product line prefixes
  const prefix = bambuIdx.slice(0, 3).toUpperCase();
  const lineMap: Record<string, string> = {
    GFA: `${trayType} Basic`,      // PLA Basic, PETG Basic
    GFB: trayType,                  // ABS-GF (material IS the line)
    GFC: `${trayType} Silk+`,
    GFG: `${trayType} HF`,         // High Flow (PETG HF, etc.)
    GFL: `${trayType}`,            // Third-party compat codes
    GFN: `${trayType} Tough`,
    GFT: `${trayType} Translucent`,
    GFX: `${trayType} Support`,
  };
  return lineMap[prefix] ?? (trayType || "Filament");
}
