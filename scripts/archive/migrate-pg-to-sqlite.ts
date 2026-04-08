#!/usr/bin/env npx tsx
/**
 * Migrate data from Neon Postgres to SQLite.
 * Usage: npx tsx scripts/migrate-pg-to-sqlite.ts [output-path]
 * Default output: ./data/haspoolmanager.db
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const SQLITE_PATH = process.argv[2] || "./data/haspoolmanager.db";

// Tables in FK-safe order
const TABLES = [
  "settings",
  "vendors",
  "shops",
  "printers",
  "filaments",
  "spools",
  "tag_mappings",
  "orders",
  "order_items",
  "ams_slots",
  "prints",
  "print_usage",
  "shop_listings",
  "shop_listing_price_history",
  "shopping_list_items",
  "sync_log",
];

// Optional tables (may not exist)
const OPTIONAL_TABLES = ["api_keys", "reorder_rules", "auto_supply_rules", "auto_supply_log"];

// SQLite CREATE TABLE statements
const CREATE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    website TEXT,
    country TEXT,
    logo_url TEXT,
    bambu_prefix TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    website TEXT,
    country TEXT,
    currency TEXT DEFAULT 'EUR',
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS printers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    serial TEXT,
    mqtt_topic TEXT,
    ha_device_id TEXT,
    ip_address TEXT,
    ams_count INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS filaments (
    id TEXT PRIMARY KEY NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES vendors(id),
    name TEXT NOT NULL,
    material TEXT NOT NULL,
    diameter REAL NOT NULL DEFAULT 1.75,
    density REAL,
    color_name TEXT,
    color_hex TEXT,
    nozzle_temp_default INTEGER,
    nozzle_temp_min INTEGER,
    nozzle_temp_max INTEGER,
    bed_temp_default INTEGER,
    bed_temp_min INTEGER,
    bed_temp_max INTEGER,
    spool_weight INTEGER DEFAULT 1000,
    bambu_idx TEXT,
    external_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_filaments_vendor_name_color ON filaments(vendor_id, name, color_hex)`,
  `CREATE INDEX IF NOT EXISTS idx_filaments_material ON filaments(material)`,
  `CREATE INDEX IF NOT EXISTS idx_filaments_bambu_idx ON filaments(bambu_idx)`,
  `CREATE TABLE IF NOT EXISTS spools (
    id TEXT PRIMARY KEY NOT NULL,
    filament_id TEXT NOT NULL REFERENCES filaments(id),
    lot_number TEXT,
    purchase_date TEXT,
    purchase_price REAL,
    currency TEXT DEFAULT 'EUR',
    initial_weight INTEGER NOT NULL DEFAULT 1000,
    remaining_weight INTEGER NOT NULL DEFAULT 1000,
    location TEXT DEFAULT 'storage',
    status TEXT NOT NULL DEFAULT 'active',
    first_used_at TEXT,
    last_used_at TEXT,
    notes TEXT,
    external_id TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_spools_filament ON spools(filament_id)`,
  `CREATE INDEX IF NOT EXISTS idx_spools_location ON spools(location)`,
  `CREATE INDEX IF NOT EXISTS idx_spools_status ON spools(status)`,
  `CREATE TABLE IF NOT EXISTS tag_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    tag_uid TEXT NOT NULL UNIQUE,
    spool_id TEXT NOT NULL REFERENCES spools(id) ON DELETE CASCADE,
    source TEXT DEFAULT 'bambu',
    created_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    vendor_id TEXT REFERENCES vendors(id),
    shop_id TEXT REFERENCES shops(id),
    auto_supply_log_id TEXT,
    order_number TEXT,
    order_date TEXT NOT NULL DEFAULT (date('now')),
    expected_delivery TEXT,
    actual_delivery TEXT,
    status TEXT NOT NULL DEFAULT 'ordered',
    shipping_cost REAL DEFAULT 0,
    total_cost REAL,
    currency TEXT DEFAULT 'EUR',
    source_url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    filament_id TEXT REFERENCES filaments(id),
    spool_id TEXT REFERENCES spools(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ams_slots (
    id TEXT PRIMARY KEY NOT NULL,
    printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    slot_type TEXT NOT NULL DEFAULT 'ams',
    ams_index INTEGER NOT NULL,
    tray_index INTEGER NOT NULL,
    spool_id TEXT REFERENCES spools(id),
    bambu_tray_idx TEXT,
    bambu_color TEXT,
    bambu_type TEXT,
    bambu_tag_uid TEXT,
    bambu_remain INTEGER DEFAULT -1,
    is_empty INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS prints (
    id TEXT PRIMARY KEY NOT NULL,
    printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    name TEXT,
    gcode_file TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT,
    finished_at TEXT,
    duration_seconds INTEGER,
    total_layers INTEGER,
    print_weight REAL,
    print_length REAL,
    total_cost REAL,
    active_spool_id TEXT REFERENCES spools(id),
    active_spool_ids TEXT,
    remain_snapshot TEXT,
    ha_event_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prints_printer ON prints(printer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prints_status ON prints(status)`,
  `CREATE INDEX IF NOT EXISTS idx_prints_started ON prints(started_at)`,
  `CREATE TABLE IF NOT EXISTS print_usage (
    id TEXT PRIMARY KEY NOT NULL,
    print_id TEXT NOT NULL REFERENCES prints(id) ON DELETE CASCADE,
    spool_id TEXT NOT NULL REFERENCES spools(id),
    ams_slot_id TEXT REFERENCES ams_slots(id),
    weight_used REAL NOT NULL,
    length_used REAL,
    cost REAL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shop_listings (
    id TEXT PRIMARY KEY NOT NULL,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    filament_id TEXT NOT NULL REFERENCES filaments(id) ON DELETE CASCADE,
    product_url TEXT NOT NULL,
    sku TEXT,
    pack_size INTEGER DEFAULT 1,
    current_price REAL,
    price_per_spool REAL,
    currency TEXT DEFAULT 'EUR',
    in_stock INTEGER DEFAULT 1,
    last_checked_at TEXT,
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shop_listing_price_history (
    id TEXT PRIMARY KEY NOT NULL,
    listing_id TEXT NOT NULL REFERENCES shop_listings(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    price_per_spool REAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    in_stock INTEGER DEFAULT 1,
    recorded_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS shopping_list_items (
    id TEXT PRIMARY KEY NOT NULL,
    filament_id TEXT NOT NULL REFERENCES filaments(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY NOT NULL,
    printer_id TEXT REFERENCES printers(id),
    raw_state TEXT,
    normalized_state TEXT,
    print_transition TEXT,
    print_name TEXT,
    print_error INTEGER DEFAULT 0,
    slots_updated INTEGER DEFAULT 0,
    response_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_printer ON sync_log(printer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at)`,
];

function toIso(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return String(val);
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toBool(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return val ? 1 : 0;
}

function toJson(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

async function migrate() {
  console.log("=== Postgres → SQLite Migration ===\n");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  // Connect to Postgres
  console.log("Connecting to Postgres...");
  const pgQuery = neon(process.env.DATABASE_URL);

  // Create SQLite DB
  console.log(`Creating SQLite at ${SQLITE_PATH}...`);
  mkdirSync(dirname(SQLITE_PATH), { recursive: true });
  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = OFF");

  // Create tables
  console.log("Creating tables...");
  for (const stmt of CREATE_STATEMENTS) {
    sqlite.prepare(stmt).run();
  }

  // Migrate each table
  let hasErrors = false;

  for (const table of [...TABLES, ...OPTIONAL_TABLES]) {
    try {
      // Read from Postgres using tagged template
      // Can't use parameterized table names in tagged templates,
      // so we use sql.query() for the SELECT
      let rows: Record<string, unknown>[];
      try {
        rows = await pgQuery.query(`SELECT * FROM "${table}"`, []) as Record<string, unknown>[];
      } catch {
        if (OPTIONAL_TABLES.includes(table)) {
          console.log(`  ${table}: skipped (table not found)`);
          continue;
        }
        throw new Error(`Table ${table} not found in Postgres`);
      }
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows`);
        continue;
      }

      // Get SQLite column names for this table
      const sqliteCols = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
      const sqliteColNames = new Set(sqliteCols.map((c) => c.name));

      // Only use columns that exist in BOTH Postgres and SQLite
      const pgColumns = Object.keys(rows[0]);
      const columns = pgColumns.filter((col) => sqliteColNames.has(col));
      const skippedCols = pgColumns.filter((col) => !sqliteColNames.has(col));
      if (skippedCols.length > 0) {
        console.log(`    (skipping Postgres-only columns: ${skippedCols.join(", ")})`);
      }

      // Build INSERT statement
      const placeholders = columns.map(() => "?").join(", ");
      const insertSql = `INSERT OR REPLACE INTO "${table}" (${columns.join(", ")}) VALUES (${placeholders})`;
      const insert = sqlite.prepare(insertSql);

      // Insert in transaction
      const insertMany = sqlite.transaction((rowData: unknown[][]) => {
        for (const row of rowData) {
          insert.run(...row);
        }
      });

      // Transform rows
      const transformedRows = rows.map((row: Record<string, unknown>) => {
        return columns.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return null;

          // Boolean columns
          if (typeof val === "boolean") return val ? 1 : 0;

          // Date/timestamp columns
          if (val instanceof Date) return val.toISOString();

          // Object/array (JSONB) columns
          if (typeof val === "object") return JSON.stringify(val);

          // Numeric strings (Postgres numeric type returns strings)
          if (typeof val === "string" && col.match(/price|cost|weight_used|length_used|diameter|density/i)) {
            const n = Number(val);
            return isNaN(n) ? val : n;
          }

          return val;
        });
      });

      insertMany(transformedRows);

      // Verify count
      const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
      const match = sqliteCount.cnt === rows.length;
      console.log(`  ${table}: ${rows.length} rows → ${sqliteCount.cnt} ${match ? "[OK]" : "[MISMATCH]"}`);
      if (!match) hasErrors = true;

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (OPTIONAL_TABLES.includes(table)) {
        console.log(`  ${table}: skipped (${msg.slice(0, 50)})`);
      } else {
        console.error(`  ${table}: ERROR — ${msg}`);
        hasErrors = true;
      }
    }
  }

  // Re-enable foreign keys
  sqlite.pragma("foreign_keys = ON");
  sqlite.close();

  console.log(`\n=== Migration ${hasErrors ? "COMPLETED WITH ERRORS" : "COMPLETE"} ===`);
  console.log(`Output: ${SQLITE_PATH}`);

  if (hasErrors) process.exit(1);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
