/**
 * Pure helper functions for the printer-sync endpoint.
 * Extracted for testability — no DB, no side effects.
 */

// ── gcode_state classification (10 coarse states — stable, never changes) ────
// Used for PRINT LIFECYCLE decisions (start/finish/fail)
// Source: Bambu Lab MQTT protocol, sensor.h2s_druckstatus in HA

export const GCODE_ACTIVE = new Set(["RUNNING", "PREPARE", "SLICING", "INIT", "PAUSE"]);
export const GCODE_FINISH = new Set(["FINISH"]);
export const GCODE_FAILED = new Set(["FAILED", "CANCELED", "CANCELLED"]);
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

// ── Calibration name filter ──────────────────────────────────────────────────
// Auto-calibration routines are NOT print jobs — don't create records for them

const CALIBRATION_NAMES = ["auto_cali", "auto_calibration", "user_param", "default_param"];

export function isCalibrationJob(printName: string): boolean {
  if (!printName) return false;
  const lower = printName.toLowerCase();
  return CALIBRATION_NAMES.some(c => lower.includes(c));
}

// ── HA entity availability ───────────────────────────────────────────────────

/** Minimal shape of an HA entity state — just what we need to check availability. */
export interface HAEntityStateLike {
  state: string;
  attributes?: Record<string, unknown>;
}

/**
 * Whether an HA entity is reporting real data.
 *
 * HA keeps a state row for disconnected entities with `state: "unavailable"`
 * or `"unknown"` and an empty `attributes` object. The sync worker must NOT
 * emit payload fields from such entities — doing so would write ghost values
 * to the DB. In particular, `attributes.empty ?? true` would default to
 * `true` for an unavailable AMS slot entity, causing the printer-sync route
 * handler to null out the slot's `spool_id` and move the previously-linked
 * spool to `surplus`. A transient disconnect would then permanently destroy
 * the AMS→spool bindings.
 */
