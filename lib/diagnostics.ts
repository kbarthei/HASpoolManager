import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// Each diagnostic returns a count and a small preview of offending rows.
// The dashboard shows counts; destination pages (/spools, /prints, /orders)
// read the same filter id via ?issue=... and show the full list.

export type DiagnosticIssueId =
  | "spool-drift"
  | "spool-stale"
  | "spool-zero-active"
  | "print-stuck"
  | "print-no-weight"
  | "print-no-usage"
  | "order-stuck"
  | "sync-errors"
  | "orphan-photos";

export interface DiagnosticResult<Row> {
  count: number;
  rows: Row[];
}

// ── Spool issues ──────────────────────────────────────────────────────────

// RFID drift: spool is in an AMS slot reporting a bambuRemain %, and the
// DB-tracked remaining % diverges from that reading by more than 10pp.
// Only considers slots with bambuRemain >= 0 (valid RFID reading).
export interface SpoolDriftRow {
  spoolId: string;
  filamentName: string;
  slotLabel: string;
  dbPercent: number;
  rfidPercent: number;
  driftPp: number;
}

export async function getSpoolDrift(): Promise<DiagnosticResult<SpoolDriftRow>> {
  const rows = (await db.all(sql`
    SELECT
      s.id AS spoolId,
      f.name AS filamentName,
      CASE a.slot_type
        WHEN 'ams_ht' THEN 'AMS HT'
        WHEN 'external' THEN 'External'
        ELSE 'AMS ' || (a.ams_index + 1) || '·' || (a.tray_index + 1)
      END AS slotLabel,
      ROUND(CAST(s.remaining_weight AS REAL) * 100.0 / NULLIF(s.initial_weight, 0)) AS dbPercent,
      a.bambu_remain AS rfidPercent,
      ABS(ROUND(CAST(s.remaining_weight AS REAL) * 100.0 / NULLIF(s.initial_weight, 0)) - a.bambu_remain) AS driftPp
    FROM spools s
    INNER JOIN ams_slots a ON a.spool_id = s.id
    INNER JOIN filaments f ON f.id = s.filament_id
    WHERE a.bambu_remain >= 0
      AND s.initial_weight > 0
      AND s.status = 'active'
      AND ABS(ROUND(CAST(s.remaining_weight AS REAL) * 100.0 / NULLIF(s.initial_weight, 0)) - a.bambu_remain) > 10
    ORDER BY driftPp DESC
  `)) as SpoolDriftRow[];
  return { count: rows.length, rows };
}

// Stale spool: active, has been used at some point, but no usage in 90+ days.
// (Brand-new unused spools are excluded — they're fresh inventory, not stale.)
export interface SpoolStaleRow {
  spoolId: string;
  filamentName: string;
  lastUsedAt: string | null;
  daysSinceUse: number;
}

export async function getSpoolStale(): Promise<DiagnosticResult<SpoolStaleRow>> {
  const rows = (await db.all(sql`
    SELECT
      s.id AS spoolId,
      f.name AS filamentName,
      s.last_used_at AS lastUsedAt,
      CAST(julianday('now') - julianday(s.last_used_at) AS INTEGER) AS daysSinceUse
    FROM spools s
    INNER JOIN filaments f ON f.id = s.filament_id
    WHERE s.status = 'active'
      AND s.last_used_at IS NOT NULL
      AND julianday('now') - julianday(s.last_used_at) > 90
      AND s.remaining_weight > 0
    ORDER BY daysSinceUse DESC
  `)) as SpoolStaleRow[];
  return { count: rows.length, rows };
}

// Zero-but-active: status says 'active' but remainingWeight is <= 0.
// Should have been marked 'empty' or 'archived'.
export interface SpoolZeroActiveRow {
  spoolId: string;
  filamentName: string;
  remainingWeight: number;
  location: string | null;
}

export async function getSpoolZeroActive(): Promise<DiagnosticResult<SpoolZeroActiveRow>> {
  const rows = (await db.all(sql`
    SELECT
      s.id AS spoolId,
      f.name AS filamentName,
      s.remaining_weight AS remainingWeight,
      s.location AS location
    FROM spools s
    INNER JOIN filaments f ON f.id = s.filament_id
    WHERE s.status = 'active'
      AND s.remaining_weight <= 0
    ORDER BY s.updated_at DESC
  `)) as SpoolZeroActiveRow[];
  return { count: rows.length, rows };
}

