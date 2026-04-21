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
  | "sync-errors";

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
  ] = await Promise.all([
    getSpoolDrift(),
    getSpoolStale(),
    getSpoolZeroActive(),
    getPrintStuck(),
    getPrintNoWeight(),
    getPrintNoUsage(),
    getOrderStuck(),
    getSyncErrors(),
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
  };
}
