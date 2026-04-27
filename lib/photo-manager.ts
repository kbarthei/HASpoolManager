import { mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { prints } from "./db/schema";

export type PhotoKind = "cover" | "snapshot" | "user";

export interface PhotoEntry {
  path: string;
  kind: PhotoKind;
  captured_at: string | null;
}

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_USER_PHOTOS_PER_PRINT = 5;

function getPhotoRoot(): string {
  return process.env.PHOTO_DIR ?? "/config/haspoolmanager/photos";
}

function safeFilename(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

function parseList(json: string | null): PhotoEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PhotoEntry =>
        e &&
        typeof e === "object" &&
        typeof e.path === "string" &&
        (e.kind === "cover" || e.kind === "snapshot" || e.kind === "user"),
    );
  } catch {
    return [];
  }
}

function serializeList(entries: PhotoEntry[]): string {
  return JSON.stringify(entries);
}

export async function getPhotos(printId: string): Promise<PhotoEntry[]> {
  const row = await db.query.prints.findFirst({
    where: eq(prints.id, printId),
    columns: { photoUrls: true },
  });
  return parseList(row?.photoUrls ?? null);
}

export function hasCoverPhoto(photoUrlsJson: string | null): boolean {
  return parseList(photoUrlsJson).some((p) => p.kind === "cover");
}

