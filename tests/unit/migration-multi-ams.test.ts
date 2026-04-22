import { describe, it, expect } from "vitest";
import { rewriteRackLocation, deriveAmsUnitsFromSlots } from "@/lib/migration-helpers";
import { buildSlotDefs } from "@/lib/printer-sync-helpers";

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
