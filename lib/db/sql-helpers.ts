/**
 * SQL helper fragments — SQLite dialect.
 *
 * These wrap common SQL idioms (count, sum, date arithmetic, etc.) so the
 * call-sites in queries.ts and routes stay readable. They were originally
 * dual-driver (Postgres + SQLite) during the HA migration; after Phase 10
 * the only target is SQLite, so the helpers are now thin wrappers.
 *
 * The helper API is preserved (function names, signatures, return types) so
 * call-sites don't need to change if we ever bring another driver back.
 */

import { sql } from "drizzle-orm";
import { SQL } from "drizzle-orm";

/** count(*) */
export function sqlCount(): SQL<number> {
  return sql<number>`count(*)`;
}

/** count(distinct expr) */
export function sqlCountDistinct(expr: SQL | object): SQL<number> {
  return sql<number>`count(distinct ${expr})`;
}

/** COALESCE(SUM(expr), 0) */
export function sqlCoalesceSum(expr: SQL | object): SQL<number> {
  return sql<number>`coalesce(sum(${expr}), 0)`;
}

/** COALESCE(SUM(a * b), 0) */
export function sqlCoalesceSumProduct(a: SQL | object, b: SQL | object): SQL<number> {
  return sql<number>`coalesce(sum(${a} * ${b}), 0)`;
}

/** sum(a * b) DESC — for vendor spend ranking */
export function sqlSumProductDesc(a: SQL | object, b: SQL | object): SQL {
  return sql`sum(${a} * ${b}) desc`;
}

/** CAST(remaining AS REAL) / CAST(initial AS REAL) < 0.5 */
export function sqlRatioBelowHalf(remaining: SQL | object, initial: SQL | object): SQL {
  return sql`CAST(${remaining} AS REAL) / CAST(${initial} AS REAL) < 0.5`;
}

/** Year extraction → integer */
export function sqlExtractYear(col: SQL | object): SQL<number> {
  return sql<number>`CAST(strftime('%Y', ${col}) AS INTEGER)`;
}

/** Month extraction (1-12) → integer */
export function sqlExtractMonth(col: SQL | object): SQL<number> {
  return sql<number>`CAST(strftime('%m', ${col}) AS INTEGER)`;
}

/** Group-by year expression */
export function sqlGroupByYear(col: SQL | object): SQL {
  return sql`strftime('%Y', ${col})`;
}

/** Group-by month expression */
export function sqlGroupByMonth(col: SQL | object): SQL {
  return sql`strftime('%m', ${col})`;
}

/** col >= datetime('now', '-6 months') */
export function sqlSixMonthsAgo(col: SQL | object): SQL {
  return sql`${col} >= datetime('now', '-6 months')`;
}

/** Same as sqlSixMonthsAgo — kept for call-site compat */
export function sqlNowMinusSixMonths(col: SQL | object): SQL {
  return sql`${col} >= datetime('now', '-6 months')`;
}

/** datetime('now', '-N hours') — used for retention cleanups */
export function sqlNowMinusHours(hours: number): SQL {
  return sql`datetime('now', '-${sql.raw(String(hours))} hours')`;
}

/** COALESCE(SUM(cost), 0) — for recalculating print total_cost */
export function sqlCoalesceSumCost(): SQL<number> {
  return sql<number>`COALESCE(SUM(cost), 0)`;
}
