/**
 * 3MF metadata parser for Bambu Studio / OrcaSlicer files.
 *
 * Handles two on-disk formats observed in the wild (122-file scan):
 *   - "old"  (FW ≤ 01.10): Metadata/slice_info.config has rich <plate>+<filament>
 *   - "new"  (FW ≥ 02.06): slice_info.config is a header stub; real data spread
 *                          across plate_1.json + project_settings.config + model_settings.config
 *   - "geometry-only":     no slicer metadata at all (raw OPC + 3D/3dmodel.model)
 *
 * No G-code is ever read back — re-slicing is the slicer's job, not ours.
 */

import { createHash } from "crypto";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type ParseFormat = "old" | "new" | "geometry-only";

export interface ParsedPlate {
  index: number;
  predictionSeconds: number | null;
  weightGrams: number | null;
  bedType: string | null;
  objects: Array<{ name: string; layerHeight: number | null }>;
}

export interface ParsedFilament {
  plateIndex: number;
  sequenceId: number;
  trayInfoIdx: string | null;
  type: string | null;
  colorHex: string | null;
  usedGrams: number | null;
  usedMeters: number | null;
}

export interface ParseResult {
  sha256: string;
  cover: Buffer | null;
  format: ParseFormat;
  warnings: string[];
  printerModel: string | null;
  layerHeightMm: number | null;
  nozzleDiameterMm: number | null;
  platerName: string | null;
  plates: ParsedPlate[];
  filaments: ParsedFilament[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
});

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeColor(hex: string | null): string | null {
  if (!hex) return null;
  const m = hex.match(/^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/);
  if (!m) return null;
  return `#${m[1].toUpperCase()}`;
}

export async function parseModelFile(buffer: Buffer): Promise<ParseResult> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const warnings: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    return {
      sha256,
      cover: null,
      format: "geometry-only",
      warnings: [`zip-load-failed: ${(err as Error).message}`],
      printerModel: null,
      layerHeightMm: null,
      nozzleDiameterMm: null,
      platerName: null,
      plates: [],
      filaments: [],
    };
  }

  const cover = await readCover(zip);
  if (!cover) warnings.push("no-cover");

  const sliceInfoRaw = await zip.file("Metadata/slice_info.config")?.async("string");
  const hasOldFormat = sliceInfoRaw ? /<plate>/.test(sliceInfoRaw) : false;
  const hasPlateJson = !!zip.file("Metadata/plate_1.json");
  const hasProjectSettings = !!zip.file("Metadata/project_settings.config");
  const hasModelSettings = !!zip.file("Metadata/model_settings.config");

  const format: ParseFormat = hasOldFormat
    ? "old"
    : hasPlateJson || hasProjectSettings || hasModelSettings
      ? "new"
      : "geometry-only";

  if (format === "geometry-only") {
    return {
      sha256,
      cover,
      format,
      warnings: [...warnings, "no-slicer-metadata"],
      printerModel: null,
      layerHeightMm: null,
      nozzleDiameterMm: null,
      platerName: null,
      plates: [],
      filaments: [],
    };
  }

  if (format === "old") {
    return readOldFormat(zip, sha256, cover, warnings, sliceInfoRaw!);
  }
  return readNewFormat(zip, sha256, cover, warnings);
}

async function readCover(zip: JSZip): Promise<Buffer | null> {
  const candidates = ["Metadata/plate_1.png", "Metadata/plate_1_small.png"];
  for (const path of candidates) {
    const entry = zip.file(path);
    if (entry) {
      try {
        const arr = await entry.async("uint8array");
        return Buffer.from(arr);
      } catch {
        // try next
      }
    }
  }
  return null;
}

// ─── Old format ─────────────────────────────────────────────────────────────

function readOldFormat(
  zip: JSZip,
  sha256: string,
  cover: Buffer | null,
  warnings: string[],
  xml: string,
): ParseResult {
  const parsed = xmlParser.parse(xml);
  const plates: ParsedPlate[] = [];
  const filaments: ParsedFilament[] = [];
  let printerModel: string | null = null;
  let nozzleDiameter: number | null = null;

  const plateNodes = asArray(parsed?.config?.plate);
  for (const plateNode of plateNodes) {
    const meta = asArray(plateNode?.metadata);
    const get = (key: string) => meta.find((m) => m["@_key"] === key)?.["@_value"];
    const idx = parseInt(get("index") ?? "1", 10);
    const prediction = asNumber(get("prediction"));
    const weight = asNumber(get("weight"));
    const printerModelId = asString(get("printer_model_id"));
    const nozzleDia = asNumber(get("nozzle_diameters"));
    if (printerModelId && !printerModel) printerModel = printerModelId;
    if (nozzleDia !== null && nozzleDiameter === null) nozzleDiameter = nozzleDia;

    const objects = asArray(plateNode?.object).map((o) => ({
      name: asString(o["@_name"]) ?? "Object",
      layerHeight: null,
    }));

    plates.push({
      index: idx,
      predictionSeconds: prediction,
      weightGrams: weight,
      bedType: null,
      objects,
    });

    for (const fil of asArray(plateNode?.filament)) {
      filaments.push({
        plateIndex: idx,
        sequenceId: parseInt(asString(fil["@_id"]) ?? "1", 10),
        trayInfoIdx: asString(fil["@_tray_info_idx"]),
        type: asString(fil["@_type"]),
        colorHex: normalizeColor(asString(fil["@_color"])),
        usedGrams: asNumber(fil["@_used_g"]),
        usedMeters: asNumber(fil["@_used_m"]),
      });
    }
  }

  return {
    sha256,
    cover,
    format: "old",
    warnings,
    printerModel,
    layerHeightMm: null, // not in old slice_info — could read project_settings if present, but old files predate it
    nozzleDiameterMm: nozzleDiameter,
    platerName: null,
    plates,
    filaments,
  };
}