export function isHAEntityAvailable<T extends HAEntityStateLike>(
  state: T | null | undefined,
): state is T {
  if (!state) return false;
  return state.state !== "unavailable" && state.state !== "unknown";
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

// ── Energy cost calculation ─────────────────────────────────────────────────

/**
 * Calculate energy cost from smart plug kWh readings.
 * Returns null if inputs are invalid (missing, negative diff from plug reset).
 */
export function calculateEnergyCost(
  startKwh: number | null | undefined,
  endKwh: number | null | undefined,
  pricePerKwh: number
): { energyKwh: number; energyCost: number } | null {
  if (startKwh == null || endKwh == null || endKwh < startKwh) return null;
  const kwh = Math.round((endKwh - startKwh) * 1000) / 1000;
  return {
    energyKwh: kwh,
    energyCost: Math.round(kwh * pricePerKwh * 100) / 100,
  };
}

// ── HMS error code parsing ──────────────────────────────────────────────────

/** Module ID → human-readable name (from ha-bambulab pybambu/const.py) */
export const HMS_MODULES: Record<number, string> = {
  0x03: "mc",        // Motion Controller (heatbed, motors, sensors)
  0x05: "mainboard", // Main board / system
  0x07: "ams",       // Automatic Material System
  0x08: "toolhead",  // Toolhead / extruder / nozzle
  0x0C: "xcam",      // LiDAR / camera (spaghetti detection, first layer)
};

/** Severity level → label (from ha-bambulab) */
export const HMS_SEVERITY: Record<number, string> = {
  1: "fatal",
  2: "serious",
  3: "common",
  4: "info",
};

export interface ParsedHmsCode {
  /** Full formatted code, e.g. "0700_2000_0002_0001" */
  fullCode: string;
  /** Module name: "ams", "mc", "toolhead", "mainboard", "xcam", "unknown" */
  module: string;
  /** Module byte (e.g. 0x07 for AMS) */
  moduleId: number;
  /** AMS unit index (0 = AMS-A, 1 = AMS-B). Only meaningful for AMS module. */
  amsUnit: number;
  /** Severity: "fatal", "serious", "common", "info", "unknown" */
  severity: string;
  /** Slot key for AMS correlation: "slot_1".."slot_4", "slot_ht", or null */
  slotKey: string | null;
  /** Tray/slot index from the code (1-based), or null */
  slotIndex: number | null;
}

/**
 * Parse raw HMS attr+code integers into structured data.
 *
 * HMS code format: AAAA_BBBB_CCCC_DDDD (16 hex digits)
 *   AAAA = attr >> 16  (module + AMS unit in high byte)
 *   BBBB = attr & 0xFFFF (part ID)
 *   CCCC = code >> 16  (slot/instance number + severity)
 *   DDDD = code & 0xFFFF (algorithm/error ID)
 */
export function parseHmsCode(attr: number, code: number): ParsedHmsCode {
  const a = attr >>> 0; // ensure unsigned
  const c = code >>> 0;

  const aaaa = ((a >>> 16) & 0xFFFF).toString(16).padStart(4, "0").toUpperCase();
  const bbbb = (a & 0xFFFF).toString(16).padStart(4, "0").toUpperCase();
  const cccc = ((c >>> 16) & 0xFFFF).toString(16).padStart(4, "0").toUpperCase();
  const dddd = (c & 0xFFFF).toString(16).padStart(4, "0").toUpperCase();
  const fullCode = `${aaaa}_${bbbb}_${cccc}_${dddd}`;

  // Module: high byte of attr
  const moduleId = (a >>> 24) & 0xFF;
  const moduleName = HMS_MODULES[moduleId] ?? "unknown";

  // AMS unit: second nibble of first byte (0x07 = AMS-A unit 0, 0x17 = AMS-B unit 1)
  const amsUnit = (a >>> 28) & 0x0F;

  // Severity: CCCC value maps to severity table
  const severityNum = (c >>> 16) & 0xFFFF;
  const severity = HMS_SEVERITY[severityNum] ?? "unknown";

  // Slot index: for AMS module, the CCCC segment encodes the slot (1-based)
  let slotKey: string | null = null;
  let slotIndex: number | null = null;
  if (moduleName === "ams") {
    // CCCC is the slot/instance number (1-based for severity lookup,
    // but actual slot is also encoded). The slot is in CCCC.
    // Common pattern: 0001=slot1, 0002=slot2, 0003=slot3, 0004=slot4
    const slotNum = severityNum; // CCCC value
    if (slotNum >= 1 && slotNum <= 4) {
      slotIndex = slotNum;
      if (amsUnit === 0) {
        slotKey = `slot_${slotNum}`;
      } else {
        slotKey = "slot_ht"; // AMS HT has single slot
      }
    }
  }

  return { fullCode, module: moduleName, moduleId, amsUnit, severity, slotKey, slotIndex };
}

/**
 * Parse an HMS code from the formatted string "AAAA_BBBB_CCCC_DDDD".
 * Used when reading from HA entity attributes (which provide pre-formatted codes).
 */
export function parseHmsCodeString(hmsCode: string): ParsedHmsCode | null {
  // Strip "HMS_" prefix if present
  const code = hmsCode.replace(/^HMS_/i, "");
  const parts = code.split("_");
  if (parts.length !== 4) return null;

  const attr = (parseInt(parts[0], 16) << 16) | parseInt(parts[1], 16);
  const codeInt = (parseInt(parts[2], 16) << 16) | parseInt(parts[3], 16);

  if (isNaN(attr) || isNaN(codeInt)) return null;
  return parseHmsCode(attr, codeInt);
}

// ─── buildSlotDefs ──────────────────────────────────────────────────────────
// Generates the slot-key/slotType/amsIndex/trayIndex mapping dynamically from
// the enabled printer_ams_units rows. Replaces the former hardcoded 6-entry
// SLOT_DEFS array so a printer can have 0, 1, 2+ AMS units plus HT.

export interface SlotDef {
  key: string;
  slotType: "ams" | "ams_ht" | "external";
  amsIndex: number;
  trayIndex: number;
}

export interface AmsUnitForSlots {
  amsIndex: number;
  slotType: string;
}

export function buildSlotDefs(units: AmsUnitForSlots[]): SlotDef[] {
  const defs: SlotDef[] = [];
  const sorted = [...units].sort((a, b) => {
    if (a.slotType !== b.slotType) return a.slotType === "ams" ? -1 : 1;
    return a.amsIndex - b.amsIndex;
  });

  for (const u of sorted) {
    if (u.slotType === "ams") {
      for (let i = 0; i < 4; i++) {
        defs.push({ key: `slot_ams_${u.amsIndex}_${i}`, slotType: "ams", amsIndex: u.amsIndex, trayIndex: i });
      }
    } else if (u.slotType === "ams_ht") {
      defs.push({ key: `slot_ht_${u.amsIndex}`, slotType: "ams_ht", amsIndex: u.amsIndex, trayIndex: 0 });
    }
  }

  // External slot is always present (not tied to an AMS unit)
  defs.push({ key: "slot_ext", slotType: "external", amsIndex: -1, trayIndex: 0 });
  return defs;
}
