import { describe, it, expect } from "vitest";
import {
  num,
  bool,
  str,
  classifyState,
  buildEventId,
  bambuColorName,
  bambuFilamentName,
} from "@/lib/printer-sync-helpers";
import { normalizeColor } from "@/lib/matching";

// ── num() ─────────────────────────────────────────────────────────────────────

describe("num()", () => {
  it("parses valid integer", () => {
    expect(num("42")).toBe(42);
  });

  it("parses valid float", () => {
    expect(num("15.5")).toBe(15.5);
  });

  it("parses zero", () => {
    expect(num("0")).toBe(0);
  });

  it("parses negative number", () => {
    expect(num("-5")).toBe(-5);
  });

  it("returns default 0 for null", () => {
    expect(num(null)).toBe(0);
  });

  it("returns default 0 for undefined", () => {
    expect(num(undefined)).toBe(0);
  });

  it("returns default 0 for empty string", () => {
    expect(num("")).toBe(0);
  });

  it("returns default 0 for 'None'", () => {
    expect(num("None")).toBe(0);
  });

  it("returns default 0 for 'unknown'", () => {
    expect(num("unknown")).toBe(0);
  });

  it("returns default 0 for 'unavailable'", () => {
    expect(num("unavailable")).toBe(0);
  });

  it("uses custom default when value is None", () => {
    expect(num("None", -1)).toBe(-1);
  });

  it("converts boolean true to 1", () => {
    expect(num(true)).toBe(1);
  });

  it("returns default for NaN string", () => {
    expect(num("not-a-number")).toBe(0);
  });

  it("uses custom default for NaN string", () => {
    expect(num("bad", 99)).toBe(99);
  });
});

// ── bool() ────────────────────────────────────────────────────────────────────

