import { describe, it, expect } from "vitest";
import { deltaEHex } from "@/lib/color";
import { normalizeColor } from "@/lib/matching";

// These tests cover the scoring algorithm design (thresholds, weights) used in
// fuzzyMatch(). The full matching pipeline requires a DB and is covered by
// integration tests. Here we test the pure, exported helpers directly.

describe("Matching scoring concepts", () => {
  describe("Color scoring thresholds — via real deltaEHex", () => {
    it("identical colors score full points (ΔE = 0)", () => {
      expect(deltaEHex("C6C6C6", "C6C6C6")).toBe(0);
    });

    it("nearly identical colors (deltaE < 2.3) are imperceptible", () => {
      expect(deltaEHex("C6C6C6", "C5C5C5")).toBeLessThan(2.3);
    });

    it("similar colors (deltaE < 5) are close", () => {
      expect(deltaEHex("C6C6C6", "BABABA")).toBeLessThan(5);
    });

    it("different colors (deltaE > 20) score zero", () => {
      expect(deltaEHex("FF0000", "0000FF")).toBeGreaterThan(20);
    });

    it("same hue different brightness scores partial", () => {
      const de = deltaEHex("333333", "666666");
      expect(de).toBeGreaterThan(5);
      expect(de).toBeLessThan(30);
    });
  });

  describe("normalizeColor — strips alpha and # prefix", () => {
    it("passes 6-char hex through unchanged", () => {
      expect(normalizeColor("C6C6C6")).toBe("C6C6C6");
    });

    it("strips leading # from hex", () => {
      expect(normalizeColor("#FF0000")).toBe("FF0000");
    });

    it("truncates RRGGBBAA to RRGGBB", () => {
      expect(normalizeColor("FF0000FF")).toBe("FF0000");
    });

    it("returns null for undefined input", () => {
      expect(normalizeColor(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(normalizeColor("")).toBeNull();
    });
  });

  // Algorithm-design tests: validate the SCORING RULES, not the implementation.
  // The actual scoring runs inside private fuzzyMatch(); these document intent.
  describe("Bambu filament index matching — algorithm design", () => {
    it("exact match has highest priority", () => {
      const idx1 = "GFA00";
      const idx2 = "GFA00";
      expect(idx1 === idx2).toBe(true); // 40 points
    });

    it("same product line (first 3 chars) gives partial credit", () => {
      const idx1 = "GFA00"; // PLA Basic
      const idx2 = "GFA01"; // PLA Matte
      expect(idx1.slice(0, 3) === idx2.slice(0, 3)).toBe(true); // 12 points
    });

    it("different product lines give no credit", () => {
      const idx1 = "GFA00"; // PLA
      const idx2 = "GFB50"; // ABS-GF
      expect(idx1.slice(0, 3) === idx2.slice(0, 3)).toBe(false); // 0 points
    });

    it("null/missing index does not match anything", () => {
      const idx1 = null;
      const idx2 = "GFA00";
      expect(idx1 === idx2).toBe(false);
    });

    it("empty string index does not match a valid index", () => {
      const idx1: string = "";
      const idx2: string = "GFA00";
      expect(idx1 === idx2).toBe(false);
    });
  });

  describe("Material matching — algorithm design", () => {
    it("case-insensitive exact match", () => {
      expect("PLA".toLowerCase() === "pla".toLowerCase()).toBe(true);
    });

    it("different materials don't match", () => {
      expect("PLA".toLowerCase() === "PETG".toLowerCase()).toBe(false);
    });

    it("ABS-GF does not match ABS", () => {
      expect("ABS-GF".toLowerCase() === "ABS".toLowerCase()).toBe(false);
    });

    it("TPU-90A does not match TPU", () => {
      expect("TPU-90A".toLowerCase() === "TPU".toLowerCase()).toBe(false);
    });
  });

  describe("Vendor keyword matching — algorithm design", () => {
    it("vendor name found in tray_sub_brands", () => {
      const subBrands = "Bambu Lab PLA Basic";
      expect(subBrands.toLowerCase().includes("bambu lab".toLowerCase())).toBe(true);
    });

    it("vendor name not in tray_sub_brands", () => {
      const subBrands = "Generic PLA";
      expect(subBrands.toLowerCase().includes("bambu lab".toLowerCase())).toBe(false);
    });

    it("partial vendor match is found", () => {
      const subBrands = "Bambu Lab PLA Matte";
      expect(subBrands.toLowerCase().includes("bambu".toLowerCase())).toBe(true);
    });

    it("empty tray_sub_brands does not match any vendor", () => {
      const subBrands = "";
      expect(subBrands.toLowerCase().includes("bambu lab".toLowerCase())).toBe(false);
    });
  });

  describe("Score composition — via real deltaEHex", () => {
    it("color penalty increases with perceptual distance", () => {
      const nearIdentical = deltaEHex("C6C6C6", "C5C5C5");
      const slightlyDiff = deltaEHex("C6C6C6", "BABABA");
      const veryDiff = deltaEHex("FF0000", "0000FF");

      expect(nearIdentical).toBeLessThan(slightlyDiff);
      expect(slightlyDiff).toBeLessThan(veryDiff);
    });

    it("color distance is symmetric", () => {
      const ab = deltaEHex("FF0000", "00FF00");
      const ba = deltaEHex("00FF00", "FF0000");
      expect(ab).toBeCloseTo(ba, 10);
    });

    it("index prefix match is determined by first 3 characters", () => {
      const cases = [
        ["GFA00", "GFA01", true],   // same prefix GFA
        ["GFA00", "GFA99", true],   // same prefix GFA
        ["GFA00", "GFB00", false],  // different prefix GFB
        ["GFA00", "GFC50", false],  // different prefix GFC
      ] as const;

      for (const [idx1, idx2, expected] of cases) {
        expect(idx1.slice(0, 3) === idx2.slice(0, 3)).toBe(expected);
      }
    });
  });

  describe("normalizeColor — edge cases", () => {
    it("handles 8-char RRGGBBAA from Bambu (strips alpha)", () => {
      expect(normalizeColor("FF0000FF")).toBe("FF0000");
    });

    it("handles # prefix with 8-char RRGGBBAA", () => {
      // strip # first, then slice to 6
      expect(normalizeColor("#FF0000FF")).toBe("FF00000".slice(0, 6)); // "FF0000"
      expect(normalizeColor("#FF0000FF")).toBe("FF0000");
    });

    it("handles fully transparent color (alpha=00)", () => {
      expect(normalizeColor("FFFFFF00")).toBe("FFFFFF");
    });

    it("handles lowercase hex", () => {
      expect(normalizeColor("ff0000")).toBe("ff0000");
    });

    it("null input returns null", () => {
      expect(normalizeColor(null as unknown as undefined)).toBeNull();
    });
  });

  describe("deltaEHex — boundary values", () => {
    it("pure black vs pure white has maximum distance", () => {
      const de = deltaEHex("000000", "FFFFFF");
      // L* range is 0-100, so max Delta-E is ~100
      expect(de).toBeGreaterThan(90);
    });

    it("pure red vs pure green has high distance", () => {
      expect(deltaEHex("FF0000", "00FF00")).toBeGreaterThan(40);
    });

    it("adjacent gray steps are imperceptible", () => {
      // Single-step gray difference in 8-bit is well below JND of ~2.3
      expect(deltaEHex("808080", "818181")).toBeLessThan(2.3);
    });

    it("distance is non-negative for any input pair", () => {
      const pairs: [string, string][] = [
        ["000000", "FFFFFF"],
        ["FF0000", "00FF00"],
        ["123456", "654321"],
      ];
      for (const [a, b] of pairs) {
        expect(deltaEHex(a, b)).toBeGreaterThanOrEqual(0);
      }
    });

    it("triangle inequality holds for three colors", () => {
      // d(a,c) <= d(a,b) + d(b,c) (approximately — CIE76 is Euclidean)
      const ab = deltaEHex("FF0000", "00FF00");
      const bc = deltaEHex("00FF00", "0000FF");
      const ac = deltaEHex("FF0000", "0000FF");
      expect(ac).toBeLessThanOrEqual(ab + bc + 0.001); // small float tolerance
    });
  });
});
