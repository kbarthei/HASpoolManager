/**
 * Monthly filament budget tracking.
 *
 * Settings:
 *   - monthly_filament_budget   EUR amount (decimal string, e.g. "150")
 *   - budget_period_start_day   1-28, day of month the period rolls over (default 1)
 *
 * Spend is computed from orders.total_cost within the current period. Orders
 * with no total_cost (e.g. placeholder draft orders) contribute 0.
 */

import { db } from "./db";
import { orders, settings } from "./db/schema";
import { and, gte, lt, eq } from "drizzle-orm";

export interface BudgetStatus {
  /** Configured monthly budget in EUR; null when user has not set one. */
  budget: number | null;
  /** Total order cost within the current period (EUR). */
  spent: number;
  /** Percent of budget used (0–100); null when budget is unset. */
  percentUsed: number | null;
  /** Inclusive ISO date (YYYY-MM-DD) of the current period's first day. */
  periodStart: string;
  /** Exclusive ISO date — first day of the next period. */
  periodEnd: string;
  /** Day-of-month when the period rolls over (1-28). */
  periodStartDay: number;
}

/** Returns the inclusive-start and exclusive-end of the budget period containing `now`. */
export function budgetPeriodFor(now: Date, startDay: number): { start: Date; end: Date } {
  const d = Math.min(Math.max(1, Math.floor(startDay)), 28);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const day = now.getUTCDate();

  const start = new Date(Date.UTC(year, day >= d ? month : month - 1, d));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getBudgetStatus(now: Date = new Date()): Promise<BudgetStatus> {
  const [budgetRow, startDayRow] = await Promise.all([
    db.query.settings.findFirst({ where: eq(settings.key, "monthly_filament_budget") }),
    db.query.settings.findFirst({ where: eq(settings.key, "budget_period_start_day") }),
  ]);

  const budget = budgetRow?.value ? parseFloat(budgetRow.value) : null;
  const startDay = startDayRow?.value ? Math.floor(parseFloat(startDayRow.value)) : 1;

  const { start, end } = budgetPeriodFor(now, startDay);
  const startStr = toIsoDate(start);
  const endStr = toIsoDate(end);

  const ordersInPeriod = await db
    .select()
    .from(orders)
    .where(and(gte(orders.orderDate, startStr), lt(orders.orderDate, endStr)));

  let spent = 0;
  for (const o of ordersInPeriod) {
    if (o.totalCost != null) spent += o.totalCost;
  }

  const percentUsed =
    budget != null && budget > 0 ? Math.round((spent / budget) * 100) : null;

  return {
    budget,
    spent: Math.round(spent * 100) / 100,
    percentUsed,
    periodStart: startStr,
    periodEnd: endStr,
    periodStartDay: startDay,
  };
}
