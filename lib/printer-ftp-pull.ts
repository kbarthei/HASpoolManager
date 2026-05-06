/**
 * High-level orchestrator: fetch a 3MF from the printer's cache, parse it,
 * persist metadata + cover, and link it to a print row.
 *
 * Designed to be called from the sync-worker on `event_print_started`. The
 * function is fire-and-forget safe: any failure (printer offline, no access
 * code, file not found, parse error) is logged and swallowed. The print row
 * remains usable without the model_file_id link.
 *
 * Dedup logic:
 *  1. If the MQTT command exposed an MD5, look up `model_files.md5` first
 *  2. Else, try filename match
 *  3. Only if both miss → FTP-pull the bytes
 */

import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "./db";
import { modelFiles, modelFileFilaments, printers, prints } from "./db/schema";
import { downloadCacheFile, listCache3mfs, type FtpConfig } from "./printer-ftp";
import { parseModelFile, summarize } from "./3mf-parser";
import { saveCover } from "./model-file-store";

const PRINT_START_DELAY_MS = 30_000; // give printer 30s to settle before competing for FTP bandwidth

export interface PullParams {
  printerId: string;
  printId: string;
  filename: string; // e.g. "cache/X.gcode.3mf" or just "X.gcode.3mf"
  md5?: string | null; // from MQTT project_file command
}

