/**
 * Pure helper functions for the printer-sync endpoint.
 * Extracted for testability — no DB, no side effects.
 */

// ── gcode_state classification (10 coarse states — stable, never changes) ────
// Used for PRINT LIFECYCLE decisions (start/finish/fail)
// Source: Bambu Lab MQTT protocol, sensor.h2s_druckstatus in HA

export const GCODE_ACTIVE = new Set(["RUNNING", "PREPARE", "SLICING", "INIT", "PAUSE"]);
export const GCODE_FINISH = new Set(["FINISH"]);
export const GCODE_FAILED = new Set(["FAILED"]);
export const GCODE_IDLE = new Set(["IDLE"]);
// OFFLINE and UNKNOWN are ambiguous — handled specially (don't change running state)

/** Classify gcode_state into a lifecycle category */
export function classifyGcodeState(raw: string): "active" | "finished" | "failed" | "idle" | "ambiguous" {
  const upper = raw.toUpperCase().trim();
  if (GCODE_ACTIVE.has(upper)) return "active";
  if (GCODE_FINISH.has(upper)) return "finished";
  if (GCODE_FAILED.has(upper)) return "failed";
  if (GCODE_IDLE.has(upper)) return "idle";
  // OFFLINE, UNKNOWN, empty → ambiguous (don't change running state)
  return "ambiguous";
}

// ── stg_cur classification (68+ fine-grained states — grows with firmware) ───
// Used for DISPLAY and ACTIVE SPOOL TRACKING only, NOT for lifecycle decisions
// Source: Bambu Lab MQTT stg_cur, sensor.h2s_aktueller_arbeitsschritt in HA

// Keep the old sets for backward compatibility (used in tests and display logic)
export const ACTIVE_STATES = new Set([
  "RUNNING", "PRINTING", "PREPARE", "SLICING", "PAUSE",
  "DRUCKEN", "VORBEREITEN",
  "CALIBRATING_EXTRUSION", "CLEANING_NOZZLE_TIP", "SWEEPING_XY_MECH_MODE",
  "HEATBED_PREHEATING", "NOZZLE_PREHEATING",
  "CHANGE_FILAMENT", "CHANGING_FILAMENT",
  "M400_PAUSE", "FILAMENT_RUNOUT_PAUSE", "FRONT_COVER_PAUSE",
  "AUTO_BED_LEVELING", "HOMING_TOOLHEAD", "HOMING",
  "CHECKING_EXTRUDER_TEMP", "HEATING", "BED_LEVELING",
  "CALIBRATING_MOTOR_NOISE",
  "OFFLINE", "UNKNOWN",
]);
export const FINISH_STATES = new Set(["FINISH", "FINISHED", "COMPLETE", "COMPLETED"]);
export const FAILED_STATES = new Set(["FAILED", "CANCELED", "CANCELLED", "ERROR"]);
export const IDLE_STATES = new Set(["IDLE", ""]);

/** Legacy classifier — kept for backward compatibility with existing tests/code.
 *  New code should use classifyGcodeState() instead. */
export function classifyState(rawState: string): "active" | "finished" | "failed" | "idle" {
  const upper = rawState.toUpperCase().trim();
  if (ACTIVE_STATES.has(upper)) return "active";
  if (FINISH_STATES.has(upper)) return "finished";
  if (FAILED_STATES.has(upper)) return "failed";
  return "idle";
}

// ── Calibration name filter ──────────────────────────────────────────────────
// Auto-calibration routines are NOT print jobs — don't create records for them

const CALIBRATION_NAMES = ["auto_cali", "auto_calibration", "user_param", "default_param"];

export function isCalibrationJob(printName: string): boolean {
  if (!printName) return false;
  const lower = printName.toLowerCase();
  return CALIBRATION_NAMES.some(c => lower.includes(c));
}

// ── Value parsers ────────────────────────────────────────────────────────────

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

// ── Event ID builder ─────────────────────────────────────────────────────────

/** Build a stable ha_event_id from the print name + UTC date */
export function buildEventId(printName: string, printerId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = printName.trim().toLowerCase().replace(/\s+/g, "_");
  return `sync_${printerId.slice(0, 8)}_${date}_${safeName}`.slice(0, 200);
}

// ── Bambu filament naming ────────────────────────────────────────────────────

export const BAMBU_COLOR_NAMES: Record<string, string> = {
  "FFFFFF": "White",
  "000000": "Black",
  "FF0000": "Red",
  "00FF00": "Green",
  "0000FF": "Blue",
  "FFFF00": "Yellow",
  "FF8000": "Orange",
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
  return `#${upper}`;
}

/** Derive a human-friendly filament name from tray_type + bambu_idx */
export function bambuFilamentName(trayType: string, bambuIdx: string): string {
  const prefix = bambuIdx.slice(0, 3).toUpperCase();
  const lineMap: Record<string, string> = {
    GFA: `${trayType} Basic`,
    GFB: trayType,
    GFC: `${trayType} Silk+`,
    GFG: `${trayType} HF`,
    GFL: `${trayType}`,
    GFN: `${trayType} Tough`,
    GFT: `${trayType} Translucent`,
    GFX: `${trayType} Support`,
  };
  return lineMap[prefix] ?? (trayType || "Filament");
}

// ── Weight sync from AMS remain ──────────────────────────────────────────────

export interface WeightSyncResult {
  shouldUpdate: boolean;
  newWeight: number | null;
  reason: string;
}

/**
 * Determine if a spool's weight should be updated from AMS remain percentage.
 */
export function calculateWeightSync(params: {
  remain: number;
  initialWeight: number;
  currentWeight: number;
  tagUid: string;
  isIdle: boolean;
  threshold?: number;
}): WeightSyncResult {
  const { remain, initialWeight, currentWeight, tagUid, isIdle, threshold = 0.05 } = params;

  if (!isIdle) return { shouldUpdate: false, newWeight: null, reason: "printer_active" };

  if (!tagUid || tagUid === "0000000000000000" || tagUid.length < 8) {
    return { shouldUpdate: false, newWeight: null, reason: "no_rfid" };
  }

  if (remain < 0 || remain > 100) {
    return { shouldUpdate: false, newWeight: null, reason: "invalid_remain" };
  }

  if (initialWeight <= 0) {
    return { shouldUpdate: false, newWeight: null, reason: "no_initial_weight" };
  }

  const calculatedWeight = Math.round(initialWeight * (remain / 100));

  if (calculatedWeight >= currentWeight) {
    return { shouldUpdate: false, newWeight: null, reason: "would_increase" };
  }

  const delta = currentWeight - calculatedWeight;
  const minDelta = initialWeight * threshold;
  if (delta < minDelta) {
    return { shouldUpdate: false, newWeight: null, reason: "below_threshold" };
  }

  return { shouldUpdate: true, newWeight: calculatedWeight, reason: "synced" };
}
