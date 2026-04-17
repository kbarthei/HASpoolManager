import { describe, it, expect } from "vitest";
import { resolveVendorName } from "@/lib/vendor-aliases";

describe("resolveVendorName", () => {
  it("resolves common Bambu Lab variants", () => {
    expect(resolveVendorName("bambulab")).toBe("Bambu Lab");
    expect(resolveVendorName("Bambu Lab")).toBe("Bambu Lab");
    expect(resolveVendorName("Bambu")).toBe("Bambu Lab");
    expect(resolveVendorName("BAMBULAB")).toBe("Bambu Lab");
  });

  it("resolves Polymaker sub-brands", () => {
    expect(resolveVendorName("PolyTerra")).toBe("Polymaker");
    expect(resolveVendorName("polylite")).toBe("Polymaker");
    expect(resolveVendorName("PolyMax")).toBe("Polymaker");
    expect(resolveVendorName("PANCHROMA")).toBe("Polymaker");
  });

  it("handles whitespace and punctuation", () => {
    expect(resolveVendorName("  bambu  lab  ")).toBe("Bambu Lab");
    expect(resolveVendorName("Bambu-Lab")).toBe("Bambu Lab");
  });

  it("returns trimmed raw name when no alias matches", () => {
    expect(resolveVendorName("  Custom Brand ")).toBe("Custom Brand");
    expect(resolveVendorName("NoveltyFilaments")).toBe("NoveltyFilaments");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(resolveVendorName(null)).toBe("");
    expect(resolveVendorName(undefined)).toBe("");
    expect(resolveVendorName("")).toBe("");
    expect(resolveVendorName("   ")).toBe("");
  });

  it("resolves eSun variants", () => {
    expect(resolveVendorName("esun")).toBe("eSun");
    expect(resolveVendorName("eSun")).toBe("eSun");
    expect(resolveVendorName("ESUN")).toBe("eSun");
  });
});
