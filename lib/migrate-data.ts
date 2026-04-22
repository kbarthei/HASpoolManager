/**
 * DB-aware migration functions for Multi-AMS + Multi-Rack (1.x).
 *
 * Imported by:
 * - scripts/migrate-db.js (CLI at addon startup)
 * - tests/integration/migration-end-to-end.test.ts
 *
 * Idempotent: each function is safe to call multiple times.
 */

import type BetterSqlite3 from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { rewriteRackLocation, deriveAmsUnitsFromSlots } from "./migration-helpers";

type Db = BetterSqlite3.Database;

/**
 * Creates a default rack "Main" if no racks exist, rewrites legacy
 * "rack:R-C" spool locations to "rack:<id>:R-C", and drops the legacy
 * rack_rows / rack_columns settings rows.
 */
export function migrateRackData(db: Db): { created: boolean; rackId?: string } {
  const existing = db.prepare("SELECT COUNT(*) as c FROM racks").get() as { c: number };
  if (existing.c > 0) return { created: false };

  const rowsSetting = db.prepare("SELECT value FROM settings WHERE key = ?").get("rack_rows") as
    | { value: string }
    | undefined;
  const colsSetting = db.prepare("SELECT value FROM settings WHERE key = ?").get("rack_columns") as
    | { value: string }
    | undefined;
  const rows = rowsSetting ? parseInt(rowsSetting.value, 10) : 3;
  const cols = colsSetting ? parseInt(colsSetting.value, 10) : 10;
  const defaultRackId = randomUUID();

  db.prepare(
    "INSERT INTO racks (id, name, rows, cols, sort_order) VALUES (?, ?, ?, ?, ?)",
  ).run(defaultRackId, "Main", rows, cols, 0);

  const rewriteStmt = db.prepare("UPDATE spools SET location = ? WHERE id = ?");
  const allSpools = db.prepare("SELECT id, location FROM spools").all() as Array<{
    id: string;
    location: string | null;
  }>;
  for (const s of allSpools) {
    const rewritten = rewriteRackLocation(s.location, defaultRackId);
    if (rewritten !== s.location) {
      rewriteStmt.run(rewritten, s.id);
    }
  }

  db.prepare("DELETE FROM settings WHERE key IN (?, ?)").run("rack_rows", "rack_columns");

  return { created: true, rackId: defaultRackId };
}

/**
 * For each printer without any printer_ams_units row, derives the set of
 * (amsIndex, slotType) combos from its existing amsSlots rows and inserts
 * one row per combo (excluding external).
 */
export function migrateAmsUnits(db: Db): { createdUnits: number } {
  const printers = db.prepare("SELECT id FROM printers").all() as Array<{ id: string }>;
  let created = 0;

  const existsStmt = db.prepare("SELECT COUNT(*) as c FROM printer_ams_units WHERE printer_id = ?");
  const combosStmt = db.prepare(
    "SELECT DISTINCT ams_index, slot_type FROM ams_slots WHERE printer_id = ? AND slot_type IN ('ams', 'ams_ht')",
  );
  const insertStmt = db.prepare(
    "INSERT INTO printer_ams_units (id, printer_id, ams_index, slot_type, ha_device_id, display_name, enabled) VALUES (?, ?, ?, ?, '', ?, 1)",
  );

  for (const p of printers) {
    const already = (existsStmt.get(p.id) as { c: number }).c > 0;
    if (already) continue;

    const combos = combosStmt.all(p.id) as Array<{ ams_index: number; slot_type: string }>;
    const derived = deriveAmsUnitsFromSlots(
      combos.map((c) => ({ amsIndex: c.ams_index, slotType: c.slot_type })),
    );
    for (const unit of derived) {
      insertStmt.run(randomUUID(), p.id, unit.amsIndex, unit.slotType, unit.displayName);
      created++;
    }
  }

  return { createdUnits: created };
}
