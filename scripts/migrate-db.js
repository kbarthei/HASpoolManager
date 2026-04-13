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
// Each migration checks if the change is needed before applying.

const migrations = [
  {
    name: "prints.spool_swaps column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "spool_swaps");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN spool_swaps TEXT");
    },
  },
  {
    name: "prints.cover_image_path column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "cover_image_path");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN cover_image_path TEXT");
    },
  },
  {
    name: "prints.snapshot_path column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "snapshot_path");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN snapshot_path TEXT");
    },
  },
  // Add future migrations here:
  // {
  //   name: "table.column_name",
  //   check: () => { const cols = db.pragma("table_info(table)"); return cols.some(c => c.name === "column_name"); },
  //   apply: () => { db.exec("ALTER TABLE table ADD COLUMN column_name TEXT"); },
  // },
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