// ── Print issues ──────────────────────────────────────────────────────────

// Stuck running: print status is 'running' but no update in 24+ hours.
// Blocks all future print tracking until resolved.
export interface PrintStuckRow {
  printId: string;
  printName: string | null;
  startedAt: string | null;
  hoursSinceUpdate: number;
}

export async function getPrintStuck(): Promise<DiagnosticResult<PrintStuckRow>> {
  const rows = (await db.all(sql`
    SELECT
      id AS printId,
      COALESCE(name, gcode_file) AS printName,
      started_at AS startedAt,
      CAST((julianday('now') - julianday(updated_at)) * 24 AS INTEGER) AS hoursSinceUpdate
    FROM prints
    WHERE status = 'running'
      AND julianday('now') - julianday(updated_at) > 1
    ORDER BY updated_at ASC
  `)) as PrintStuckRow[];
  return { count: rows.length, rows };
}

// Finished with no weight: print status is 'finished' but printWeight is NULL.
// Usually means slicer metadata missed or failed mid-print with no extrusion.
// Limit to last 30 days to avoid dredging up ancient history.
export interface PrintNoWeightRow {
  printId: string;
  printName: string | null;
  finishedAt: string | null;
}

export async function getPrintNoWeight(): Promise<DiagnosticResult<PrintNoWeightRow>> {
  const rows = (await db.all(sql`
    SELECT
      id AS printId,
      COALESCE(name, gcode_file) AS printName,
      finished_at AS finishedAt
    FROM prints
    WHERE status = 'finished'
      AND print_weight IS NULL
      AND finished_at IS NOT NULL
      AND julianday('now') - julianday(finished_at) <= 30
    ORDER BY finished_at DESC
  `)) as PrintNoWeightRow[];
  return { count: rows.length, rows };
}

// Finished with no usage rows: print status is 'finished' but no print_usage
// rows exist — spool was never identified, so weight wasn't deducted anywhere.
export interface PrintNoUsageRow {
  printId: string;
  printName: string | null;
  finishedAt: string | null;
  printWeight: number | null;
}

export async function getPrintNoUsage(): Promise<DiagnosticResult<PrintNoUsageRow>> {
  const rows = (await db.all(sql`
    SELECT
      p.id AS printId,
      COALESCE(p.name, p.gcode_file) AS printName,
      p.finished_at AS finishedAt,
      p.print_weight AS printWeight
    FROM prints p
    LEFT JOIN print_usage pu ON pu.print_id = p.id
    WHERE p.status = 'finished'
      AND p.finished_at IS NOT NULL
      AND julianday('now') - julianday(p.finished_at) <= 30
      AND pu.id IS NULL
    ORDER BY p.finished_at DESC
  `)) as PrintNoUsageRow[];
  return { count: rows.length, rows };
}

// ── Order issues ──────────────────────────────────────────────────────────

// Stuck ordered: status is 'ordered' and orderDate > 30 days ago.
// Either delivery was forgotten to mark, or the order slipped through.
export interface OrderStuckRow {
  orderId: string;
  orderNumber: string | null;
  vendorName: string | null;
  orderDate: string;
  daysSinceOrder: number;
}

export async function getOrderStuck(): Promise<DiagnosticResult<OrderStuckRow>> {
  const rows = (await db.all(sql`
    SELECT
      o.id AS orderId,
      o.order_number AS orderNumber,
      v.name AS vendorName,
      o.order_date AS orderDate,
      CAST(julianday('now') - julianday(o.order_date) AS INTEGER) AS daysSinceOrder
    FROM orders o
    LEFT JOIN vendors v ON v.id = o.vendor_id
    WHERE o.status = 'ordered'
      AND julianday('now') - julianday(o.order_date) > 30
    ORDER BY o.order_date ASC
  `)) as OrderStuckRow[];
  return { count: rows.length, rows };
}

// ── Sync issues ───────────────────────────────────────────────────────────