export async function pullFromPrinterAndLink(params: PullParams): Promise<void> {
  const { printerId, printId, filename: rawFilename, md5 } = params;
  const filename = rawFilename.replace(/^cache\//, "").replace(/^.*\//, "");

  if (md5) {
    const existing = await db.query.modelFiles.findFirst({
      where: eq(modelFiles.md5, md5),
    });
    if (existing) {
      console.log(`[ftp-pull] MD5 hit for ${filename} → reusing modelFile=${existing.id}`);
      await linkPrintToModel(printId, existing.id, existing.totalWeightGrams);
      return;
    }
  }

  const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
  if (!printer?.accessCode || !printer.ipAddress) {
    console.log(`[ftp-pull] skipped ${filename} — printer has no accessCode or ipAddress`);
    return;
  }

  const config: FtpConfig = {
    host: printer.ipAddress,
    accessCode: printer.accessCode,
    ...(process.env.PRINTER_FTP_PORT_OVERRIDE
      ? { port: parseInt(process.env.PRINTER_FTP_PORT_OVERRIDE, 10) }
      : {}),
  };

  let buffer: Buffer;
  try {
    buffer = await downloadCacheFile(config, filename);
  } catch (err) {
    console.error(`[ftp-pull] download failed for cache/${filename}: ${(err as Error).message}`);
    return;
  }

  const computedMd5 = createHash("md5").update(buffer).digest("hex");

  // Re-check by sha256/md5 once we have the bytes — another print of the
  // same file could have raced ahead.
  const parsed = await parseModelFile(buffer);
  const dedup = await db.query.modelFiles.findFirst({
    where: eq(modelFiles.sha256, parsed.sha256),
  });
  if (dedup) {
    console.log(`[ftp-pull] sha256 hit post-download → reusing modelFile=${dedup.id}`);
    if (!dedup.md5) {
      await db.update(modelFiles).set({ md5: computedMd5 }).where(eq(modelFiles.id, dedup.id));
    }
    await linkPrintToModel(printId, dedup.id, dedup.totalWeightGrams);
    return;
  }

  const summary = summarize(parsed);
  const id = crypto.randomUUID();

  let coverPath: string | null = null;
  if (parsed.cover) {
    try {
      coverPath = saveCover(id, parsed.cover);
    } catch (err) {
      parsed.warnings.push(`cover-save-failed: ${(err as Error).message}`);
    }
  }

  await db.insert(modelFiles).values({
    id,
    filename,
    sha256: parsed.sha256,
    md5: computedMd5,
    format: parsed.format,
    uploadedVia: "ftp",
    printerModel: parsed.printerModel,
    layerHeightMm: parsed.layerHeightMm,
    nozzleDiameterMm: parsed.nozzleDiameterMm,
    platerName: parsed.platerName,
    plateCount: Math.max(parsed.plates.length, 1),
    totalPredictionSeconds: summary.totalPredictionSeconds,
    totalWeightGrams: summary.totalWeightGrams,
    coverPath,
    parseWarnings: parsed.warnings.length > 0 ? JSON.stringify(parsed.warnings) : null,
  });

  if (parsed.filaments.length > 0) {
    await db.insert(modelFileFilaments).values(
      parsed.filaments.map((f) => ({
        modelFileId: id,
        plateIndex: f.plateIndex,
        sequenceId: f.sequenceId,
        trayInfoIdx: f.trayInfoIdx,
        filamentType: f.type,
        colorHex: f.colorHex,
        usedGrams: f.usedGrams,
        usedMeters: f.usedMeters,
      })),
    );
  }

  await linkPrintToModel(printId, id, summary.totalWeightGrams);
  console.log(`[ftp-pull] persisted ${filename} → modelFile=${id} format=${parsed.format} bytes=${buffer.byteLength}`);
}

async function linkPrintToModel(printId: string, modelFileId: string, plannedWeightG: number | null): Promise<void> {
  await db
    .update(prints)
    .set({ modelFileId, plannedWeightG, updatedAt: new Date() })
    .where(eq(prints.id, printId));
}

/**
 * Schedule a delayed pull. Returns immediately; logs+swallows errors.
 * Defer is needed because Bambu's FTP server prioritizes the active print
 * over concurrent reads; large 3MFs can timeout if pulled in the first 5–10s.
 */
export function schedulePullFromPrinter(params: PullParams, delayMs = PRINT_START_DELAY_MS): void {
  setTimeout(() => {
    pullFromPrinterAndLink(params).catch((err) => {
      console.error(`[ftp-pull] unexpected error for ${params.filename}: ${(err as Error).message}`);
    });
  }, delayMs);
}

/**
 * When the sync-worker only knows `print_name` (not the exact cache filename),
 * list the cache directory and find the best match. Bambu names cache files
 * like `<print_name>.gcode.3mf` but the print_name MQTT field may be truncated
 * or normalized differently — so we match by substring against the actual
 * directory listing.
 */
export async function pullByPrintName(
  printerId: string,
  printId: string,
  printName: string,
  md5?: string | null,
): Promise<void> {
  // MD5 short-circuit before we even open FTP
  if (md5) {
    const existing = await db.query.modelFiles.findFirst({
      where: eq(modelFiles.md5, md5),
    });
    if (existing) {
      await db
        .update(prints)
        .set({
          modelFileId: existing.id,
          plannedWeightG: existing.totalWeightGrams,
          updatedAt: new Date(),
        })
        .where(eq(prints.id, printId));
      console.log(`[ftp-pull] MD5 hit before FTP — skipped pull for "${printName}"`);
      return;
    }
  }

  const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
  if (!printer?.accessCode || !printer.ipAddress) {
    console.log(`[ftp-pull] skipped "${printName}" — printer has no accessCode or ipAddress`);
    return;
  }

  const config: FtpConfig = {
    host: printer.ipAddress,
    accessCode: printer.accessCode,
    ...(process.env.PRINTER_FTP_PORT_OVERRIDE
      ? { port: parseInt(process.env.PRINTER_FTP_PORT_OVERRIDE, 10) }
      : {}),
  };
  let entries;
  try {
    entries = await listCache3mfs(config);
  } catch (err) {
    console.error(`[ftp-pull] list cache/ failed for ${printer.name}: ${(err as Error).message}`);
    return;
  }

  if (entries.length === 0) {
    console.log(`[ftp-pull] cache/ empty on ${printer.name}`);
    return;
  }

  // Match by substring on normalized form. Cache filenames are like
  // "<name>.gcode.3mf" — strip suffix, lower-case, then substring-compare.
  const printNameNorm = normalize(printName);
  const matches = entries.filter((e) => {
    const fnNorm = normalize(e.name);
    return fnNorm.includes(printNameNorm) || printNameNorm.includes(fnNorm);
  });

  // Prefer a substring match; if none, fall back to the most-recently-modified
  // file (heuristic: BBS just uploaded it, so it's the freshest).
  const target = matches[0] ?? entries[0];
  console.log(`[ftp-pull] selected "${target.name}" for print "${printName}" (${matches.length === 0 ? "fallback-newest" : "substring-match"})`);

  await pullFromPrinterAndLink({
    printerId,
    printId,
    filename: target.name,
    md5,
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.gcode\.3mf$/i, "")
    .replace(/\.3mf$/i, "")
    .replace(/[\s\-_]+/g, "")
    .replace(/sliced$/i, "");
}
