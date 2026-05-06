/**
 * On-disk storage for 3MF cover images.
 *
 * Layout: <MODEL_FILE_DIR>/<modelFileId>/plate_1.png
 *
 * Per the 3MF plan we never store the raw .3mf archive — only the cover PNG
 * extracted at upload time. Re-slicing is the slicer's job.
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync, rmdirSync, readdirSync } from "fs";
import path from "path";

export function getModelFileRoot(): string {
  return process.env.MODEL_FILE_DIR ?? "/config/haspoolmanager/models";
}

export function saveCover(modelFileId: string, buffer: Buffer): string {
  const root = getModelFileRoot();
  const dir = path.join(root, modelFileId);
  mkdirSync(dir, { recursive: true });
  const filename = "plate_1.png";
  const fullPath = path.join(dir, filename);
  writeFileSync(fullPath, buffer);
  return `${modelFileId}/${filename}`;
}

export function readCover(relPath: string): { buffer: Buffer; bytes: number } | null {
  if (!isSafePath(relPath)) return null;
  const fullPath = path.join(getModelFileRoot(), relPath);
  try {
    const buffer = readFileSync(fullPath);
    return { buffer, bytes: buffer.byteLength };
  } catch {
    return null;
  }
}

export function deleteModelFileDir(modelFileId: string): void {
  const dir = path.join(getModelFileRoot(), modelFileId);
  try {
    if (!existsSync(dir)) return;
    const files = readdirSync(dir);
    for (const f of files) {
      try {
        unlinkSync(path.join(dir, f));
      } catch {
        // best-effort
      }
    }
    try {
      rmdirSync(dir);
    } catch {
      // best-effort
    }
  } catch {
    // best-effort
  }
}

function isSafePath(relPath: string): boolean {
  return !relPath.includes("..") && !relPath.includes("\\") && !path.isAbsolute(relPath);
}

export function coverExists(relPath: string | null | undefined): boolean {
  if (!relPath) return false;
  if (!isSafePath(relPath)) return false;
  try {
    statSync(path.join(getModelFileRoot(), relPath));
    return true;
  } catch {
    return false;
  }
}
