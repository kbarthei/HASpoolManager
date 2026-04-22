import { describe, it, expect } from "vitest";
import { rewriteRackLocation, deriveAmsUnitsFromSlots } from "@/lib/migration-helpers";

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
