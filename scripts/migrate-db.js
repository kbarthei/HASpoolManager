#!/usr/bin/env node
/**
 * Auto-migration script for the SQLite database.
 * Runs on every addon start before Next.js boots.
 * Adds missing columns and indices — idempotent, safe to run repeatedly.
 *
 * Usage: node migrate-db.js
 * Reads SQLITE_PATH env var (default: ./data/haspoolmanager.db)
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "../data/haspoolmanager.db");

console.log(`[migrate] Database: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log("[migrate] Database file does not exist yet — skipping");
  process.exit(0);
}

let db;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error(`[migrate] Cannot open database: ${err.message}`);
  process.exit(0);
}

// ── Migration definitions ───────────────────────────────────────────────────
// Each migration is idempotent: check() returns true when the change is
// already applied, apply() makes it. Runs on every addon startup before
// Next.js boots.
//
// When adding a schema change:
//   1. Edit lib/db/schema.ts (source of truth)
//   2. Run `npx drizzle-kit generate` → new lib/db/migrations/NNNN_*.sql
//      (used by the test harness for fresh DB bootstraps)
//   3. Add an idempotent entry here. Example:
//
//     {
//       name: "spools.foo column",
//       check: () => db.pragma("table_info(spools)").some((c) => c.name === "foo"),
//       apply: () => db.exec("ALTER TABLE spools ADD COLUMN foo TEXT"),
//     },

const migrations = [
  // No pending migrations.
];

// ── Run migrations ──────────────────────────────────────────────────────────

let applied = 0;
for (const m of migrations) {
  try {
    if (!m.check()) {
      console.log(`[migrate] Applying: ${m.name}`);
      m.apply();
      applied++;
    }
  } catch (err) {
    console.error(`[migrate] Error in "${m.name}": ${err.message}`);
  }
}

if (applied > 0) {
  console.log(`[migrate] Applied ${applied} migration(s)`);
} else {
  console.log(`[migrate] Schema up to date`);
}

db.close();