// Recent sync errors: sync_log entries from last 24h with printError=1 or
// normalizedState in ('offline','unknown'). Useful to spot printer-sync flaps.
export interface SyncErrorRow {
  id: string;
  createdAt: string;
  normalizedState: string | null;
  printError: boolean;
  printName: string | null;
}

export async function getSyncErrors(): Promise<DiagnosticResult<SyncErrorRow>> {
  const rows = (await db.all(sql`
    SELECT
      id,
      created_at AS createdAt,
      normalized_state AS normalizedState,
      print_error AS printError,
      print_name AS printName
    FROM sync_log
    WHERE julianday('now') - julianday(created_at) <= 1
      AND (print_error = 1 OR normalized_state IN ('offline','unknown','error'))
    ORDER BY created_at DESC
    LIMIT 100
  `)) as SyncErrorRow[];
  return { count: rows.length, rows };
}

// ── Health check rollup ───────────────────────────────────────────────────

// Surfaces the latest `data_quality_log` run, grouped per rule. Complements
// the live detectors above — the health-check job writes structural findings
// (integrity, orphans, duplicates, unused entities) to data_quality_log on
// addon start, and this reads them back for display.
export interface HealthCheckRuleRow {
  entityType: string | null;
  entityId: string | null;
  label: string; // short, human-friendly summary from details JSON
}

export interface HealthCheckRule {
  ruleId: string;
  severity: "critical" | "warning" | "info";
  action: "auto_fixed" | "flagged" | "info";
  count: number;
  rows: HealthCheckRuleRow[];
}

export interface HealthCheckSummary {
  latestRunAt: string | null;
  rules: HealthCheckRule[];
  counts: { autoFixed: number; flagged: number; info: number };
}

type RawLogRow = {
  id: string;
  ruleId: string;
  severity: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
};

function summarizeDetails(json: string | null): string {
  if (!json) return "";
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.name === "string") return parsed.name;
    if ("before" in parsed && "after" in parsed) {
      return `${String(parsed.before)} → ${String(parsed.after)}`;
    }
    if (Array.isArray(parsed.duplicates)) {
      return `${parsed.duplicates.length} duplicates`;
    }
    return "";
  } catch {
    return "";
  }
}

export async function getHealthCheckFindings(): Promise<HealthCheckSummary> {
  const latestRunRow = (await db.all(sql`
    SELECT run_at AS runAt FROM data_quality_log ORDER BY run_at DESC LIMIT 1
  `)) as Array<{ runAt: string }>;
  const latestRunAt = latestRunRow[0]?.runAt ?? null;

  if (!latestRunAt) {
    return {
      latestRunAt: null,
      rules: [],
      counts: { autoFixed: 0, flagged: 0, info: 0 },
    };
  }

  const rows = (await db.all(sql`
    SELECT id, rule_id AS ruleId, severity, action,
           entity_type AS entityType, entity_id AS entityId, details
    FROM data_quality_log
    WHERE run_at = ${latestRunAt}
    ORDER BY severity DESC, rule_id
  `)) as RawLogRow[];

  const byRule = new Map<string, HealthCheckRule>();
  for (const r of rows) {
    const sev = (r.severity === "critical" || r.severity === "warning" ? r.severity : "info") as
      | "critical"
      | "warning"
      | "info";
    const act = (r.action === "auto_fixed" || r.action === "flagged" ? r.action : "info") as
      | "auto_fixed"
      | "flagged"
      | "info";
    let entry = byRule.get(r.ruleId);
    if (!entry) {
      entry = {
        ruleId: r.ruleId,
        severity: sev,
        action: act,
        count: 0,
        rows: [],
      };
      byRule.set(r.ruleId, entry);
    }
    entry.count += 1;
    if (entry.rows.length < 5) {
      entry.rows.push({
        entityType: r.entityType,
        entityId: r.entityId,
        label: summarizeDetails(r.details),
      });
    }
  }

  const rules = Array.from(byRule.values()).sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 } as const;
    return sevOrder[a.severity] - sevOrder[b.severity] || a.ruleId.localeCompare(b.ruleId);
  });

  const counts = {
    autoFixed: rows.filter((r) => r.action === "auto_fixed").length,
    flagged: rows.filter((r) => r.action === "flagged").length,
    info: rows.filter((r) => r.action === "info").length,
  };

  return { latestRunAt, rules, counts };
}

