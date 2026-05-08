import { describe, it, expect } from "vitest";
import { tokenize, countShared, collapse } from "@/lib/printer-ftp-pull";

describe("printer-ftp-pull token matching", () => {
  describe("tokenize", () => {
    it("strips .gcode.3mf suffix and splits on non-alphanumeric", () => {
      expect(tokenize("Plant_Clip_Plant_Support.gcode.3mf")).toEqual(
        new Set(["plant", "clip", "support"]),
      );
    });

    it("drops single-character tokens", () => {
      // "0.2mm layer" → {"0", "2mm", "layer"} → filter ≥ 2 → {"2mm", "layer"}
      expect(tokenize("0.2mm layer")).toEqual(new Set(["2mm", "layer"]));
    });

    it("returns matchable tokens for a real print name", () => {
      expect(tokenize("Plant Clip - PLA version")).toEqual(
        new Set(["plant", "clip", "pla", "version"]),
      );
    });

    it("slicer-preset names produce only generic tokens", () => {
      // Live-observed Bambu Studio default: when the user prints without
      // saving a project name, MQTT print_name is the slicer-process
      // preset like this. Its tokens should not overlap with real model
      // filenames — that's why the fallback path exists.
      const tokens = tokenize("0.2mm layer, 2 walls, 15% infill");
      expect(tokens).toEqual(new Set(["2mm", "layer", "walls", "15", "infill"]));
    });
  });

  describe("countShared", () => {
    it("returns the number of shared tokens", () => {
      const printName = tokenize("Plant Clip - PLA version");
      const filename = tokenize("Plant_Clip_Plant_Support.gcode.3mf");
      expect(countShared(printName, filename)).toBe(2); // plant, clip
    });

    it("returns 0 for slicer-preset name vs realistic filename", () => {
      // Regression guard: this is the case that motivated the
      // newest-recent-upload fallback. If countShared() ever returns >0
      // here by accident (e.g. someone loosens tokenize()), the fallback
      // wouldn't trigger and we'd silently link wrong files.
      const printName = tokenize("0.2mm layer, 2 walls, 15% infill");
      const filename = tokenize("Plant_Clip_Plant_Support.gcode.3mf");
      expect(countShared(printName, filename)).toBe(0);
    });

    it("returns 0 when the two sets are disjoint", () => {
      expect(countShared(tokenize("alpha bravo"), tokenize("charlie delta"))).toBe(0);
    });
  });

  describe("collapse", () => {
    it("strips suffixes, separators, and punctuation", () => {
      expect(collapse("Plant_Clip_Plant_Support.gcode.3mf")).toBe("plantclipplantsupport");
      expect(collapse("Plant Clip - PLA version")).toBe("plantclipplaversion");
    });
  });
});
