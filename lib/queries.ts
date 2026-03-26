import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export async function getDashboardStats() {
  // Count active spools
  const [spoolCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.spools).where(eq(schema.spools.status, "active"));

  // Sum inventory value
  const [valueSum] = await db.select({ total: sql<number>`coalesce(sum(purchase_price::numeric), 0)` })
    .from(schema.spools).where(eq(schema.spools.status, "active"));

  // Count low stock (below 50% remaining)
  const lowStock = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.spools)
    .where(and(
      eq(schema.spools.status, "active"),
      sql`${schema.spools.remainingWeight}::float / ${schema.spools.initialWeight}::float < 0.5`
    ));

  // This month prints count and cost
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthStats] = await db.select({
    count: sql<number>`count(*)::int`,
    totalCost: sql<number>`coalesce(sum(total_cost::numeric), 0)`,
  }).from(schema.prints).where(sql`${schema.prints.startedAt} >= ${startOfMonth.toISOString()}`);

  return {
    activeSpools: spoolCount.count,
    totalValue: Math.round(valueSum.total * 100) / 100,
    lowStockCount: lowStock[0].count,
    monthPrints: monthStats.count,
    monthCost: Math.round(monthStats.totalCost * 100) / 100,
  };
}

export async function getAmsSlots() {
  return db.query.amsSlots.findMany({
    with: { spool: { with: { filament: { with: { vendor: true } } } } },
    orderBy: [schema.amsSlots.amsIndex, schema.amsSlots.trayIndex],
  });
}

export async function getLowStockSpools(thresholdPercent = 50) {
  const allActive = await db.query.spools.findMany({
    where: eq(schema.spools.status, "active"),
    with: { filament: { with: { vendor: true } } },
  });
  return allActive
    .filter(s => (s.remainingWeight / s.initialWeight) * 100 < thresholdPercent)
    .sort((a, b) => (a.remainingWeight / a.initialWeight) - (b.remainingWeight / b.initialWeight));
}

export async function getRecentPrints(limit = 8) {
  return db.query.prints.findMany({
    orderBy: [desc(schema.prints.startedAt)],
    limit,
    with: { usage: { with: { spool: { with: { filament: true } } } } },
  });
}
