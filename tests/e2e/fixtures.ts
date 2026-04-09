/**
 * E2e test fixtures. Opens the shared SQLite file directly (WAL mode lets
 * the Next.js server read concurrent writes) and exposes seed helpers.
 *
 * Seed via DB write, assert via UI — keeps tests fast without needing to
 * drive the server with HTTP.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

export function openE2eDb() {
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) {
    throw new Error(
      "E2E_DB_PATH not set — are you running inside `npm run test:e2e`?",
    );
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

export function e2eBaseUrl(): string {
  const url = process.env.E2E_BASE_URL;
  if (!url) throw new Error("E2E_BASE_URL not set");
  return url;
}
