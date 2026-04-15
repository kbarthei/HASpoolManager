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
  {
    name: "prints: rename total_cost to filament_cost",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "filament_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints RENAME COLUMN total_cost TO filament_cost");
    },
  },
  {
    name: "prints.energy_cost column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_cost REAL");
    },
  },
  {
    name: "prints.energy_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_kwh REAL");
    },
  },
  {
    name: "prints.energy_start_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_start_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_start_kwh REAL");
    },
  },
  {
    name: "prints.energy_end_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_end_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_end_kwh REAL");
    },
  },
  {
    name: "prints.total_cost column (filament + energy)",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      // total_cost column must exist AND filament_cost must also exist
      // (if filament_cost doesn't exist, total_cost is the old un-renamed column)
      return cols.some((c) => c.name === "total_cost") && cols.some((c) => c.name === "filament_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN total_cost REAL");
      db.exec("UPDATE prints SET total_cost = filament_cost WHERE filament_cost IS NOT NULL");
    },
  },
  {
    name: "hms_events table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hms_events'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE hms_events (
          id TEXT PRIMARY KEY,
          printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
          print_id TEXT REFERENCES prints(id) ON DELETE SET NULL,
          spool_id TEXT REFERENCES spools(id) ON DELETE SET NULL,
          filament_id TEXT REFERENCES filaments(id) ON DELETE SET NULL,
          hms_code TEXT NOT NULL,
          module TEXT,
          severity TEXT,
          message TEXT,
          wiki_url TEXT,
          slot_key TEXT,
          raw_attr INTEGER,
          raw_code INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX idx_hms_printer ON hms_events(printer_id)");
      db.exec("CREATE INDEX idx_hms_filament ON hms_events(filament_id)");
      db.exec("CREATE INDEX idx_hms_created ON hms_events(created_at)");
    },
  },
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
