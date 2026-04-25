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