// ── Orphan photos ─────────────────────────────────────────────────────────

// Files on disk no print references, plus DB photo_urls entries pointing at
// files that no longer exist. This catches: failed/duplicate captures,
// manually-deleted print rows, mid-write crashes, and the legacy
// /config/snapshots/ dump from pre-v1.1.6.
export interface OrphanPhotosSummary {
  count: number; // total orphan files + dead entries
  fileCount: number;
  deadEntryCount: number;
  legacyCount: number;
  bytes: number;
  preview: Array<{ label: string; meta?: string }>;
}

export async function getOrphanPhotos(): Promise<OrphanPhotosSummary> {
  // Lazy import — photo-manager touches the filesystem; tests + non-addon
  // builds shouldn't hit it from a top-level diagnostics import.
  const { scanForOrphans } = await import("./photo-manager");
  const scan = await scanForOrphans();

  const fileCount = scan.orphanFiles.length;
  const deadEntryCount = scan.deadEntries.length;
  const legacyCount = scan.legacyOrphans.length;
  const bytes =
    scan.orphanFiles.reduce((sum, o) => sum + o.bytes, 0) +
    scan.legacyOrphans.reduce((sum, o) => sum + o.bytes, 0);

  const preview: OrphanPhotosSummary["preview"] = [];
  for (const o of scan.orphanFiles.slice(0, 3)) {
    preview.push({
      label: o.printId ? `${o.printId.slice(0, 8)} · orphan file` : `${o.filePath} · print gone`,
      meta: `${(o.bytes / 1024).toFixed(0)}KB`,
    });
  }
  for (const o of scan.deadEntries.slice(0, Math.max(0, 3 - preview.length))) {
    preview.push({ label: `${o.printId.slice(0, 8)} · dead entry`, meta: o.entryPath.split("/").pop() ?? "" });
  }
  for (const o of scan.legacyOrphans.slice(0, Math.max(0, 3 - preview.length))) {
    preview.push({ label: `legacy · ${o.filePath.split("/").pop()}`, meta: `${(o.bytes / 1024).toFixed(0)}KB` });
  }

  return {
    count: fileCount + deadEntryCount + legacyCount,
    fileCount,
    deadEntryCount,
    legacyCount,
    bytes,
    preview,
  };
}

// ── Aggregate runner ──────────────────────────────────────────────────────

export interface DiagnosticSummary {
  spoolDrift: DiagnosticResult<SpoolDriftRow>;
  spoolStale: DiagnosticResult<SpoolStaleRow>;
  spoolZeroActive: DiagnosticResult<SpoolZeroActiveRow>;
  printStuck: DiagnosticResult<PrintStuckRow>;
  printNoWeight: DiagnosticResult<PrintNoWeightRow>;
  printNoUsage: DiagnosticResult<PrintNoUsageRow>;
  orderStuck: DiagnosticResult<OrderStuckRow>;
  syncErrors: DiagnosticResult<SyncErrorRow>;
  orphanPhotos: OrphanPhotosSummary;
  healthCheck: HealthCheckSummary;
}

export async function getAllDiagnostics(): Promise<DiagnosticSummary> {
  const [
    spoolDrift,
    spoolStale,
    spoolZeroActive,
    printStuck,
    printNoWeight,
    printNoUsage,
    orderStuck,
    syncErrors,
    orphanPhotos,
    healthCheck,
  ] = await Promise.all([
    getSpoolDrift(),
    getSpoolStale(),
    getSpoolZeroActive(),
    getPrintStuck(),
    getPrintNoWeight(),
    getPrintNoUsage(),
    getOrderStuck(),
    getSyncErrors(),
    getOrphanPhotos(),
    getHealthCheckFindings(),
  ]);
  return {
    spoolDrift,
    spoolStale,
    spoolZeroActive,
    printStuck,
    printNoWeight,
    printNoUsage,
    orderStuck,
    syncErrors,
    orphanPhotos,
    healthCheck,
  };
}
