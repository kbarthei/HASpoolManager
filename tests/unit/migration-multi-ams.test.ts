import { describe, it, expect } from "vitest";
import { buildSlotDefs } from "@/lib/printer-sync-helpers";

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
