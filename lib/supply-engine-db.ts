/**
 * Supply Engine — database operations.
 * Connects pure functions from supply-engine.ts with the DB.
 */

import { db } from "./db";
import {
  consumptionStats, supplyRules, supplyAlerts, spools, filaments, prints, printUsage, shops, orders,
} from "./db/schema";
import { eq, and, sql, desc, ne } from "drizzle-orm";
import {
  calculateConsumptionRate, daysUntilEmpty, calculateReorderPoint,
  classifyFilament, stddev, determineUrgency, recommendOrderQty,
  type DailyConsumption, type SupplyStatus,
} from "./supply-engine";
import { sqlCount } from "./db/sql-helpers";

// ── Consumption Stats ───────────────────────────────────────────────────────

/**
 * Record filament consumption for today. Called after createPrintUsage.
 */
export async function recordConsumption(
  filamentId: string,
  weightGrams: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const existing = await db.query.consumptionStats.findFirst({
    where: and(
      eq(consumptionStats.filamentId, filamentId),
      eq(consumptionStats.date, today),
    ),
  });

  if (existing) {
    await db.update(consumptionStats).set({
      weightGrams: existing.weightGrams + weightGrams,
      printCount: existing.printCount + 1,
    }).where(eq(consumptionStats.id, existing.id));
  } else {
    await db.insert(consumptionStats).values({
      filamentId,
      date: today,
      weightGrams,
      printCount: 1,
    });
  }
}

/**
 * Get daily consumption stats for a filament over the last N days.
 */
export async function getConsumptionHistory(
  filamentId: string,
  days = 56
): Promise<DailyConsumption[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db.query.consumptionStats.findMany({
    where: and(
      eq(consumptionStats.filamentId, filamentId),
      sql`${consumptionStats.date} >= ${cutoffStr}`,
    ),
    orderBy: [consumptionStats.date],
  });

  return rows.map((r) => ({
    date: r.date,
    weightGrams: r.weightGrams,
    printCount: r.printCount,
  }));
}

// ── Supply Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze supply status for a single filament.
 */
export async function analyzeFilamentSupply(filamentId: string): Promise<SupplyStatus> {
  // Current stock: sum remaining weight across active spools of this filament
  const activeSpools = await db.query.spools.findMany({
    where: and(
      eq(spools.filamentId, filamentId),
      ne(spools.status, "archived"),
      ne(spools.status, "empty"),
    ),
    columns: { remainingWeight: true, initialWeight: true },
  });

  const totalGrams = activeSpools.reduce((s, sp) => s + sp.remainingWeight, 0);
  const spoolCount = activeSpools.length;

  // Consumption history
  const history = await getConsumptionHistory(filamentId);
  const consumption = calculateConsumptionRate(history);
  const category = classifyFilament(history);

  // Supply rule (if any)
  const rule = await db.query.supplyRules.findFirst({
    where: and(eq(supplyRules.filamentId, filamentId), eq(supplyRules.isActive, true)),
  });

  // Lead time from preferred shop or default
  let leadTimeDays = 4; // default
  if (rule?.preferredShopId) {
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, rule.preferredShopId),
      columns: { avgDeliveryDays: true },
    });
    if (shop?.avgDeliveryDays) leadTimeDays = shop.avgDeliveryDays;
  }

  // Days remaining
  const days = daysUntilEmpty(totalGrams, consumption.avgGramsPerDay, consumption.trend, consumption.trendSlope);

  // Reorder point
  const dailyValues = history.map((h) => h.weightGrams);
  const dailyStddev = stddev(dailyValues);
  const reorderPoint = calculateReorderPoint(consumption.avgGramsPerDay, dailyStddev, leadTimeDays);

  // Need reorder?
  const needsReorder = totalGrams <= reorderPoint
    || (rule != null && spoolCount < rule.minSpools);

  const urgency = determineUrgency(days, !!rule);

  const minSpools = rule?.minSpools ?? 1;
  const maxSpools = rule?.maxStockSpools ?? 5;
  const qty = needsReorder ? recommendOrderQty(spoolCount, minSpools, maxSpools, consumption.avgGramsPerDay) : 0;

  return {
    filamentId,
    currentStock: { totalGrams: Math.round(totalGrams), spoolCount },
    consumption,
    category,
    daysRemaining: days === Infinity ? 9999 : days,
    reorderPoint,
    needsReorder,
    urgency,
    recommendedQty: qty,
  };
}

/**
 * Run full supply analysis for all filaments with stock or rules.
 * Returns statuses sorted by urgency (critical first).
 */
export async function runSupplyAnalysis(): Promise<SupplyStatus[]> {
  // Find all filaments that have active spools or supply rules
  const filamentIds = new Set<string>();

  const activeSpoolFilaments = await db
    .selectDistinct({ filamentId: spools.filamentId })
    .from(spools)
    .where(and(ne(spools.status, "archived"), ne(spools.status, "empty")));
  for (const r of activeSpoolFilaments) filamentIds.add(r.filamentId);

  const ruledFilaments = await db
    .selectDistinct({ filamentId: supplyRules.filamentId })
    .from(supplyRules)
    .where(eq(supplyRules.isActive, true));
  for (const r of ruledFilaments) {
    if (r.filamentId) filamentIds.add(r.filamentId);
  }

  const results: SupplyStatus[] = [];
  for (const fid of filamentIds) {
    results.push(await analyzeFilamentSupply(fid));
  }

  // Sort: critical first, then warning, then ok. Within same urgency, fewer days first.
  const urgencyOrder = { critical: 0, warning: 1, ok: 2 };
  results.sort((a, b) => {
    const uo = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uo !== 0) return uo;
    return a.daysRemaining - b.daysRemaining;
  });

  return results;
}

