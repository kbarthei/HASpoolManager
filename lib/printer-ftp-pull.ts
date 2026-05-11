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
import { modelFiles, modelFileFilaments, printers, prints, syncLog } from "./db/schema";
import { downloadCacheFile, listCache3mfs, type FtpConfig } from "./printer-ftp";
import { parseModelFile, summarize } from "./3mf-parser";
import { saveCover } from "./model-file-store";

const PRINT_START_DELAY_MS = 30_000; // give printer 30s to settle before competing for FTP bandwidth
// Window for the "newest-cached-3mf" fallback when print_name has no
// token signal. 5 min covers Bambu Studio's slice-then-upload-then-start
// flow plus PRINT_START_DELAY_MS without ever picking a stale file.
const RECENT_UPLOAD_WINDOW_MS = 5 * 60_000;

/**
 * Persist an [ftp-pull] event to sync_log so it shows up in /admin/sync-log
 * even when docker stdout isn't accessible. Best-effort; never throw —
 * pull pipeline must keep working even if the diagnostic write fails.
 */
async function logFtpPull(
  printerId: string | null,
  printName: string | null,
  event: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(syncLog).values({
      printerId,
      rawState: null,
      normalizedState: null,
      printTransition: "ftp-pull",
      printName,
      printError: false,
      slotsUpdated: 0,
      responseJson: JSON.stringify({ event, ...details }),
    });
  } catch {
    // Diagnostic write failed — swallow. Don't block the actual pull.
  }
}

