import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseModelFile, summarize } from "@/lib/3mf-parser";

const fixture = (name: string) => readFileSync(resolve(__dirname, "../fixtures/3mf", name));

describe("3mf-parser", () => {
  describe("old-format", () => {
    it("parses prediction + weight + filaments from slice_info.config", async () => {
      const r = await parseModelFile(fixture("old-format.3mf"));
      expect(r.format).toBe("old");
      expect(r.warnings).toEqual([]);
      expect(r.cover).toBeInstanceOf(Buffer);
      expect((r.cover as Buffer).byteLength).toBeGreaterThan(2000);
      expect(r.plates.length).toBeGreaterThan(0);
      expect(r.plates[0].predictionSeconds).toBeGreaterThan(0);
      expect(r.plates[0].weightGrams).toBeGreaterThan(0);
      expect(r.filaments.length).toBeGreaterThan(0);
      expect(r.filaments[0].trayInfoIdx).toMatch(/^GF/);
      expect(r.filaments[0].type).toBeTypeOf("string");
      expect(r.filaments[0].usedGrams).toBeGreaterThan(0);
    });

    it("normalizes color hex to #RRGGBB uppercase", async () => {
      const r = await parseModelFile(fixture("old-format.3mf"));
      const f = r.filaments.find((x) => x.colorHex);
      expect(f?.colorHex).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("summarize() sums plate predictions + weights", async () => {
      const r = await parseModelFile(fixture("old-format.3mf"));
      const s = summarize(r);
      expect(s.totalPredictionSeconds).toBeGreaterThan(0);
      expect(s.totalWeightGrams).toBeGreaterThan(0);
    });
  });

  describe("new-format", () => {
    it("multi-object: extracts plater_name + project filaments + bbox objects", async () => {
      const r = await parseModelFile(fixture("new-multi-object.3mf"));
      expect(r.format).toBe("new");
      expect(r.warnings).toEqual([]);
      expect(r.cover).toBeInstanceOf(Buffer);
      expect(r.printerModel).toBe("Bambu Lab H2S");
      expect(r.layerHeightMm).toBe(0.2);
      expect(r.nozzleDiameterMm).toBe(0.4);
      expect(r.platerName).toBe("Router Mount");

      // plate_1.json had no per-filament data → falls back to project_settings
      // 4-filament configured (ASA + 3× PLA) — at least 4 entries
      expect(r.filaments.length).toBeGreaterThanOrEqual(4);
      expect(r.filaments[0].colorHex).toBe("#FFFFFF");
      expect(r.filaments[0].type).toBe("ASA");

      // bbox_objects from plate_1.json
      const objNames = r.plates[0].objects.map((o) => o.name);
      expect(objNames).toContain("clamp_north.stl");
      expect(objNames).toContain("clamp_south.stl");
    });

    it("single-object: extracts bed_type + filament fallback", async () => {
      const r = await parseModelFile(fixture("new-single-object.3mf"));
      expect(r.format).toBe("new");
      expect(r.cover).toBeInstanceOf(Buffer);
      expect(r.plates[0].bedType).toBe("textured_plate");
      expect(r.filaments.length).toBeGreaterThan(0);
    });

    it("new-format has null prediction + weight (no embedded gcode)", async () => {
      const r = await parseModelFile(fixture("new-multi-object.3mf"));
      const s = summarize(r);
      expect(s.totalPredictionSeconds).toBeNull();
      expect(s.totalWeightGrams).toBeNull();
    });
  });

  describe("sha256 + dedup", () => {
    it("returns deterministic sha256 hash", async () => {
      const buf = fixture("new-multi-object.3mf");
      const r1 = await parseModelFile(buf);
      const r2 = await parseModelFile(buf);
      expect(r1.sha256).toBe(r2.sha256);
      expect(r1.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it("different files have different hashes", async () => {
      const r1 = await parseModelFile(fixture("old-format.3mf"));
      const r2 = await parseModelFile(fixture("new-single-object.3mf"));
      expect(r1.sha256).not.toBe(r2.sha256);
    });
  });

  describe("edge cases", () => {
    it("invalid zip → format=geometry-only with warning", async () => {
      const garbage = Buffer.from("not a zip file");
      const r = await parseModelFile(garbage);
      expect(r.format).toBe("geometry-only");
      expect(r.warnings.some((w) => w.startsWith("zip-load-failed"))).toBe(true);
      expect(r.cover).toBeNull();
      expect(r.plates).toEqual([]);
      expect(r.filaments).toEqual([]);
    });

    it("empty zip → geometry-only", async () => {
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      const buf = await z.generateAsync({ type: "nodebuffer" });
      const r = await parseModelFile(buf);
      expect(r.format).toBe("geometry-only");
      expect(r.warnings).toContain("no-slicer-metadata");
    });
  });
});
