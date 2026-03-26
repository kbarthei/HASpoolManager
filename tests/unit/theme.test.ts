import { describe, it, expect } from "vitest";
import { getStockLevelColor, getStockLevelBg, getMaterialColor, needsRing } from "@/lib/theme";

describe("getStockLevelColor", () => {
  it("100% → emerald", () => {
    expect(getStockLevelColor(100)).toContain("emerald");
  });

  it("50% → emerald", () => {
    expect(getStockLevelColor(50)).toContain("emerald");
  });

  it("31% → emerald", () => {
    expect(getStockLevelColor(31)).toContain("emerald");
  });

  it("30% → emerald (boundary: < 30 is amber, 30 is emerald)", () => {
    expect(getStockLevelColor(30)).toContain("emerald");
  });

  it("29% → amber", () => {
    expect(getStockLevelColor(29)).toContain("amber");
  });

  it("15% → amber", () => {
    expect(getStockLevelColor(15)).toContain("amber");
  });

  it("10% → amber (boundary: < 10 is red, 10 is amber)", () => {
    expect(getStockLevelColor(10)).toContain("amber");
  });

  it("9% → red", () => {
    expect(getStockLevelColor(9)).toContain("red");
  });

  it("5% → red", () => {
    expect(getStockLevelColor(5)).toContain("red");
  });

  it("1% → red", () => {
    expect(getStockLevelColor(1)).toContain("red");
  });

  it("0% → gray and line-through (empty spool)", () => {
    const result = getStockLevelColor(0);
    expect(result).toContain("gray");
    expect(result).toContain("line-through");
  });
});

describe("getStockLevelBg", () => {
  it("100% → bg-emerald", () => {
    expect(getStockLevelBg(100)).toContain("emerald");
  });

  it("50% → bg-emerald", () => {
    expect(getStockLevelBg(50)).toContain("emerald");
  });

  it("31% → bg-emerald", () => {
    expect(getStockLevelBg(31)).toContain("emerald");
  });

  it("30% → bg-emerald (boundary)", () => {
    expect(getStockLevelBg(30)).toContain("emerald");
  });

  it("29% → bg-amber", () => {
    expect(getStockLevelBg(29)).toContain("amber");
  });

  it("15% → bg-amber", () => {
    expect(getStockLevelBg(15)).toContain("amber");
  });

  it("10% → bg-amber (boundary)", () => {
    expect(getStockLevelBg(10)).toContain("amber");
  });

  it("9% → bg-red", () => {
    expect(getStockLevelBg(9)).toContain("red");
  });

  it("5% → bg-red", () => {
    expect(getStockLevelBg(5)).toContain("red");
  });

  it("0% → bg-gray (empty spool)", () => {
    expect(getStockLevelBg(0)).toContain("gray");
  });

  it("returns a bg- class", () => {
    expect(getStockLevelBg(50)).toMatch(/^bg-/);
  });
});

describe("getMaterialColor", () => {
  it("PLA → teal", () => {
    expect(getMaterialColor("PLA")).toContain("teal");
  });

  it("pla (lowercase) → teal (case-insensitive)", () => {
    expect(getMaterialColor("pla")).toContain("teal");
  });

  it("PETG → emerald", () => {
    expect(getMaterialColor("PETG")).toContain("emerald");
  });

  it("ABS → red", () => {
    expect(getMaterialColor("ABS")).toContain("red");
  });

  it("ABS-GF → orange", () => {
    expect(getMaterialColor("ABS-GF")).toContain("orange");
  });

  it("TPU → purple", () => {
    expect(getMaterialColor("TPU")).toContain("purple");
  });

  it("tpu (lowercase) → purple (case-insensitive)", () => {
    expect(getMaterialColor("tpu")).toContain("purple");
  });

  it("TPU-90A → gray fallback (not an exact match for TPU)", () => {
    // TPU-90A does not match the exact "TPU" check, falls through to default
    expect(getMaterialColor("TPU-90A")).toContain("gray");
  });

  it("UNKNOWN → gray fallback", () => {
    expect(getMaterialColor("UNKNOWN")).toContain("gray");
  });

  it("empty string → gray fallback", () => {
    expect(getMaterialColor("")).toContain("gray");
  });
});

describe("needsRing", () => {
  it("000000 (pure black) → true (too dark)", () => {
    expect(needsRing("000000")).toBe(true);
  });

  it("111111 (very dark) → true (too dark)", () => {
    expect(needsRing("111111")).toBe(true);
  });

  it("FFFFFF (pure white) → true (too light)", () => {
    expect(needsRing("FFFFFF")).toBe(true);
  });

  it("808080 (mid-range gray) → false", () => {
    expect(needsRing("808080")).toBe(false);
  });

  it("C6C6C6 (light gray, luminance ~0.56) → false", () => {
    expect(needsRing("C6C6C6")).toBe(false);
  });

  it("FF0000 (red, luminance ~0.21) → false", () => {
    expect(needsRing("FF0000")).toBe(false);
  });

  it("handles # prefix", () => {
    expect(needsRing("#000000")).toBe(true);
    expect(needsRing("#FFFFFF")).toBe(true);
    expect(needsRing("#808080")).toBe(false);
  });

  it("EEEEEE (luminance ~0.855) → false (below 0.9 threshold)", () => {
    // Luminance of EEEEEE ≈ 0.855 which is < 0.9, so no ring needed
    expect(needsRing("EEEEEE")).toBe(false);
  });

  it("returns false for invalid (non-6-char) hex after stripping #", () => {
    expect(needsRing("FFF")).toBe(false);
  });
});