export interface PullParams {
  printerId: string;
  printId: string;
  filename: string; // bare filename, e.g. "Foo.gcode.3mf"
  /** Directory the file lives in. P1S/X1C/A1 use "cache"; H2S uses ""
   *  (root). Optional — defaults to "cache" for legacy callers. */
  dir?: string;
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
    buffer = await downloadCacheFile(config, filename, { dir: params.dir ?? "cache" });
  } catch (err) {
    const msg = (err as Error).message;
    const path = `${params.dir ?? "cache"}/${filename}`;
    console.error(`[ftp-pull] download failed for ${path}: ${msg}`);
    await logFtpPull(printerId, null, "download-failed", { path, error: msg });
    return;
  }
  await logFtpPull(printerId, null, "download-ok", {
    filename,
    dir: params.dir ?? "cache",
    bytes: buffer.byteLength,
  });

  const computedMd5 = createHash("md5").update(buffer).digest("hex");

  // Re-check by sha256/md5 once we have the bytes — another print of the
  // same file could have raced ahead.
  let parsed;
  try {
    parsed = await parseModelFile(buffer);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[ftp-pull] parse failed for ${filename}: ${msg}`);
    await logFtpPull(printerId, null, "parse-failed", { filename, bytes: buffer.byteLength, error: msg });
    return;
  }
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
  await logFtpPull(printerId, printName, "start", { printId, hasMd5: Boolean(md5) });

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
      await logFtpPull(printerId, printName, "md5-hit", { modelFileId: existing.id });
      return;
    }
  }

  const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
  if (!printer?.accessCode || !printer.ipAddress) {
    console.log(`[ftp-pull] skipped "${printName}" — printer has no accessCode or ipAddress`);
    await logFtpPull(printerId, printName, "skip-no-credentials", {});
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
    const msg = (err as Error).message;
    console.error(`[ftp-pull] list cache/ failed for ${printer.name}: ${msg}`);
    await logFtpPull(printerId, printName, "list-failed", { error: msg });
    return;
  }

  if (entries.length === 0) {
    console.log(`[ftp-pull] no .3mf files on ${printer.name}`);
    await logFtpPull(printerId, printName, "list-empty", {});
    return;
  }
  await logFtpPull(printerId, printName, "list-ok", {
    count: entries.length,
    newestName: entries[0].name,
    newestDir: entries[0].dir,
    newestSize: entries[0].size,
    newestMtime: entries[0].modifiedAt?.toISOString() ?? null,
  });

  // Token-overlap match. "Plant Clip - PLA version" prints from a file
  // called "Plant_Clip_Plant_Support.gcode.3mf"; substring-match misses
  // because neither string contains the other, but {plant, clip} are
  // shared tokens. Fall back to filename-substring only as a tiebreaker.
  const printTokens = tokenize(printName);
  const scored = entries.map((e) => {
    const fileTokens = tokenize(e.name);
    const shared = countShared(printTokens, fileTokens);
    // Bonus when filename strictly contains the print name (or vice versa)
    // — this catches cases where the user's print name IS the filename.
    const fileNorm = collapse(e.name);
    const printNorm = collapse(printName);
    const substringBonus = printNorm && (fileNorm.includes(printNorm) || printNorm.includes(fileNorm)) ? 100 : 0;
    return { entry: e, score: shared + substringBonus };
  });
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  // No token signal at all (e.g. print_name = slicer-process preset
  // "0.2mm layer, 2 walls, 15% infill" when user prints from Bambu
  // Studio without a saved project name). Fall back to the newest .3mf.
  // entries[] is sorted newest-first when mtime is available; when mtime
  // is missing (Bambu firmware doesn't always return MDTM), the order
  // collapses to alphabetical, which is unreliable — but we still take
  // the listing's first entry as a last resort because the alternative
  // (returning null) leaves the print permanently unlinked.
  if (best.score === 0) {
    const newest = entries[0];
    const hasMtime = Boolean(newest.modifiedAt);
    const ageMs = newest.modifiedAt ? Date.now() - newest.modifiedAt.getTime() : null;

    // Without a real mtime we can't tell which file is "the one Studio
    // just uploaded for this print" — the listing's first entry without
    // mtime is an alphabetical artifact, not the freshest file. Give up
    // rather than link the wrong file. listCache3mfs() now backfills via
    // per-file MDTM, so this branch only triggers when the printer's
    // firmware supports neither MLSD nor MDTM (rare).
    if (ageMs === null) {
      console.log(
        `[ftp-pull] no token match for "${printName}" and no usable mtime on cache files — leaving prints.model_file_id null`,
      );
      await logFtpPull(printerId, printName, "give-up-no-mtime", {
        newestName: newest.name,
        candidates: entries.length,
      });
      return;
    }

    if (ageMs > RECENT_UPLOAD_WINDOW_MS) {
      const ageMin = Math.round(ageMs / 60_000);
      console.log(
        `[ftp-pull] no token match for "${printName}" and newest .3mf is ${ageMin}m old — leaving prints.model_file_id null`,
      );
      await logFtpPull(printerId, printName, "give-up-stale-newest", {
        newestName: newest.name,
        ageMin,
      });
      return;
    }

    const ageDesc = `${Math.round(ageMs / 1000)}s old`;
    console.log(
      `[ftp-pull] no token match for "${printName}" — falling back to newest cached .3mf "${newest.name}" (${ageDesc})`,
    );
    await logFtpPull(printerId, printName, "fallback-newest", {
      newestName: newest.name,
      newestDir: newest.dir,
      hasMtime,
      ageMs,
    });
    await pullFromPrinterAndLink({
      printerId,
      printId,
      filename: newest.name,
      dir: newest.dir,
      md5,
    });

    // Surface link state after pull (the helper logs its own internal
    // steps but doesn't update prints.model_file_id from this caller's
    // perspective). Re-read the print row.
    const refreshed = await db.query.prints.findFirst({
      where: eq(prints.id, printId),
      columns: { modelFileId: true, plannedWeightG: true },
    });
    await logFtpPull(printerId, printName, "post-pull", {
      modelFileId: refreshed?.modelFileId ?? null,
      plannedWeightG: refreshed?.plannedWeightG ?? null,
    });
    return;
  }

  const target = best.entry;
  const displayPath = target.dir ? `${target.dir}/${target.name}` : `/${target.name}`;
  console.log(`[ftp-pull] selected "${displayPath}" for print "${printName}" (score=${best.score})`);
  await logFtpPull(printerId, printName, "match-token", {
    targetName: target.name,
    targetDir: target.dir,
    score: best.score,
  });

  await pullFromPrinterAndLink({
    printerId,
    printId,
    filename: target.name,
    dir: target.dir,
    md5,
  });
  const refreshed = await db.query.prints.findFirst({
    where: eq(prints.id, printId),
    columns: { modelFileId: true, plannedWeightG: true },
  });
  await logFtpPull(printerId, printName, "post-pull", {
    modelFileId: refreshed?.modelFileId ?? null,
    plannedWeightG: refreshed?.plannedWeightG ?? null,
  });
}

// Strip the `.gcode.3mf` / `.3mf` suffix, lowercase, collapse whitespace.
// "Plant Clip - PLA version" → "plantclipplaversion".
export function collapse(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.gcode\.3mf$/i, "")
    .replace(/\.3mf$/i, "")
    .replace(/[\s\-_]+/g, "")
    .replace(/sliced$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

// Split into lowercase alphanumeric tokens of length ≥ 2.
// Drops uninformative single chars and noise.
export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/\.gcode\.3mf$/i, "")
      .replace(/\.3mf$/i, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2),
  );
}

export function countShared(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}
