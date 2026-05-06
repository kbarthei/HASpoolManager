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
  {
    name: "drop prints.active_spool_id (replaced by active_spool_ids)",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return !cols.some((c) => c.name === "active_spool_id");
    },
    apply: () => {
      // Backfill: ensure every legacy print also has the JSON-array column populated.
      const result = db.prepare(
        "UPDATE prints SET active_spool_ids = json_array(active_spool_id) " +
        "WHERE active_spool_id IS NOT NULL AND active_spool_ids IS NULL"
      ).run();
      if (result.changes > 0) {
        console.log(`[migrate]   → Backfilled active_spool_ids for ${result.changes} legacy print(s)`);
      }
      // SQLite 3.35+ supports DROP COLUMN natively (better-sqlite3 bundles 3.40+).
      // The FK reference to spools(id) goes with the column.
      db.exec("ALTER TABLE prints DROP COLUMN active_spool_id");
    },
  },
  {
    name: "drop dead external_id + auto_supply_log_id columns",
    check: () => {
      const filaments = db.pragma("table_info(filaments)");
      const spools = db.pragma("table_info(spools)");
      const orders = db.pragma("table_info(orders)");
      // All three must be gone for the migration to be considered done.
      return (
        !filaments.some((c) => c.name === "external_id") &&
        !spools.some((c) => c.name === "external_id") &&
        !orders.some((c) => c.name === "auto_supply_log_id")
      );
    },
    apply: () => {
      // Drop in order; each is independent. SQLite 3.35+ DROP COLUMN.
      // Drift column on orders — not in schema.ts but still in live DB; FK
      // pointed at the long-deleted auto_supply_log table.
      db.exec("ALTER TABLE filaments DROP COLUMN external_id");
      db.exec("ALTER TABLE spools DROP COLUMN external_id");
      db.exec("ALTER TABLE orders DROP COLUMN auto_supply_log_id");
    },
  },
  {
    name: "add model_files + model_file_filaments tables",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('model_files','model_file_filaments')").all();
      return tables.length === 2;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS model_files (
          id text PRIMARY KEY NOT NULL,
          filename text NOT NULL,
          sha256 text NOT NULL,
          format text NOT NULL,
          uploaded_at text DEFAULT (datetime('now')) NOT NULL,
          uploaded_via text DEFAULT 'upload' NOT NULL,
          printer_model text,
          layer_height_mm real,
          nozzle_diameter_mm real,
          plater_name text,
          plate_count integer DEFAULT 1 NOT NULL,
          total_prediction_seconds integer,
          total_weight_grams real,
          cover_path text,
          parse_warnings text
        );
        CREATE UNIQUE INDEX IF NOT EXISTS model_files_sha256_unique ON model_files (sha256);
        CREATE INDEX IF NOT EXISTS idx_model_files_uploaded ON model_files (uploaded_at);
        CREATE INDEX IF NOT EXISTS idx_model_files_filename ON model_files (filename);

        CREATE TABLE IF NOT EXISTS model_file_filaments (
          id text PRIMARY KEY NOT NULL,
          model_file_id text NOT NULL,
          plate_index integer NOT NULL,
          sequence_id integer NOT NULL,
          tray_info_idx text,
          filament_type text,
          color_hex text,
          used_grams real,
          used_meters real,
          FOREIGN KEY (model_file_id) REFERENCES model_files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mff_model ON model_file_filaments (model_file_id);
        CREATE INDEX IF NOT EXISTS idx_mff_tray ON model_file_filaments (tray_info_idx);
      `);
    },
  },
  {
    name: "add printers.access_code + model_files.md5 columns",
    check: () => {
      const printerCols = db.pragma("table_info(printers)");
      const modelFileCols = db.pragma("table_info(model_files)");
      return printerCols.some((c) => c.name === "access_code") &&
        modelFileCols.some((c) => c.name === "md5");
    },
    apply: () => {
      const printerCols = db.pragma("table_info(printers)");
      if (!printerCols.some((c) => c.name === "access_code")) {
        db.exec("ALTER TABLE printers ADD COLUMN access_code TEXT");
      }
      const modelFileCols = db.pragma("table_info(model_files)");
      if (!modelFileCols.some((c) => c.name === "md5")) {
        db.exec("ALTER TABLE model_files ADD COLUMN md5 TEXT");
      }
    },
  },
  {
    name: "add prints.model_file_id + planned_weight_g columns",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "model_file_id") && cols.some((c) => c.name === "planned_weight_g");
    },
    apply: () => {
      const cols = db.pragma("table_info(prints)");
      if (!cols.some((c) => c.name === "model_file_id")) {
        db.exec("ALTER TABLE prints ADD COLUMN model_file_id text REFERENCES model_files(id)");
      }
      if (!cols.some((c) => c.name === "planned_weight_g")) {
        db.exec("ALTER TABLE prints ADD COLUMN planned_weight_g real");
      }
    },
  },
  {
    name: "add prints.photo_urls + backfill from cover_image_path / snapshot_path",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "photo_urls");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN photo_urls TEXT");
      // Backfill: for every row with a cover or snapshot path, build a JSON
      // array preserving kind + captured_at. Non-destructive — the old
      // cover_image_path and snapshot_path columns stay in place.
      const rows = db.prepare(`
        SELECT id, started_at, finished_at, cover_image_path, snapshot_path
        FROM prints
        WHERE cover_image_path IS NOT NULL OR snapshot_path IS NOT NULL
      `).all();
      const upd = db.prepare("UPDATE prints SET photo_urls = ? WHERE id = ?");
      let backfilled = 0;
      for (const row of rows) {
        const entries = [];
        if (row.cover_image_path) {
          entries.push({
            path: row.cover_image_path,
            kind: "cover",
            captured_at: row.started_at ?? null,
          });
        }
        if (row.snapshot_path) {
          entries.push({
            path: row.snapshot_path,
            kind: "snapshot",
            captured_at: row.finished_at ?? row.started_at ?? null,
          });
        }
        if (entries.length > 0) {
          upd.run(JSON.stringify(entries), row.id);
          backfilled++;
        }
      }
      if (backfilled > 0) {
        console.log(`[migrate]   → Backfilled photo_urls for ${backfilled} print(s)`);
      }
    },
  },
  {
    name: "add api_keys.expires_at column",
    check: () => {
      const cols = db.pragma("table_info(api_keys)");
      return cols.some((c) => c.name === "expires_at");
    },
    apply: () => {
      db.exec("ALTER TABLE api_keys ADD COLUMN expires_at TEXT");
      console.log("[migrate]   → Added expires_at column to api_keys table");
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