describe("bool()", () => {
  it("parses 'true' (lowercase)", () => {
    expect(bool("true")).toBe(true);
  });

  it("parses 'True' (mixed case)", () => {
    expect(bool("True")).toBe(true);
  });

  it("parses 'on'", () => {
    expect(bool("on")).toBe(true);
  });

  it("parses '1'", () => {
    expect(bool("1")).toBe(true);
  });

  it("parses 'yes'", () => {
    expect(bool("yes")).toBe(true);
  });

  it("handles actual boolean true", () => {
    expect(bool(true)).toBe(true);
  });

  it("parses 'false'", () => {
    expect(bool("false")).toBe(false);
  });

  it("parses 'off'", () => {
    expect(bool("off")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(bool("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(bool(null)).toBe(false);
  });

  it("returns false for 'None'", () => {
    expect(bool("None")).toBe(false);
  });

  it("handles actual boolean false", () => {
    expect(bool(false)).toBe(false);
  });
});

// ── str() ─────────────────────────────────────────────────────────────────────

describe("str()", () => {
  it("returns a normal string as-is", () => {
    expect(str("hello")).toBe("hello");
  });

  it("trims surrounding whitespace", () => {
    expect(str("  hello  ")).toBe("hello");
  });

  it("returns default for null", () => {
    expect(str(null)).toBe("");
  });

  it("returns default for undefined", () => {
    expect(str(undefined)).toBe("");
  });

  it("returns default for 'None'", () => {
    expect(str("None")).toBe("");
  });

  it("returns default for 'unknown'", () => {
    expect(str("unknown")).toBe("");
  });

  it("returns default for 'unavailable'", () => {
    expect(str("unavailable")).toBe("");
  });

  it("returns default for 'null'", () => {
    expect(str("null")).toBe("");
  });

  it("uses custom default when value is null", () => {
    expect(str(null, "fallback")).toBe("fallback");
  });
});

// ── classifyState() ───────────────────────────────────────────────────────────

describe("classifyState()", () => {
  it.each([
    "PRINTING", "RUNNING", "PAUSE", "PREPARE", "SLICING",
  ])("classifies '%s' as active", (state) => {
    expect(classifyState(state)).toBe("active");
  });

  it.each([
    "CALIBRATING_EXTRUSION",
    "CLEANING_NOZZLE_TIP",
    "SWEEPING_XY_MECH_MODE",
    "HEATBED_PREHEATING",
  ])("classifies calibration state '%s' as active", (state) => {
    expect(classifyState(state)).toBe("active");
  });

  it.each([
    "FINISH", "FINISHED", "COMPLETE",
  ])("classifies '%s' as finished", (state) => {
    expect(classifyState(state)).toBe("finished");
  });

  it.each([
    "FAILED", "CANCELED", "CANCELLED",
  ])("classifies '%s' as failed", (state) => {
    expect(classifyState(state)).toBe("failed");
  });

  it.each([
    "IDLE", "", "OFFLINE", "UNKNOWN",
  ])("classifies '%s' as idle", (state) => {
    expect(classifyState(state)).toBe("idle");
  });

  it("classifies unknown string as idle", () => {
    expect(classifyState("SOMETHING_RANDOM")).toBe("idle");
  });

  it("is case insensitive: 'printing' → active", () => {
    expect(classifyState("printing")).toBe("active");
  });

  it("is case insensitive: 'finished' → finished", () => {
    expect(classifyState("finished")).toBe("finished");
  });

  it("is case insensitive: 'failed' → failed", () => {
    expect(classifyState("failed")).toBe("failed");
  });

  it("classifies German variant 'DRUCKEN' as active", () => {
    expect(classifyState("DRUCKEN")).toBe("active");
  });

  it("classifies German variant in lowercase as active", () => {
    expect(classifyState("drucken")).toBe("active");
  });

  it("classifies COMPLETED as finished", () => {
    expect(classifyState("COMPLETED")).toBe("finished");
  });

  it("classifies ERROR as failed", () => {
    expect(classifyState("ERROR")).toBe("failed");
  });
});

// ── buildEventId() ────────────────────────────────────────────────────────────

describe("buildEventId()", () => {
  it("generates ID in expected format: sync_<prefix>_<date>_<name>", () => {
    const id = buildEventId("myprint", "printer-abc-123");
    const today = new Date().toISOString().slice(0, 10);
    expect(id).toBe(`sync_printer-_${today}_myprint`);
  });

  it("sanitizes spaces in print name", () => {
    const id = buildEventId("my print", "printer123456789");
    expect(id).toContain("my_print");
  });

  it("truncates long ID to 200 chars", () => {
    const longName = "a".repeat(300);
    const id = buildEventId(longName, "printer123456789");
    expect(id.length).toBe(200);
  });

  it("handles empty print name", () => {
    const id = buildEventId("", "printer123456789");
    expect(id).toContain("sync_");
    expect(id.length).toBeGreaterThan(0);
  });

  it("produces consistent output for same inputs on same day", () => {
    const id1 = buildEventId("test-print", "printer123456789");
    const id2 = buildEventId("test-print", "printer123456789");
    expect(id1).toBe(id2);
  });

  it("uses only the first 8 chars of printerId", () => {
    const id = buildEventId("print", "ABCDEFGHIJKLMNOP");
    expect(id).toContain("sync_ABCDEFGH_");
  });
});

// ── bambuFilamentName() ───────────────────────────────────────────────────────

describe("bambuFilamentName()", () => {
  it("GFA prefix → '<trayType> Basic'", () => {
    expect(bambuFilamentName("PLA", "GFA00")).toBe("PLA Basic");
  });

  it("GFA prefix with PETG → 'PETG Basic'", () => {
    expect(bambuFilamentName("PETG", "GFA01")).toBe("PETG Basic");
  });

  it("GFB prefix → trayType (material IS the line)", () => {
    expect(bambuFilamentName("ABS-GF", "GFB00")).toBe("ABS-GF");
  });

  it("GFC prefix → '<trayType> Silk+'", () => {
    expect(bambuFilamentName("PLA", "GFC00")).toBe("PLA Silk+");
  });

  it("GFG prefix → '<trayType> HF'", () => {
    expect(bambuFilamentName("PETG", "GFG00")).toBe("PETG HF");
  });

  it("GFN prefix → '<trayType> Tough'", () => {
    expect(bambuFilamentName("PLA", "GFN00")).toBe("PLA Tough");
  });

  it("GFT prefix → '<trayType> Translucent'", () => {
    expect(bambuFilamentName("PLA", "GFT00")).toBe("PLA Translucent");
  });

  it("GFX prefix → '<trayType> Support'", () => {
    expect(bambuFilamentName("PLA", "GFX00")).toBe("PLA Support");
  });

  it("unknown prefix → trayType fallback", () => {
    expect(bambuFilamentName("TPU", "GFZ99")).toBe("TPU");
  });

  it("empty trayType with unknown prefix → 'Filament'", () => {
    expect(bambuFilamentName("", "GFZ99")).toBe("Filament");
  });

  it("GFL prefix → trayType (third-party compat)", () => {
    expect(bambuFilamentName("PLA", "GFL00")).toBe("PLA");
  });
});

// ── bambuColorName() ──────────────────────────────────────────────────────────

describe("bambuColorName()", () => {
  it("FFFFFF → White", () => {
    expect(bambuColorName("FFFFFF")).toBe("White");
  });

  it("000000 → Black", () => {
    expect(bambuColorName("000000")).toBe("Black");
  });

  it("FF0000 → Red", () => {
    expect(bambuColorName("FF0000")).toBe("Red");
  });

  it("unknown hex → '#<HEX>' fallback", () => {
    expect(bambuColorName("ABCDEF")).toBe("#ABCDEF");
  });

  it("strips alpha channel: 8-char FFFFFFAA → White", () => {
    expect(bambuColorName("FFFFFFAA")).toBe("White");
  });

  it("normalizes to uppercase before lookup", () => {
    expect(bambuColorName("ffffff")).toBe("White");
  });

  it("0000FF → Blue", () => {
    expect(bambuColorName("0000FF")).toBe("Blue");
  });
});

// ── normalizeColor() (from lib/matching.ts) ───────────────────────────────────

describe("normalizeColor()", () => {
  it("strips # prefix", () => {
    expect(normalizeColor("#FF0000")).toBe("FF0000");
  });

  it("strips alpha channel (8-char RRGGBBAA → 6-char RRGGBB)", () => {
    expect(normalizeColor("FF0000AA")).toBe("FF0000");
  });

  it("leaves 6-char hex unchanged", () => {
    expect(normalizeColor("ABCDEF")).toBe("ABCDEF");
  });

  it("returns null for undefined", () => {
    expect(normalizeColor(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeColor("")).toBeNull();
  });

  it("strips # and alpha together", () => {
    expect(normalizeColor("#FF000080")).toBe("FF0000");
  });
});
