import { describe, it, expect } from "vitest";
import { lookupVendorColor } from "@/lib/color-lookup";

describe("lookupVendorColor()", () => {
  it("finds exact match", () => {
    expect(lookupVendorColor("Bambu Lab", "Black")).toBe("000000");
  });

  it("finds Bambu Lab color by exact name", () => {
    expect(lookupVendorColor("Bambu Lab", "Bambu Green")).toBe("00AE42");
  });

  it("strips material prefix to find match", () => {
    // SpoolmanDB has "Black", user searches "ABS Black"
    expect(lookupVendorColor("Bambu Lab", "ABS Black")).toBe("000000");
  });

  it("strips PLA prefix", () => {
    expect(lookupVendorColor("Bambu Lab", "PLA Bambu Green")).toBe("00AE42");
  });

  it("case-insensitive match", () => {
    expect(lookupVendorColor("Bambu Lab", "bambu green")).toBe("00AE42");
  });

  it("returns null for unknown vendor", () => {
    expect(lookupVendorColor("Unknown Vendor", "Black")).toBeNull();
  });

  it("returns null for unknown filament", () => {
    expect(lookupVendorColor("Bambu Lab", "Nonexistent Color XYZ")).toBeNull();
  });

  it("finds eSun colors", () => {
    expect(lookupVendorColor("eSun", "Black")).toBe("111214");
  });

  it("finds Polymaker via partial match", () => {
    // SpoolmanDB has long names like "Panchroma™ Matte (Formerly PolyTerra™) Army Dark Green"
    // Searching "Army Dark Green" should find it via partial match
    const hex = lookupVendorColor("Polymaker", "Army Dark Green");
    expect(hex).not.toBeNull();
  });

  it("finds Extrudr colors", () => {
    const hex = lookupVendorColor("Extrudr", "Black");
    expect(hex).not.toBeNull();
  });
});