export async function savePhoto(
  printId: string,
  buffer: Buffer,
  kind: PhotoKind,
  ext: string,
): Promise<PhotoEntry> {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const root = getPhotoRoot();
  const dir = path.join(root, printId);
  mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = `${kind}-${ts}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
  const fullPath = path.join(dir, basename);
  writeFileSync(fullPath, buffer);

  const relPath = `${printId}/${basename}`;
  const entry: PhotoEntry = {
    path: relPath,
    kind,
    captured_at: new Date().toISOString(),
  };

  const current = await getPhotos(printId);
  const next = [...current, entry];
  await db.update(prints)
    .set({ photoUrls: serializeList(next), updatedAt: new Date() })
    .where(eq(prints.id, printId));

  return entry;
}

export async function deletePhoto(printId: string, filename: string): Promise<boolean> {
  if (!safeFilename(filename)) return false;
  const current = await getPhotos(printId);
  const target = current.find((e) => e.path === `${printId}/${filename}`);
  if (!target) return false;

  const fullPath = path.join(getPhotoRoot(), target.path);
  try {
    unlinkSync(fullPath);
  } catch {
  }

  const next = current.filter((e) => e.path !== target.path);
  await db.update(prints)
    .set({ photoUrls: serializeList(next), updatedAt: new Date() })
    .where(eq(prints.id, printId));
  return true;
}

export function resolvePhotoPath(printId: string, filename: string): string | null {
  if (!safeFilename(filename)) return null;
  // New layout: PHOTO_DIR/<printId>/<filename>
  const newPath = path.join(getPhotoRoot(), printId, filename);
  try {
    statSync(newPath);
    return newPath;
  } catch {
  }
  // Legacy layout: /config/snapshots/<filename> (pre-v1.1.6 cover/snapshot
  // captures). The migrate-db.js backfill kept these paths in photo_urls;
  // fall back here so existing prints' images still serve.
  const legacyPath = path.join("/config/snapshots", filename);
  try {
    statSync(legacyPath);
    return legacyPath;
  } catch {
    return null;
  }
}

export function listUserPhotoCount(entries: PhotoEntry[]): number {
  return entries.filter((e) => e.kind === "user").length;
}

/**
 * Save a cover photo, replacing any previous cover for the same print.
 *
 * Used by the manual capture-cover button: the user clicked it again because
 * they want a fresh capture, so we shouldn't accumulate old covers next to
 * the new one. The auto path (sync-worker state_changed) uses `hasCoverPhoto`
 * to skip when a cover already exists, so it never reaches this function.
 *
 * "Replace" deletes the old cover file from disk AFTER the new one is
 * written, so a crash mid-call never leaves the print with no cover at all.
 */
export async function replaceCoverPhoto(
  printId: string,
  buffer: Buffer,
  ext: string,
): Promise<PhotoEntry> {
  const previous = (await getPhotos(printId)).filter((e) => e.kind === "cover");
  const newEntry = await savePhoto(printId, buffer, "cover", ext);

  for (const old of previous) {
    const oldFullPath = path.join(getPhotoRoot(), old.path);
    try {
      unlinkSync(oldFullPath);
    } catch {
      // File already gone — that's fine, we just want it not to exist.
    }
  }

  if (previous.length > 0) {
    // Drop the old cover entries from photo_urls. Re-read to avoid clobbering
    // any other entry the savePhoto call appended.
    const after = (await getPhotos(printId)).filter(
      (e) => e.kind !== "cover" || e.path === newEntry.path,
    );
    await db.update(prints)
      .set({ photoUrls: serializeList(after), updatedAt: new Date() })
      .where(eq(prints.id, printId));
  }

  return newEntry;
}

export function deletePrintPhotoDir(printId: string): void {
  const dir = path.join(getPhotoRoot(), printId);
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      try {
        unlinkSync(path.join(dir, f));
      } catch {
      }
    }
    try {
      rmdirSync(dir);
    } catch {
    }
  } catch {
  }
}

// ── Orphan photo scanning ────────────────────────────────────────────────

export interface OrphanPhotoScan {
  /** Files on disk that no print references in its photo_urls (or whose print row is gone). */
  orphanFiles: Array<{ printId: string | null; filePath: string; bytes: number }>;
  /** photo_urls JSON entries pointing at a file that no longer exists on disk. */
  deadEntries: Array<{ printId: string; entryPath: string }>;
  /** Legacy /config/snapshots/<file> files no print references. */
  legacyOrphans: Array<{ filePath: string; bytes: number }>;
}

/** Build the set of relative paths referenced by every print's photo_urls. */
async function loadReferencedPaths(): Promise<{
  byPrint: Map<string, Set<string>>;
  legacyReferenced: Set<string>;
  knownPrintIds: Set<string>;
}> {
  const rows = await db.query.prints.findMany({
    columns: { id: true, photoUrls: true },
  });
  const byPrint = new Map<string, Set<string>>();
  const legacyReferenced = new Set<string>();
  const knownPrintIds = new Set<string>();
  for (const row of rows) {
    knownPrintIds.add(row.id);
    const entries = parseList(row.photoUrls);
    const set = new Set<string>();
    for (const e of entries) {
      // Normal layout: "<printId>/<filename>"
      // Legacy layout: "snapshots/<filename>" (pre-v1.1.6)
      if (e.path.startsWith("snapshots/")) {
        legacyReferenced.add(e.path.slice("snapshots/".length));
      } else {
        set.add(e.path);
      }
    }
    byPrint.set(row.id, set);
  }
  return { byPrint, legacyReferenced, knownPrintIds };
}

export async function scanForOrphans(): Promise<OrphanPhotoScan> {
  const root = getPhotoRoot();
  const { byPrint, legacyReferenced, knownPrintIds } = await loadReferencedPaths();

  const orphanFiles: OrphanPhotoScan["orphanFiles"] = [];
  const deadEntries: OrphanPhotoScan["deadEntries"] = [];
  const legacyOrphans: OrphanPhotoScan["legacyOrphans"] = [];

  // ── Pass 1: walk PHOTO_DIR/<printId>/<file> ───────────────────────────
  let printDirs: string[] = [];
  try {
    printDirs = readdirSync(root);
  } catch {
    // Photo root doesn't exist (fresh install / dev) — nothing to scan.
  }

  for (const dirName of printDirs) {
    const dirPath = path.join(root, dirName);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(dirPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const referenced = byPrint.get(dirName);
    const printExists = knownPrintIds.has(dirName);

    let files: string[] = [];
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }

    for (const file of files) {
      const relPath = `${dirName}/${file}`;
      const fullPath = path.join(dirPath, file);
      let size = 0;
      try {
        size = statSync(fullPath).size;
      } catch {
        continue;
      }
      if (!printExists) {
        // Print row is gone but the directory remains — orphan.
        orphanFiles.push({ printId: null, filePath: relPath, bytes: size });
      } else if (!referenced || !referenced.has(relPath)) {
        // File not in this print's photo_urls — orphan.
        orphanFiles.push({ printId: dirName, filePath: relPath, bytes: size });
      }
    }
  }

  // ── Pass 2: dead photo_urls entries ───────────────────────────────────
  for (const [printId, refs] of byPrint) {
    for (const ref of refs) {
      const fullPath = path.join(root, ref);
      try {
        statSync(fullPath);
      } catch {
        deadEntries.push({ printId, entryPath: ref });
      }
    }
  }

  // ── Pass 3: legacy /config/snapshots/ (pre-v1.1.6) ────────────────────
  const legacyDir = "/config/snapshots";
  let legacyFiles: string[] = [];
  try {
    legacyFiles = readdirSync(legacyDir);
  } catch {
    // Legacy dir doesn't exist — fine.
  }
  for (const file of legacyFiles) {
    if (legacyReferenced.has(file)) continue;
    const fullPath = path.join(legacyDir, file);
    try {
      const size = statSync(fullPath).size;
      legacyOrphans.push({ filePath: fullPath, bytes: size });
    } catch {
      // skip
    }
  }

  return { orphanFiles, deadEntries, legacyOrphans };
}

export interface OrphanCleanupResult {
  filesDeleted: number;
  bytesReclaimed: number;
  deadEntriesRemoved: number;
  emptyDirsRemoved: number;
}

export async function cleanupOrphans(): Promise<OrphanCleanupResult> {
  const scan = await scanForOrphans();
  const root = getPhotoRoot();
  let filesDeleted = 0;
  let bytesReclaimed = 0;
  const dirsToCheck = new Set<string>();

  // Delete orphan files (both new layout and legacy).
  for (const o of scan.orphanFiles) {
    const fullPath = path.join(root, o.filePath);
    try {
      unlinkSync(fullPath);
      filesDeleted++;
      bytesReclaimed += o.bytes;
      dirsToCheck.add(path.dirname(fullPath));
    } catch {
      // skip
    }
  }
  for (const o of scan.legacyOrphans) {
    try {
      unlinkSync(o.filePath);
      filesDeleted++;
      bytesReclaimed += o.bytes;
    } catch {
      // skip
    }
  }

  // Strip dead entries from photo_urls.
  const byPrint = new Map<string, Set<string>>();
  for (const e of scan.deadEntries) {
    const set = byPrint.get(e.printId) ?? new Set();
    set.add(e.entryPath);
    byPrint.set(e.printId, set);
  }
  let deadEntriesRemoved = 0;
  for (const [printId, deadPaths] of byPrint) {
    const current = await getPhotos(printId);
    const next = current.filter((entry) => {
      const isDead = deadPaths.has(entry.path);
      if (isDead) deadEntriesRemoved++;
      return !isDead;
    });
    if (next.length !== current.length) {
      await db.update(prints)
        .set({ photoUrls: serializeList(next), updatedAt: new Date() })
        .where(eq(prints.id, printId));
    }
  }

  // Try to remove now-empty print directories under PHOTO_DIR.
  let emptyDirsRemoved = 0;
  for (const dir of dirsToCheck) {
    if (!dir.startsWith(root)) continue; // safety: never touch /config/snapshots/
    try {
      const remaining = readdirSync(dir);
      if (remaining.length === 0) {
        rmdirSync(dir);
        emptyDirsRemoved++;
      }
    } catch {
      // skip
    }
  }

  return { filesDeleted, bytesReclaimed, deadEntriesRemoved, emptyDirsRemoved };
}
