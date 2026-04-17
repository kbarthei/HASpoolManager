import { describe, it, expect } from "vitest";
import { normalizeName } from "@/lib/name-normalize";

describe("normalizeName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeName("  Bambu Lab  ")).toBe("Bambu Lab");
    expect(normalizeName("\tPolymaker\n")).toBe("Polymaker");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeName("Bambu   Lab")).toBe("Bambu Lab");
    expect(normalizeName("Poly\tMaker")).toBe("Poly Maker");
  });

  it("handles non-breaking spaces", () => {
    expect(normalizeName("Bambu\u00A0Lab")).toBe("Bambu Lab");
    expect(normalizeName("Poly\u202FMaker")).toBe("Poly Maker");
  });

  it("returns empty for null/undefined/empty", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });

  it("leaves already-clean strings unchanged", () => {
    expect(normalizeName("Bambu Lab")).toBe("Bambu Lab");
    expect(normalizeName("3DJake")).toBe("3DJake");
  });
});
