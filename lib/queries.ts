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

export async function getPrinterStatus() {
  const printer = await db.query.printers.findFirst({
    where: eq(schema.printers.isActive, true),
  });
  if (!printer) return { name: "No Printer", status: "offline" };

  // Check if there's a running print
  const runningPrint = await db.query.prints.findFirst({
    where: eq(schema.prints.status, "running"),
  });

  return {
    name: printer.name,
    status: runningPrint ? "printing" : "idle",
    printName: runningPrint?.name || null,
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

export async function getAllPrints() {
  return db.query.prints.findMany({
    orderBy: [desc(schema.prints.startedAt)],
    with: {
      printer: true,
      usage: { with: { spool: { with: { filament: { with: { vendor: true } } } } } },
    },
  });
}

export async function getAllSpools() {
  return db.query.spools.findMany({
    orderBy: [desc(schema.spools.createdAt)],
    with: { filament: { with: { vendor: true } } },
  });
}

export async function getAllPrintUsage() {
  return db.query.printUsage.findMany({
    orderBy: [desc(schema.printUsage.createdAt)],
    with: {
      print: true,
      spool: { with: { filament: { with: { vendor: true } } } },
    },
  });
}

export async function getFilamentSummary() {
  const allActive = await db.query.spools.findMany({
    where: eq(schema.spools.status, "active"),
    with: { filament: { with: { vendor: true } } },
  });

  // Group by vendor, then count by material
  const byVendor = new Map<string, { count: number; materials: Map<string, number> }>();
  for (const spool of allActive) {
    const vendor = spool.filament.vendor.name;
    if (!byVendor.has(vendor)) {
      byVendor.set(vendor, { count: 0, materials: new Map() });
    }
    const v = byVendor.get(vendor)!;
    v.count++;
    const mat = spool.filament.material;
    v.materials.set(mat, (v.materials.get(mat) || 0) + 1);
  }

  return Array.from(byVendor.entries())
    .map(([vendor, data]) => ({
      vendor,
      count: data.count,
      materials: Array.from(data.materials.entries())
        .map(([material, count]) => ({ material, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}
