import { describe, it, expect } from "vitest";
import { matchConfidence, normalizeForMatch } from "@/lib/model-file-match";

describe("model-file-match", () => {
  describe("normalizeForMatch", () => {
    it("strips spaces, underscores, dashes, .3mf, and 'sliced' suffix", () => {
      expect(normalizeForMatch("kamerahalter_nord_sliced.3mf")).toBe("kamerahalternord");
      expect(normalizeForMatch("Kamera-Halter Nord")).toBe("kamerahalternord");
    });
  });

  describe("matchConfidence", () => {
    it("scores identical normalized names as 1.0", () => {
      expect(matchConfidence("kamerahalter_nord", "kamerahalter_nord.3mf")).toBe(1);
    });

    it("scores sliced-suffix match as 1.0 (suffix stripped)", () => {
      expect(matchConfidence("kamerahalter_nord_sliced", "kamerahalter_nord.3mf")).toBe(1);
    });

    it("scores substring match by length ratio (≥0.9 for tight match)", () => {
      const score = matchConfidence("Berry_Fruit_Vortex", "Berry_Fruit_Vortex_v3.3mf");
      expect(score).toBeGreaterThanOrEqual(0.7);
    });

    it("scores unrelated names below 0.5", () => {
      expect(matchConfidence("router_mount", "garden_pot")).toBeLessThan(0.5);
    });

    it("returns 0 for empty input", () => {
      expect(matchConfidence("", "anything")).toBe(0);
      expect(matchConfidence("foo", "")).toBe(0);
    });
  });
});
