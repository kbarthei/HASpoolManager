/* eslint-disable no-console */
/**
 * Profile getAllDiagnostics() — call each detector individually and print
 * its timing. Used to isolate the slow query that's making
 * /admin/diagnostics flake on CI.
 *
 * Usage: SQLITE_PATH=tests/tmp/profile.db npx tsx scripts/profile-diagnostics.ts
 */

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../lib/db/schema";

const REPO_ROOT = path.resolve(__dirname, "..");
const TMP_DIR = path.join(REPO_ROOT, "tests", "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const dbPath = process.env.SQLITE_PATH ?? path.join(TMP_DIR, "profile.db");
for (const sfx of ["", "-wal", "-shm"]) {
  const p = dbPath + sfx;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(REPO_ROOT, "lib", "db", "migrations") });
sqlite.close();

process.env.SQLITE_PATH = dbPath;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  console.log(`  ${label.padEnd(28)} ${ms.toFixed(2).padStart(8)} ms`);
  return result;
}

(async () => {
  const {
    getSpoolDrift,
    getSpoolStale,
    getSpoolZeroActive,
    getPrintStuck,
    getPrintNoWeight,
    getPrintNoUsage,
    getOrderStuck,
    getSyncErrors,
    getOrphanPhotos,
    getHealthCheckFindings,
    getAllDiagnostics,
  } = await import("../lib/diagnostics");

  console.log("=== Individual queries (empty DB) ===");
  await timed("spoolDrift", getSpoolDrift);
  await timed("spoolStale", getSpoolStale);
  await timed("spoolZeroActive", getSpoolZeroActive);
  await timed("printStuck", getPrintStuck);
  await timed("printNoWeight", getPrintNoWeight);
  await timed("printNoUsage", getPrintNoUsage);
  await timed("orderStuck", getOrderStuck);
  await timed("syncErrors", getSyncErrors);
  await timed("orphanPhotos", getOrphanPhotos);
  await timed("healthCheckFindings", getHealthCheckFindings);

  console.log("\n=== getAllDiagnostics (Promise.all wrapper) ===");
  await timed("getAllDiagnostics", getAllDiagnostics);

  console.log("\n=== Run 5 more times to see warmup effect ===");
  for (let i = 0; i < 5; i++) {
    await timed(`run #${i + 1}`, getAllDiagnostics);
  }
})().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
