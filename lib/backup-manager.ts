import Database from "better-sqlite3";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import path from "path";

const BACKUP_FILENAME_PREFIX = "haspoolmanager-";
const BACKUP_FILENAME_SUFFIX = ".db.gz";
const DEFAULT_RETENTION_DAYS = 14;

export interface BackupFile {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
}

export interface BackupResult {
  filename: string;
  path: string;
  size: number;
  durationMs: number;
}

function getSqlitePath(): string {
  return process.env.SQLITE_PATH ?? "./data/haspoolmanager.db";
}

function getBackupDir(): string {
  return process.env.BACKUP_DIR ?? "/config/haspoolmanager/backups";
}

function buildBackupFilename(date: Date): string {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  const trimmed = iso.slice(0, 19);
  return `${BACKUP_FILENAME_PREFIX}${trimmed}${BACKUP_FILENAME_SUFFIX}`;
}

function parseBackupFilename(filename: string): Date | null {
  if (!filename.startsWith(BACKUP_FILENAME_PREFIX) || !filename.endsWith(BACKUP_FILENAME_SUFFIX)) {
    return null;
  }
  const stamp = filename.slice(BACKUP_FILENAME_PREFIX.length, -BACKUP_FILENAME_SUFFIX.length);
  const [datePart, timePart] = stamp.split("T");
  if (!datePart || !timePart) return null;
  const iso = `${datePart}T${timePart.replace(/-/g, ":")}.000Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export async function runBackup(): Promise<BackupResult> {
  const start = Date.now();
  const sqlitePath = getSqlitePath();
  const backupDir = getBackupDir();

  mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const finalFilename = buildBackupFilename(now);
  const tempPath = path.join(backupDir, `.tmp-${now.getTime()}.db`);
  const finalPath = path.join(backupDir, finalFilename);

  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    await sqlite.backup(tempPath);
  } finally {
    sqlite.close();
  }

  try {
    await pipeline(createReadStream(tempPath), createGzip({ level: 9 }), createWriteStream(finalPath));
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
    }
  }

  const size = statSync(finalPath).size;
  return { filename: finalFilename, path: finalPath, size, durationMs: Date.now() - start };
}

export function listBackups(): BackupFile[] {
  const dir = getBackupDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const backups: BackupFile[] = [];
  for (const filename of entries) {
    const createdAt = parseBackupFilename(filename);
    if (!createdAt) continue;
    const fullPath = path.join(dir, filename);
    try {
      const st = statSync(fullPath);
      backups.push({ filename, path: fullPath, size: st.size, createdAt });
    } catch {
    }
  }

  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return backups;
}

export function cleanupOldBackups(retentionDays = DEFAULT_RETENTION_DAYS): { deleted: string[] } {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];

  for (const backup of listBackups()) {
    if (backup.createdAt.getTime() < cutoff) {
      try {
        unlinkSync(backup.path);
        deleted.push(backup.filename);
      } catch {
      }
    }
  }

  return { deleted };
}

export function resolveBackupFile(filename: string): string | null {
  if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
    return null;
  }
  if (!filename.startsWith(BACKUP_FILENAME_PREFIX) || !filename.endsWith(BACKUP_FILENAME_SUFFIX)) {
    return null;
  }
  const fullPath = path.join(getBackupDir(), filename);
  try {
    statSync(fullPath);
    return fullPath;
  } catch {
    return null;
  }
}

export { DEFAULT_RETENTION_DAYS };