// ─── New format ─────────────────────────────────────────────────────────────

interface ProjectSettings {
  printer_model?: string;
  layer_height?: string | number;
  nozzle_diameter?: string[] | string;
  filament_type?: string[];
  filament_colour?: string[];
  filament_settings_id?: string[];
}

async function readNewFormat(
  zip: JSZip,
  sha256: string,
  cover: Buffer | null,
  warnings: string[],
): Promise<ParseResult> {
  const projectSettingsRaw = await zip.file("Metadata/project_settings.config")?.async("string");
  const modelSettingsRaw = await zip.file("Metadata/model_settings.config")?.async("string");

  let project: ProjectSettings = {};
  if (projectSettingsRaw) {
    try {
      project = JSON.parse(projectSettingsRaw);
    } catch (err) {
      warnings.push(`project-settings-parse-failed: ${(err as Error).message}`);
    }
  }

  const printerModel = asString(project.printer_model);
  const layerHeight = asNumber(project.layer_height);
  const nozzleDiameters = Array.isArray(project.nozzle_diameter)
    ? project.nozzle_diameter
    : project.nozzle_diameter
      ? [project.nozzle_diameter]
      : [];
  const nozzleDiameter = nozzleDiameters.length > 0 ? asNumber(nozzleDiameters[0]) : null;

  let platerName: string | null = null;
  if (modelSettingsRaw) {
    const m = modelSettingsRaw.match(/<metadata\s+key="plater_name"\s+value="([^"]*)"/);
    if (m) platerName = m[1] || null;
  }

  // Walk every plate_N.json. plate_1 always present; multi-plate adds plate_2, etc.
  const plates: ParsedPlate[] = [];
  const filaments: ParsedFilament[] = [];
  let plateIndex = 1;
  while (true) {
    const plateJsonRaw = await zip.file(`Metadata/plate_${plateIndex}.json`)?.async("string");
    if (!plateJsonRaw) break;
    try {
      const plate = JSON.parse(plateJsonRaw);
      const objects = (plate.bbox_objects ?? []).map((o: { name?: string; layer_height?: number }) => ({
        name: asString(o.name) ?? "Object",
        layerHeight: asNumber(o.layer_height),
      }));
      plates.push({
        index: plateIndex,
        predictionSeconds: null, // not in new-format plate_1.json
        weightGrams: null,
        bedType: asString(plate.bed_type),
        objects,
      });

      // Per-plate filament colors come from plate JSON if populated; otherwise fall back to project_settings.
      const plateFilColors: string[] = Array.isArray(plate.filament_colors) ? plate.filament_colors : [];
      const plateFilIds: number[] = Array.isArray(plate.filament_ids) ? plate.filament_ids : [];

      if (plateFilIds.length > 0) {
        for (let i = 0; i < plateFilIds.length; i++) {
          const seq = plateFilIds[i];
          const projectColor = project.filament_colour?.[seq - 1];
          filaments.push({
            plateIndex,
            sequenceId: seq,
            trayInfoIdx: null,
            type: asString(project.filament_type?.[seq - 1]),
            colorHex: normalizeColor(plateFilColors[i] ?? projectColor ?? null),
            usedGrams: null,
            usedMeters: null,
          });
        }
      } else if (Array.isArray(project.filament_type)) {
        // Plate has no per-filament data — fall back to project-level "configured filaments" list.
        for (let i = 0; i < project.filament_type.length; i++) {
          filaments.push({
            plateIndex,
            sequenceId: i + 1,
            trayInfoIdx: null,
            type: asString(project.filament_type[i]),
            colorHex: normalizeColor(project.filament_colour?.[i] ?? null),
            usedGrams: null,
            usedMeters: null,
          });
        }
      }
    } catch (err) {
      warnings.push(`plate-${plateIndex}-parse-failed: ${(err as Error).message}`);
    }
    plateIndex++;
  }

  if (plates.length === 0) {
    warnings.push("no-plates-found");
    plates.push({ index: 1, predictionSeconds: null, weightGrams: null, bedType: null, objects: [] });
  }

  return {
    sha256,
    cover,
    format: "new",
    warnings,
    printerModel,
    layerHeightMm: layerHeight,
    nozzleDiameterMm: nozzleDiameter,
    platerName,
    plates,
    filaments,
  };
}

// ─── DB-friendly summary ────────────────────────────────────────────────────

export interface ModelFileSummary {
  totalPredictionSeconds: number | null;
  totalWeightGrams: number | null;
}

export function summarize(result: ParseResult): ModelFileSummary {
  const predictions = result.plates.map((p) => p.predictionSeconds).filter((n): n is number => n !== null);
  const weights = result.plates.map((p) => p.weightGrams).filter((n): n is number => n !== null);
  return {
    totalPredictionSeconds: predictions.length > 0 ? predictions.reduce((a, b) => a + b, 0) : null,
    totalWeightGrams: weights.length > 0 ? weights.reduce((a, b) => a + b, 0) : null,
  };
}
