/**
 * Per-worker SQLite test database harness.
 *
 * Usage in an integration test:
 *
 *   import { setupTestDb } from "@/tests/harness/sqlite-db";
 *
 *   beforeAll(async () => {
 *     await setupTestDb(); // creates fresh per-worker DB, runs migrations
 *   });
 *
 * After setupTestDb() has run, `import { db } from "@/lib/db"` will lazily
 * initialise against the test SQLite file because we set SQLITE_PATH *before*
 * the first Proxy access in lib/db/index.ts.
 *
 * The harness is idempotent per worker: calling setupTestDb() a second time
 * in the same process is a no-op.
 */

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/db/schema";

const REPO_ROOT = path.resolve(__dirname, "../..");
const TMP_DIR = path.join(REPO_ROOT, "tests", "tmp");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "lib", "db", "migrations");

let initialized = false;

export function testDbPath(): string {
  const workerId = process.env.VITEST_WORKER_ID ?? "0";
  return path.join(TMP_DIR, `test-${workerId}.db`);
}

export async function setupTestDb(): Promise<void> {
  if (initialized) return;

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const dbPath = testDbPath();
  // Fresh DB for this worker
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  for (const suffix of ["-wal", "-shm"]) {
    const side = dbPath + suffix;
    if (fs.existsSync(side)) fs.unlinkSync(side);
  }

  // Apply schema via Drizzle migrator (uses the same folder as production)
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const migrationDb = drizzle(sqlite, { schema });
  migrate(migrationDb, { migrationsFolder: MIGRATIONS_DIR });
  sqlite.close();

  // Point the production `@/lib/db` singleton at this file.
  // Must happen before any code in the test file accesses `db`.
  process.env.SQLITE_PATH = dbPath;

  // Default API key so requireAuth() succeeds with the bearer we send.
  if (!process.env.API_SECRET_KEY) {
    process.env.API_SECRET_KEY = "test-api-key";
  }

  initialized = true;
}

export function teardownTestDb(): void {
  const dbPath = testDbPath();
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  }
  initialized = false;
}