// ── Alert Management ────────────────────────────────────────────────────────

/**
 * Generate or update supply alerts based on analysis results.
 * Auto-resolves alerts when stock is replenished.
 */
export async function updateSupplyAlerts(statuses: SupplyStatus[]): Promise<void> {
  for (const status of statuses) {
    if (status.needsReorder && status.urgency !== "ok") {
      // Check if active alert already exists for this filament
      const existing = await db.query.supplyAlerts.findFirst({
        where: and(
          eq(supplyAlerts.filamentId, status.filamentId),
          eq(supplyAlerts.status, "active"),
        ),
      });

      if (!existing) {
        const title = status.urgency === "critical"
          ? `${status.daysRemaining} days remaining!`
          : `Stock declining — ${status.daysRemaining} days`;

        await db.insert(supplyAlerts).values({
          filamentId: status.filamentId,
          alertType: status.consumption.trend === "rising" ? "trend_warning" : "low_stock",
          severity: status.urgency,
          title,
          message: `${status.currentStock.spoolCount} spool(s), ${status.currentStock.totalGrams}g remaining. ` +
            `Consumption: ${status.consumption.avgGramsPerDay}g/day (${status.consumption.trend}).`,
          data: JSON.stringify({
            daysRemaining: status.daysRemaining,
            recommendedQty: status.recommendedQty,
            avgGramsPerDay: status.consumption.avgGramsPerDay,
            trend: status.consumption.trend,
          }),
        });
      } else {
        // Update severity if changed
        if (existing.severity !== status.urgency) {
          await db.update(supplyAlerts).set({
            severity: status.urgency,
            title: status.urgency === "critical"
              ? `${status.daysRemaining} days remaining!`
              : `Stock declining — ${status.daysRemaining} days`,
            data: JSON.stringify({
              daysRemaining: status.daysRemaining,
              recommendedQty: status.recommendedQty,
              avgGramsPerDay: status.consumption.avgGramsPerDay,
              trend: status.consumption.trend,
            }),
          }).where(eq(supplyAlerts.id, existing.id));
        }
      }
    } else {
      // Stock is OK — resolve any active alerts
      await db.update(supplyAlerts).set({
        status: "resolved",
        resolvedAt: new Date(),
      }).where(and(
        eq(supplyAlerts.filamentId, status.filamentId),
        eq(supplyAlerts.status, "active"),
      ));
    }
  }
}

// ── Shop Lead Time ──────────────────────────────────────────────────────────

/**
 * Calculate and update average delivery days per shop from order history.
 */
export async function updateShopLeadTimes(): Promise<void> {
  const rows = await db.all(sql`
    SELECT shop_id,
      AVG(julianday(actual_delivery) - julianday(order_date)) as avg_days,
      COUNT(*) as order_count
    FROM orders
    WHERE actual_delivery IS NOT NULL
      AND shop_id IS NOT NULL
      AND julianday(actual_delivery) > julianday(order_date)
    GROUP BY shop_id
    HAVING order_count >= 2
  `) as Array<{ shop_id: string; avg_days: number; order_count: number }>;

  for (const row of rows) {
    await db.update(shops).set({
      avgDeliveryDays: Math.round(row.avg_days * 10) / 10,
    }).where(eq(shops.id, row.shop_id));
  }
}

// ── Backfill ────────────────────────────────────────────────────────────────

/**
 * Backfill consumption_stats from existing print_usage history.
 * Run once to populate historical data.
 */
export async function backfillConsumptionStats(): Promise<number> {
  const rows = await db.all(sql`
    SELECT
      s.filament_id,
      date(p.started_at) as print_date,
      SUM(pu.weight_used) as total_weight,
      COUNT(*) as print_count
    FROM print_usage pu
    JOIN spools s ON s.id = pu.spool_id
    JOIN prints p ON p.id = pu.print_id
    WHERE p.started_at IS NOT NULL
      AND s.filament_id IS NOT NULL
    GROUP BY s.filament_id, date(p.started_at)
  `) as Array<{ filament_id: string; print_date: string; total_weight: number; print_count: number }>;

  let inserted = 0;
  for (const row of rows) {
    if (!row.print_date || !row.filament_id) continue;

    const existing = await db.query.consumptionStats.findFirst({
      where: and(
        eq(consumptionStats.filamentId, row.filament_id),
        eq(consumptionStats.date, row.print_date),
      ),
    });

    if (!existing) {
      await db.insert(consumptionStats).values({
        filamentId: row.filament_id,
        date: row.print_date,
        weightGrams: row.total_weight,
        printCount: row.print_count,
      });
      inserted++;
    }
  }

  return inserted;
}
