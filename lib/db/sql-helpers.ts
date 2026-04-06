/**
 * Cross-database SQL helper functions.
 * Generates the correct SQL fragment for both Postgres (Neon) and SQLite
 * based on DATABASE_PROVIDER env var.
 */

import { sql } from "drizzle-orm";
import { SQL } from "drizzle-orm";

const isSqlite = () => (process.env.DATABASE_PROVIDER ?? "postgres") === "sqlite";

/**
 * count(*) — returns a plain integer.
 * Postgres uses ::int cast; SQLite returns integer natively.
 */
export function sqlCount(): SQL<number> {
  return sql<number>`count(*)`;
}

/**
 * count(distinct <expr>) — returns a plain integer.
 */
export function sqlCountDistinct(expr: SQL | object): SQL<number> {
  return sql<number>`count(distinct ${expr})`;
}

/**
 * COALESCE(SUM(col), 0) — returns a float/real.
 * Postgres needs ::numeric for string-typed numeric columns.
 * SQLite stores as REAL natively.
 */
export function sqlCoalesceSum(expr: SQL | object): SQL<number> {
  if (isSqlite()) {
    return sql<number>`coalesce(sum(${expr}), 0)`;
  }
  return sql<number>`coalesce(sum(${expr}::numeric), 0)`;
}

/**
 * COALESCE(SUM(col::numeric * qty), 0)::float — for unit_price * quantity.
 */
export function sqlCoalesceSumProduct(a: SQL | object, b: SQL | object): SQL<number> {
  if (isSqlite()) {
    return sql<number>`coalesce(sum(${a} * ${b}), 0)`;
  }
  return sql<number>`coalesce(sum(${a}::numeric * ${b}), 0)::float`;
}

/**
 * ORDER BY sum(a * b) DESC — for vendor spend ranking.
 */
export function sqlSumProductDesc(a: SQL | object, b: SQL | object): SQL {
  if (isSqlite()) {
    return sql`sum(${a} * ${b}) desc`;
  }
  return sql`sum(${a}::numeric * ${b}) desc`;
}

/**
 * remaining::float / initial::float < 0.5 — low-stock filter.
 */
export function sqlRatioBelowHalf(remaining: SQL | object, initial: SQL | object): SQL {
  if (isSqlite()) {
    return sql`CAST(${remaining} AS REAL) / CAST(${initial} AS REAL) < 0.5`;
  }
  return sql`${remaining}::float / ${initial}::float < 0.5`;
}

/**
 * Extract year from a datetime column.
 * Postgres: extract(year from col)::int
 * SQLite:   CAST(strftime('%Y', col) AS INTEGER)
 */
export function sqlExtractYear(col: SQL | object): SQL<number> {
  if (isSqlite()) {
    return sql<number>`CAST(strftime('%Y', ${col}) AS INTEGER)`;
  }
  return sql<number>`extract(year from ${col})::int`;
}

/**
 * Extract month (1–12) from a datetime column.
 * Postgres: extract(month from col)::int
 * SQLite:   CAST(strftime('%m', col) AS INTEGER)
 */
export function sqlExtractMonth(col: SQL | object): SQL<number> {
  if (isSqlite()) {
    return sql<number>`CAST(strftime('%m', ${col}) AS INTEGER)`;
  }
  return sql<number>`extract(month from ${col})::int`;
}

/**
 * Group-by year expression (raw SQL, no type).
 */
export function sqlGroupByYear(col: SQL | object): SQL {
  if (isSqlite()) {
    return sql`strftime('%Y', ${col})`;
  }
  return sql`extract(year from ${col})`;
}

/**
 * Group-by month expression (raw SQL, no type).
 */
export function sqlGroupByMonth(col: SQL | object): SQL {
  if (isSqlite()) {
    return sql`strftime('%m', ${col})`;
  }
  return sql`extract(month from ${col})`;
}

/**
 * "6 months ago" date filter.
 * Postgres: col >= (current_date - interval '6 months')
 * SQLite:   col >= datetime('now', '-6 months')
 */
export function sqlSixMonthsAgo(col: SQL | object): SQL {
  if (isSqlite()) {
    return sql`${col} >= datetime('now', '-6 months')`;
  }
  return sql`${col} >= (current_date - interval '6 months')`;
}

/**
 * "6 months ago" for timestamp columns (now() vs current_date).
 */
export function sqlNowMinusSixMonths(col: SQL | object): SQL {
  if (isSqlite()) {
    return sql`${col} >= datetime('now', '-6 months')`;
  }
  return sql`${col} >= (now() - interval '6 months')`;
}

/**
 * Timestamp threshold: NOW() - N hours.
 * Used for retention cleanup (e.g., delete sync logs older than 72h).
 * Postgres: NOW() - INTERVAL '72 hours'
 * SQLite:   datetime('now', '-72 hours')
 */
export function sqlNowMinusHours(hours: number): SQL {
  if (isSqlite()) {
    return sql`datetime('now', '-${sql.raw(String(hours))} hours')`;
  }
  return sql`NOW() - INTERVAL '${sql.raw(String(hours))} hours'`;
}

/**
 * COALESCE(SUM(cost), 0) as text — for recalculating print total_cost.
 * cost column is stored as text/numeric in both DBs.
 */
export function sqlCoalesceSumCostAsText(): SQL<string> {
  if (isSqlite()) {
    return sql<string>`CAST(COALESCE(SUM(CAST(cost AS REAL)), 0) AS TEXT)`;
  }
  return sql<string>`COALESCE(SUM(cost::numeric), 0)::text`;
}
