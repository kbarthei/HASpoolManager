#!/usr/bin/env node
/**
 * Data-quality health check.
 * Runs after migrate-db.js, before Next.js boots.
 *
 * Auto-fixes broken rows (negative weights, empty-but-not-labeled-empty,
 * orphan references) and logs every action to data_quality_log so the
 * admin UI can surface what happened.
 *
 * Usage: node scripts/health-check.js
 * Env:   SQLITE_PATH (default ./data/haspoolmanager.db)
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "../data/haspoolmanager.db");

console.log(`[health-check] Database: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log("[health-check] Database file does not exist — skipping");
  process.exit(0);
}

let db;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error(`[health-check] Cannot open database: ${err.message}`);
  process.exit(0);
}

const runAt = new Date().toISOString();

// Skip cleanly if the quality log table is missing (first run before migrate).
const logTableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='data_quality_log'")
  .all().length > 0;

const insertLog = logTableExists
  ? db.prepare(`
      INSERT INTO data_quality_log (id, run_at, rule_id, severity, entity_type, entity_id, action, details)
      VALUES (@id, @run_at, @rule_id, @severity, @entity_type, @entity_id, @action, @details)
    `)
  : null;

function log(ruleId, severity, action, entityType, entityId, details) {
  if (!insertLog) return;
  try {
    insertLog.run({
      id: crypto.randomUUID(),
      run_at: runAt,
      rule_id: ruleId,
      severity,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      action,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    console.error(`[health-check] log insert failed: ${err.message}`);
  }
}

const counters = {
  fixed: 0,
  flagged: 0,
  info: 0,
  errors: 0,
};

// ── Rule 0: SQLite integrity ────────────────────────────────────────────────
try {
  const integrity = db.pragma("quick_check", { simple: true });
  if (integrity !== "ok") {
    log("sqlite_integrity", "critical", "flagged", null, null, { result: integrity });
    counters.flagged++;
    console.error(`[health-check] quick_check returned: ${integrity}`);
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] integrity check failed: ${err.message}`);
}

// ── Rule 1: foreign key violations ──────────────────────────────────────────
try {
  const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
  for (const v of fkViolations) {
    log("foreign_key_violation", "critical", "flagged", v.table, String(v.rowid), v);
    counters.flagged++;
  }
  if (fkViolations.length > 0) {
    console.warn(`[health-check] ${fkViolations.length} FK violation(s) — see data_quality_log`);
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] FK check failed: ${err.message}`);
}

// ── Rule 2: remaining_weight < 0 ────────────────────────────────────────────
try {
  const broken = db.prepare(`
    SELECT id, remaining_weight FROM spools WHERE remaining_weight < 0
  `).all();
  const update = db.prepare(`UPDATE spools SET remaining_weight = 0 WHERE id = ?`);
  for (const row of broken) {
    update.run(row.id);
    log("spool_weight_negative", "critical", "auto_fixed", "spool", row.id, {
      before: row.remaining_weight,
      after: 0,
    });
    counters.fixed++;
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] negative-weight rule failed: ${err.message}`);
}

// ── Rule 3: remaining_weight > initial_weight ───────────────────────────────
try {
  const broken = db.prepare(`
    SELECT id, remaining_weight, initial_weight FROM spools
    WHERE initial_weight > 0 AND remaining_weight > initial_weight
  `).all();
  const update = db.prepare(`UPDATE spools SET remaining_weight = initial_weight WHERE id = ?`);
  for (const row of broken) {
    update.run(row.id);
    log("spool_weight_overflow", "critical", "auto_fixed", "spool", row.id, {
      before: row.remaining_weight,
      after: row.initial_weight,
    });
    counters.fixed++;
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] overflow-weight rule failed: ${err.message}`);
}

// ── Rule 4: empty spools with non-empty status ──────────────────────────────
// Spool status is derived in the UI; persisted "status" column exists on some
// records. Only touch rows where the mismatch is unambiguous.
try {
  const cols = db.pragma("table_info(spools)").map((c) => c.name);
  if (cols.includes("status")) {
    const broken = db.prepare(`
      SELECT id, status FROM spools
      WHERE remaining_weight = 0 AND status IS NOT NULL AND status != 'empty' AND status != 'archived'
    `).all();
    const update = db.prepare(`UPDATE spools SET status = 'empty' WHERE id = ?`);
    for (const row of broken) {
      update.run(row.id);
      log("spool_empty_status_mismatch", "warning", "auto_fixed", "spool", row.id, {
        before: row.status,
        after: "empty",
      });
      counters.fixed++;
    }
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] empty-status rule failed: ${err.message}`);
}

// ── Rule 5: orphan print_usage rows (spool deleted) ─────────────────────────
try {
  const orphans = db.prepare(`
    SELECT pu.id FROM print_usage pu
    LEFT JOIN spools s ON pu.spool_id = s.id
    WHERE pu.spool_id IS NOT NULL AND s.id IS NULL
  `).all();
  const update = db.prepare(`UPDATE print_usage SET spool_id = NULL WHERE id = ?`);
  for (const row of orphans) {
    update.run(row.id);
    log("print_usage_orphan_spool", "warning", "auto_fixed", "print_usage", row.id, {
      after: "spool_id set to NULL",
    });
    counters.fixed++;
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] orphan-usage rule failed: ${err.message}`);
}

// ── Rule 6: inactive shops (no orders, no listings) — info only ─────────────
try {
  const unused = db.prepare(`
    SELECT s.id, s.name FROM shops s
    WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.shop_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM shop_listings sl WHERE sl.shop_id = s.id)
  `).all();
  for (const row of unused) {
    log("shop_unused", "info", "info", "shop", row.id, { name: row.name });
    counters.info++;
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] unused-shop rule failed: ${err.message}`);
}

// ── Rule 7: filaments without spools — info only ────────────────────────────
try {
  const unused = db.prepare(`
    SELECT f.id, f.name FROM filaments f
    WHERE NOT EXISTS (SELECT 1 FROM spools s WHERE s.filament_id = f.id)
  `).all();
  for (const row of unused) {
    log("filament_unused", "info", "info", "filament", row.id, { name: row.name });
    counters.info++;
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] unused-filament rule failed: ${err.message}`);
}

// ── Rule 8: duplicate shops by normalized name — flag only, no auto-merge ───
try {
  const shops = db.prepare("SELECT id, name FROM shops").all();
  const byNormalized = new Map();
  for (const s of shops) {
    const key = (s.name || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/(store|shop|eu|germany|deutschland)$/gi, "");
    if (!byNormalized.has(key)) byNormalized.set(key, []);
    byNormalized.get(key).push(s);
  }
  for (const [, group] of byNormalized) {
    if (group.length > 1) {
      log("shop_duplicate", "warning", "flagged", "shop", group[0].id, {
        duplicates: group.map((g) => ({ id: g.id, name: g.name })),
      });
      counters.flagged++;
    }
  }
} catch (err) {
  counters.errors++;
  console.error(`[health-check] shop-duplicate rule failed: ${err.message}`);
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(
  `[health-check] fixed=${counters.fixed} flagged=${counters.flagged} info=${counters.info} errors=${counters.errors}`
);

db.close();
