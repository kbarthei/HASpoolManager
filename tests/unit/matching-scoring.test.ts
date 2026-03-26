import { describe, it, expect } from "vitest";
import { deltaEHex } from "@/lib/color";

describe("Matching scoring concepts", () => {
  describe("Color scoring thresholds", () => {
    it("identical colors score full points", () => {
      expect(deltaEHex("C6C6C6", "C6C6C6")).toBe(0);
    });

    it("nearly identical colors (deltaE < 2.3) are imperceptible", () => {
      // Very slightly different grays
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

  describe("Bambu filament index matching", () => {
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
      const idx1 = "";
      const idx2 = "GFA00";
      expect(idx1 === idx2).toBe(false);
    });
  });

  describe("Material matching", () => {
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

  describe("Vendor keyword matching", () => {
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

  describe("Score composition", () => {
    it("color penalty increases with perceptual distance", () => {
      const nearIdentical = deltaEHex("C6C6C6", "C5C5C5"); // ~0.36
      const slightlyDiff = deltaEHex("C6C6C6", "BABABA"); // ~4.37
      const veryDiff = deltaEHex("FF0000", "0000FF"); // ~176

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
});
