import { describe, it, expect } from "vitest";
import { rewriteRackLocation, deriveAmsUnitsFromSlots } from "@/lib/migration-helpers";
import { buildSlotDefs, applyLegacyPayloadAliases } from "@/lib/printer-sync-helpers";

describe("rewriteRackLocation", () => {
  const defaultRackId = "abc-123-def-456";

  it("rewrites 'rack:R-C' to 'rack:<rackId>:R-C'", () => {
    expect(rewriteRackLocation("rack:2-5", defaultRackId)).toBe("rack:abc-123-def-456:2-5");
  });

  it("leaves already-migrated locations unchanged", () => {
    expect(rewriteRackLocation("rack:abc-123-def-456:2-5", defaultRackId)).toBe("rack:abc-123-def-456:2-5");
  });

  it("leaves non-rack locations unchanged", () => {
    expect(rewriteRackLocation("ams", defaultRackId)).toBe("ams");
    expect(rewriteRackLocation("storage", defaultRackId)).toBe("storage");
    expect(rewriteRackLocation("workbench", defaultRackId)).toBe("workbench");
  });

  it("returns null for null input", () => {
    expect(rewriteRackLocation(null, defaultRackId)).toBeNull();
  });
});

describe("deriveAmsUnitsFromSlots", () => {
  it("produces one unit per (amsIndex, slotType) combo except external", () => {
    const slots = [
      { amsIndex: 0, slotType: "ams" },
      { amsIndex: 0, slotType: "ams" },
      { amsIndex: 1, slotType: "ams_ht" },
      { amsIndex: -1, slotType: "external" },
    ];
    const result = deriveAmsUnitsFromSlots(slots);
    expect(result).toEqual([
      { amsIndex: 0, slotType: "ams", displayName: "AMS 1" },
      { amsIndex: 1, slotType: "ams_ht", displayName: "AMS HT" },
    ]);
  });

  it("returns empty array for printer with no slots", () => {
    expect(deriveAmsUnitsFromSlots([])).toEqual([]);
  });
});

describe("buildSlotDefs", () => {
  it("empty units yields only external slot", () => {
    expect(buildSlotDefs([])).toEqual([
      { key: "slot_ext", slotType: "external", amsIndex: -1, trayIndex: 0 },
    ]);
  });

  it("one AMS yields 4 AMS slots + external", () => {
    const defs = buildSlotDefs([{ amsIndex: 0, slotType: "ams" }]);
    expect(defs).toHaveLength(5);
    expect(defs[0]).toEqual({ key: "slot_ams_0_0", slotType: "ams", amsIndex: 0, trayIndex: 0 });
    expect(defs[3]).toEqual({ key: "slot_ams_0_3", slotType: "ams", amsIndex: 0, trayIndex: 3 });
    expect(defs[4].slotType).toBe("external");
  });

  it("one AMS + one HT yields 4 + 1 + external", () => {
    const defs = buildSlotDefs([
      { amsIndex: 0, slotType: "ams" },
      { amsIndex: 1, slotType: "ams_ht" },
    ]);
    expect(defs).toHaveLength(6);
    expect(defs.find((d) => d.slotType === "ams_ht")).toEqual({
      key: "slot_ht_1", slotType: "ams_ht", amsIndex: 1, trayIndex: 0,
    });
  });

  it("two AMS yield 8 tray slots + external", () => {
    const defs = buildSlotDefs([
      { amsIndex: 0, slotType: "ams" },
      { amsIndex: 2, slotType: "ams" },
    ]);
    const amsDefs = defs.filter((d) => d.slotType === "ams");
    expect(amsDefs).toHaveLength(8);
    expect(amsDefs.map((d) => d.key)).toEqual([
      "slot_ams_0_0", "slot_ams_0_1", "slot_ams_0_2", "slot_ams_0_3",
      "slot_ams_2_0", "slot_ams_2_1", "slot_ams_2_2", "slot_ams_2_3",
    ]);
  });
});

describe("applyLegacyPayloadAliases", () => {
  it("maps legacy slot_1_* to slot_ams_0_0_*", () => {
    const input = {
      printer_id: "p1",
      slot_1_type: "PLA",
      slot_1_color: "FF0000FF",
      slot_1_remain: 75,
      slot_1_empty: false,
    };
    const result = applyLegacyPayloadAliases(input);
    expect(result.slot_ams_0_0_type).toBe("PLA");
    expect(result.slot_ams_0_0_color).toBe("FF0000FF");
    expect(result.slot_ams_0_0_remain).toBe(75);
    expect(result.slot_ams_0_0_empty).toBe(false);
    // Original keys are preserved (harmless)
    expect(result.slot_1_type).toBe("PLA");
    expect(result.printer_id).toBe("p1");
  });

  it("maps slot_ht_* to slot_ht_1_*", () => {
    const result = applyLegacyPayloadAliases({ slot_ht_type: "PC", slot_ht_empty: false });
    expect(result.slot_ht_1_type).toBe("PC");
    expect(result.slot_ht_1_empty).toBe(false);
  });

  it("does not clobber explicit modern keys", () => {
    const result = applyLegacyPayloadAliases({
      slot_1_type: "PLA",
      slot_ams_0_0_type: "PETG", // explicit modern wins
    });
    expect(result.slot_ams_0_0_type).toBe("PETG");
  });

  it("leaves slot_ext_* alone (no alias needed)", () => {
    const result = applyLegacyPayloadAliases({ slot_ext_type: "PLA", slot_ext_empty: false });
    expect(result.slot_ext_type).toBe("PLA");
    expect(result.slot_ext_empty).toBe(false);
  });

  it("ignores unrelated keys", () => {
    const result = applyLegacyPayloadAliases({ printer_id: "p1", gcode_state: "RUNNING" });
    expect(Object.keys(result).sort()).toEqual(["gcode_state", "printer_id"]);
  });

  it("handles all 4 AMS slots + HT in one pass", () => {
    const input = {
      slot_1_type: "PLA", slot_2_type: "PETG", slot_3_type: "ABS", slot_4_type: "TPU",
      slot_ht_type: "PC",
    };
    const result = applyLegacyPayloadAliases(input);
    expect(result.slot_ams_0_0_type).toBe("PLA");
    expect(result.slot_ams_0_1_type).toBe("PETG");
    expect(result.slot_ams_0_2_type).toBe("ABS");
    expect(result.slot_ams_0_3_type).toBe("TPU");
    expect(result.slot_ht_1_type).toBe("PC");
  });
});
