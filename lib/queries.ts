import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import {
  sqlCount,
  sqlCountDistinct,
  sqlCoalesceSum,
  sqlCoalesceSumProduct,
  sqlSumProductDesc,
  sqlRatioBelowHalf,
  sqlExtractYear,
  sqlExtractMonth,
  sqlGroupByYear,
  sqlGroupByMonth,
  sqlSixMonthsAgo,
  sqlNowMinusSixMonths,
} from "@/lib/db/sql-helpers";

export interface ActiveRack {
  id: string;
  name: string;
  rows: number;
  cols: number;
  sortOrder: number;
}

export async function getActiveRacks(): Promise<ActiveRack[]> {
  const rows = await db
    .select({
      id: schema.racks.id,
      name: schema.racks.name,
      rows: schema.racks.rows,
      cols: schema.racks.cols,
      sortOrder: schema.racks.sortOrder,
    })
    .from(schema.racks)
    .where(sql`${schema.racks.archivedAt} IS NULL`)
    .orderBy(schema.racks.sortOrder, schema.racks.createdAt);
  return rows;
}

export async function getPrinterAmsUnits(printerId: string) {
  return db
    .select()
    .from(schema.printerAmsUnits)
    .where(
      and(
        eq(schema.printerAmsUnits.printerId, printerId),
        eq(schema.printerAmsUnits.enabled, true),
      ),
    )
    .orderBy(schema.printerAmsUnits.slotType, schema.printerAmsUnits.amsIndex);
}


export async function getSyncLog(limit = 50) {
  return db.query.syncLog.findMany({
    orderBy: (log, { desc }) => [desc(log.createdAt)],
    limit,
  });
}

export async function getSystemStats() {
  const [spoolCount] = await db.select({ count: sqlCount() }).from(schema.spools);
  const [filamentCount] = await db.select({ count: sqlCount() }).from(schema.filaments);
  const [printCount] = await db.select({ count: sqlCount() }).from(schema.prints);
  const [vendorCount] = await db.select({ count: sqlCount() }).from(schema.vendors);
  const [orderCount] = await db.select({ count: sqlCount() }).from(schema.orders);

  return {
    spools: spoolCount.count,
    filaments: filamentCount.count,
    prints: printCount.count,
    vendors: vendorCount.count,
    orders: orderCount.count,
  };
}

export async function getOrders() {
  return db.query.orders.findMany({
    orderBy: [desc(schema.orders.orderDate)],
    with: {
      shop: true,
      items: {
        with: {
          filament: { with: { vendor: true } },
          spool: true,
        },
      },
    },
  });
}

export async function getOrderWithSpools(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(schema.orders.id, orderId),
    with: {
      shop: true,
      items: {
        with: {
          filament: { with: { vendor: true } },
          spool: true,
        },
      },
    },
  });
  if (!order) return null;

  // Get spools linked to this order's items (location "ordered" = awaiting placement)
  const orderSpools = await db.query.spools.findMany({
    where: eq(schema.spools.location, "ordered"),
    with: { filament: true },
  });

  return { ...order, spools: orderSpools };
}

export async function getDraftSpoolCount(): Promise<number> {
  const [result] = await db.select({ count: sqlCount() })
    .from(schema.spools).where(eq(schema.spools.status, "draft"));
  return result.count;
}

export async function getDashboardStats() {
  // Count active spools (excludes drafts)
  const [spoolCount] = await db.select({ count: sqlCount() })
    .from(schema.spools).where(eq(schema.spools.status, "active"));

  // Sum inventory value
  const [valueSum] = await db.select({ total: sqlCoalesceSum(schema.spools.purchasePrice) })
    .from(schema.spools).where(eq(schema.spools.status, "active"));

  // Count low stock (below 50% remaining)
  const lowStock = await db.select({ count: sqlCount() })
    .from(schema.spools)
    .where(and(
      eq(schema.spools.status, "active"),
      sqlRatioBelowHalf(schema.spools.remainingWeight, schema.spools.initialWeight),
    ));

  // This month prints count and cost
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthStats] = await db.select({
    count: sqlCount(),
    totalCost: sqlCoalesceSum(schema.prints.totalCost),
  }).from(schema.prints).where(sql`${schema.prints.startedAt} >= ${startOfMonth.toISOString()}`);

  // Count draft spools needing review
  const [draftCount] = await db.select({ count: sqlCount() })
    .from(schema.spools).where(eq(schema.spools.status, "draft"));

  return {
    activeSpools: spoolCount.count,
    totalValue: Math.round(valueSum.total * 100) / 100,
    lowStockCount: lowStock[0].count,
    monthPrints: monthStats.count,
    monthCost: Math.round(monthStats.totalCost * 100) / 100,
    draftSpoolCount: draftCount.count,
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

  // Get progress from latest sync log + active spool(s) from print record
  let progress = 0;
  let remainingTime = 0;
  type SpoolInfo = { name: string; material: string; colorHex: string; colorName: string | null; vendor: string };
  let activeSpool: SpoolInfo | null = null;
  let activeSpools: SpoolInfo[] = [];
  let isMultiFilament = false;

  if (runningPrint) {
    const lastSync = await db.query.syncLog.findFirst({
      orderBy: (log, { desc }) => [desc(log.createdAt)],
    });
    if (lastSync?.responseJson) {
      try {
        const data = JSON.parse(lastSync.responseJson);
        const req = data.request || data;
        progress = parseFloat(req.print_progress) || 0;
        remainingTime = parseFloat(req.print_remaining_time) || 0;
      } catch { /* ignore */ }
    }

    // Collect all spool IDs seen during this print
    let spoolIds: string[] = [];
    if (runningPrint.activeSpoolIds) {
      try { spoolIds = JSON.parse(runningPrint.activeSpoolIds); } catch { /* ignore */ }
    }

    if (spoolIds.length > 0) {
      const spoolRecords = await Promise.all(
        spoolIds.map((id) =>
          db.query.spools.findFirst({
            where: eq(schema.spools.id, id),
            with: { filament: { with: { vendor: true } } },
          })
        )
      );
      activeSpools = spoolRecords
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({
          name: s.filament.name,
          material: s.filament.material,
          colorHex: s.filament.colorHex ?? "888888",
          colorName: s.filament.colorName ?? null,
          vendor: s.filament.vendor?.name ?? "",
        }));

      // Primary spool for backward compatibility (most recently active = last in array)
      activeSpool = activeSpools[activeSpools.length - 1] ?? null;
      isMultiFilament = activeSpools.length > 1;
    }
  }

  // Determine printer status from last sync log
  let status: "printing" | "idle" | "offline" = "offline";
  if (runningPrint) {
    status = "printing";
  } else {
    const lastSync = await db.query.syncLog.findFirst({
      orderBy: (log, { desc: d }) => [d(log.createdAt)],
    });
    if (lastSync) {
      const normalizedState = (lastSync.normalizedState ?? "").toUpperCase();
      const syncAgeMs = lastSync.createdAt ? Date.now() - new Date(lastSync.createdAt).getTime() : Infinity;
      const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

      if (syncAgeMs > STALE_THRESHOLD_MS) {
        // No sync in 10+ minutes → sync worker disconnected
        status = "offline";
      } else if (normalizedState === "OFFLINE" || normalizedState === "UNKNOWN") {
        status = "offline";
      } else {
        status = "idle";
      }
    }
    // No sync log at all → offline (never connected)
  }

  return {
    name: printer.name,
    status,
    printName: runningPrint?.name || null,
    progress,
    remainingTime,
    activeSpool,
    activeSpools,
    isMultiFilament,
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

export async function getShoppingList() {
  return db.query.shoppingListItems.findMany({
    with: { filament: { with: { vendor: true } } },
    orderBy: [desc(schema.shoppingListItems.createdAt)],
  });
}

export async function getFilamentPriceHistory(filamentId: string) {
  const spoolPrices = await db.query.spools.findMany({
    where: and(
      eq(schema.spools.filamentId, filamentId),
      sql`${schema.spools.purchasePrice} IS NOT NULL`
    ),
    columns: { purchasePrice: true, purchaseDate: true, currency: true },
    orderBy: [desc(schema.spools.createdAt)],
  });

  const orderItemPrices = await db.query.orderItems.findMany({
    where: and(
      eq(schema.orderItems.filamentId, filamentId),
      sql`${schema.orderItems.unitPrice} IS NOT NULL`
    ),
    with: { order: { columns: { orderDate: true } } },
    columns: { unitPrice: true },
  });

  const prices = [
    ...spoolPrices.map(s => ({ price: s.purchasePrice ?? 0, date: s.purchaseDate })),
    ...orderItemPrices.map(oi => ({ price: oi.unitPrice ?? 0, date: oi.order.orderDate })),
  ].filter(p => p.price > 0);

  if (prices.length === 0) return { lastPrice: null, avgPrice: null, minPrice: null, maxPrice: null, count: 0 };

  const sorted = prices.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const avg = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

  return {
    lastPrice: sorted[0].price,
    avgPrice: Math.round(avg * 100) / 100,
    minPrice: Math.min(...prices.map(p => p.price)),
    maxPrice: Math.max(...prices.map(p => p.price)),
    count: prices.length,
  };
}

export async function getShoppingListWithPrices() {
  const items = await getShoppingList();
  const withPrices = await Promise.all(
    items.map(async (item) => {
      const priceHistory = await getFilamentPriceHistory(item.filamentId);
      const listing = await db.query.shopListings.findFirst({
        where: eq(schema.shopListings.filamentId, item.filamentId),
        with: { shop: true },
      });
      return {
        ...item,
        priceHistory,
        shopUrl: listing?.productUrl || null,
        shopName: listing?.shop?.name || null,
        currentShopPrice: listing?.currentPrice ?? null,
        shopCurrency: listing?.currency || "EUR",
      };
    })
  );
  return withPrices;
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

// ─── Dashboard Chart Data ────────────────────────────────────────────────────

export type MonthlySpend = { month: string; spend: number };
export type InventoryByMaterial = { material: string; count: number; weight: number };
export type PrintsPerMonth = { month: string; finished: number; failed: number };
export type SpendByVendor = { vendor: string; spend: number };
export type FilamentConsumed = { month: string; grams: number };
export type SpoolLifecycle = {
  id: string;
  name: string;
  color: string;
  vendor: string;
  material: string;
  initial: number;
  remaining: number;
  used: number;
  status: string;
};
export type MaterialUsage = {
  name: string;
  color: string;
  vendor: string;
  material: string;
  colorHex: string;
  totalUsed: number;
  printCount: number;
};
export type AvgDurationPerMonth = { month: string; minutes: number };
export type WastePerMonth = { month: string; grams: number };
export type ColorDistribution = { colorHex: string; label: string; weight: number };
export type VendorQuality = { vendor: string; success: number; failed: number; total: number; rate: number };
export type StockValuePoint = { month: string; value: number };
export type SuccessRatePerMonth = { month: string; rate: number; total: number };
export type PrintCostPerMonth = { month: string; filamentCost: number; energyCost: number; totalCost: number };
export type HmsErrorsPerMonth = { month: string; count: number };
export type HmsErrorsByModule = { module: string; count: number };

export async function getDashboardChartData(): Promise<{
  monthlySpend: MonthlySpend[];
  inventory: InventoryByMaterial[];
  printsPerMonth: PrintsPerMonth[];
  spendByVendor: SpendByVendor[];
  filamentConsumed: FilamentConsumed[];
  spoolLifecycle: SpoolLifecycle[];
  materialUsage: MaterialUsage[];
  avgDuration: AvgDurationPerMonth[];
  wastePerMonth: WastePerMonth[];
  colorDistribution: ColorDistribution[];
  vendorQuality: VendorQuality[];
  stockValueHistory: StockValuePoint[];
  successRate: SuccessRatePerMonth[];
  printCostPerMonth: PrintCostPerMonth[];
  hmsErrorsPerMonth: HmsErrorsPerMonth[];
  hmsErrorsByModule: HmsErrorsByModule[];
}> {
  // German abbreviated month names
  const DE_MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  // Build array of last 6 months (oldest first)
  const now = new Date();
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: DE_MONTHS[d.getMonth()] });
  }

  // 1. Monthly spend: sum unit_price * quantity from order_items joined to orders
  const spendRows = await db.select({
    year: sqlExtractYear(schema.orders.orderDate),
    month: sqlExtractMonth(schema.orders.orderDate),
    spend: sqlCoalesceSumProduct(schema.orderItems.unitPrice, schema.orderItems.quantity),
  })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(sqlSixMonthsAgo(schema.orders.orderDate))
    .groupBy(
      sqlGroupByYear(schema.orders.orderDate),
      sqlGroupByMonth(schema.orders.orderDate),
    );

  const spendMap = new Map(spendRows.map(r => [`${r.year}-${r.month}`, r.spend]));
  const monthlySpend: MonthlySpend[] = months.map(m => ({
    month: m.label,
    spend: Math.round((spendMap.get(`${m.year}-${m.month}`) ?? 0) * 100) / 100,
  }));

  // 2. Inventory by material: active spools grouped by filament.material
  const invRows = await db.select({
    material: schema.filaments.material,
    count: sqlCount(),
    weight: sqlCoalesceSum(schema.spools.remainingWeight),
  })
    .from(schema.spools)
    .innerJoin(schema.filaments, eq(schema.spools.filamentId, schema.filaments.id))
    .where(eq(schema.spools.status, "active"))
    .groupBy(schema.filaments.material)
    .orderBy(sql`count(*) desc`);

  const inventory: InventoryByMaterial[] = invRows.map(r => ({
    material: r.material,
    count: r.count,
    weight: r.weight,
  }));

  // 3. Prints per month: last 6 months, grouped by status bucket
  const printRows = await db.select({
    year: sqlExtractYear(schema.prints.startedAt),
    month: sqlExtractMonth(schema.prints.startedAt),
    status: schema.prints.status,
    count: sqlCount(),
  })
    .from(schema.prints)
    .where(sqlNowMinusSixMonths(schema.prints.startedAt))
    .groupBy(
      sqlGroupByYear(schema.prints.startedAt),
      sqlGroupByMonth(schema.prints.startedAt),
      schema.prints.status,
    );

  const printMap = new Map<string, { finished: number; failed: number }>();
  for (const row of printRows) {
    const key = `${row.year}-${row.month}`;
    if (!printMap.has(key)) printMap.set(key, { finished: 0, failed: 0 });
    const entry = printMap.get(key)!;
    if (row.status === "finished") entry.finished += row.count;
    else if (row.status === "failed" || row.status === "cancelled") entry.failed += row.count;
  }

  const printsPerMonth: PrintsPerMonth[] = months.map(m => {
    const entry = printMap.get(`${m.year}-${m.month}`) ?? { finished: 0, failed: 0 };
    return { month: m.label, ...entry };
  });

  // 4. Spend by vendor: sum order_items.unit_price * quantity grouped by vendor, last 6 months
  const vendorSpendRows = await db.select({
    vendor: schema.vendors.name,
    spend: sqlCoalesceSumProduct(schema.orderItems.unitPrice, schema.orderItems.quantity),
  })
    .from(schema.orderItems)
    .innerJoin(schema.filaments, eq(schema.orderItems.filamentId, schema.filaments.id))
    .innerJoin(schema.vendors, eq(schema.filaments.vendorId, schema.vendors.id))
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(sqlSixMonthsAgo(schema.orders.orderDate))
    .groupBy(schema.vendors.name)
    .orderBy(sqlSumProductDesc(schema.orderItems.unitPrice, schema.orderItems.quantity));

  const spendByVendor: SpendByVendor[] = vendorSpendRows.map(r => ({
    vendor: r.vendor,
    spend: Math.round(r.spend * 100) / 100,
  }));

  // 5. Filament consumed: monthly grams from print_usage, last 6 months
  const consumedRows = await db.select({
    year: sqlExtractYear(schema.printUsage.createdAt),
    month: sqlExtractMonth(schema.printUsage.createdAt),
    grams: sqlCoalesceSum(schema.printUsage.weightUsed),
  })
    .from(schema.printUsage)
    .where(sqlNowMinusSixMonths(schema.printUsage.createdAt))
    .groupBy(
      sqlGroupByYear(schema.printUsage.createdAt),
      sqlGroupByMonth(schema.printUsage.createdAt),
    );

  const consumedMap = new Map(consumedRows.map(r => [`${r.year}-${r.month}`, r.grams]));
  const filamentConsumed: FilamentConsumed[] = months.map(m => ({
    month: m.label,
    grams: Math.round(consumedMap.get(`${m.year}-${m.month}`) ?? 0),
  }));

  // 6. Spool lifecycle: active + empty spools, sorted by most used
  const lifecycleRows = await db.select({
    id: schema.spools.id,
    initialWeight: schema.spools.initialWeight,
    remainingWeight: schema.spools.remainingWeight,
    status: schema.spools.status,
    filamentName: schema.filaments.name,
    colorName: schema.filaments.colorName,
    material: schema.filaments.material,
    vendorName: schema.vendors.name,
  })
    .from(schema.spools)
    .innerJoin(schema.filaments, eq(schema.spools.filamentId, schema.filaments.id))
    .innerJoin(schema.vendors, eq(schema.filaments.vendorId, schema.vendors.id))
    .where(inArray(schema.spools.status, ["active", "empty"]))
    .orderBy(sql`(${schema.spools.initialWeight} - ${schema.spools.remainingWeight}) desc`)
    .limit(15);

  const spoolLifecycle: SpoolLifecycle[] = lifecycleRows.map(r => ({
    id: r.id,
    name: r.filamentName,
    color: r.colorName ?? "Unknown",
    vendor: r.vendorName,
    material: r.material,
    initial: r.initialWeight,
    remaining: r.remainingWeight,
    used: r.initialWeight - r.remainingWeight,
    status: r.status,
  }));

  // 7. Material usage: top 10 filaments by weight consumed from print_usage
  const materialUsageRows = await db.select({
    filamentId: schema.filaments.id,
    name: schema.filaments.name,
    colorName: schema.filaments.colorName,
    material: schema.filaments.material,
    colorHex: schema.filaments.colorHex,
    vendorName: schema.vendors.name,
    totalUsed: sqlCoalesceSum(schema.printUsage.weightUsed),
    printCount: sqlCountDistinct(schema.printUsage.printId),
  })
    .from(schema.printUsage)
    .innerJoin(schema.spools, eq(schema.printUsage.spoolId, schema.spools.id))
    .innerJoin(schema.filaments, eq(schema.spools.filamentId, schema.filaments.id))
    .innerJoin(schema.vendors, eq(schema.filaments.vendorId, schema.vendors.id))
    .groupBy(
      schema.filaments.id,
      schema.filaments.name,
      schema.filaments.colorName,
      schema.filaments.material,
      schema.filaments.colorHex,
      schema.vendors.name,
    )
    .orderBy(sql`sum(${schema.printUsage.weightUsed}) desc`)
    .limit(10);

  const materialUsage: MaterialUsage[] = materialUsageRows.map(r => ({
    name: r.name,
    color: r.colorName ?? "Unknown",
    vendor: r.vendorName,
    material: r.material,
    colorHex: r.colorHex ?? "888888",
    totalUsed: Math.round(r.totalUsed),
    printCount: r.printCount,
  }));

  // 8. Avg print duration per month (finished only, minutes)
  const durRows = await db.select({
    year: sqlExtractYear(schema.prints.startedAt),
    month: sqlExtractMonth(schema.prints.startedAt),
    avgSec: sql<number>`coalesce(avg(${schema.prints.durationSeconds}), 0)`,
  })
    .from(schema.prints)
    .where(and(
      sqlNowMinusSixMonths(schema.prints.startedAt),
      eq(schema.prints.status, "finished"),
    ))
    .groupBy(
      sqlGroupByYear(schema.prints.startedAt),
      sqlGroupByMonth(schema.prints.startedAt),
    );
  const durMap = new Map(durRows.map(r => [`${r.year}-${r.month}`, r.avgSec]));
  const avgDuration: AvgDurationPerMonth[] = months.map(m => ({
    month: m.label,
    minutes: Math.round((durMap.get(`${m.year}-${m.month}`) ?? 0) / 60),
  }));

  // 9. Waste / Purge per month: sum(weightUsed) - sum(printWeight), clamped >= 0
  const theoreticalRows = await db.select({
    year: sqlExtractYear(schema.prints.startedAt),
    month: sqlExtractMonth(schema.prints.startedAt),
    theoretical: sqlCoalesceSum(schema.prints.printWeight),
  })
    .from(schema.prints)
    .where(sqlNowMinusSixMonths(schema.prints.startedAt))
    .groupBy(
      sqlGroupByYear(schema.prints.startedAt),
      sqlGroupByMonth(schema.prints.startedAt),
    );
  const usedRows = await db.select({
    year: sqlExtractYear(schema.prints.startedAt),
    month: sqlExtractMonth(schema.prints.startedAt),
    used: sqlCoalesceSum(schema.printUsage.weightUsed),
  })
    .from(schema.prints)
    .innerJoin(schema.printUsage, eq(schema.printUsage.printId, schema.prints.id))
    .where(sqlNowMinusSixMonths(schema.prints.startedAt))
    .groupBy(
      sqlGroupByYear(schema.prints.startedAt),
      sqlGroupByMonth(schema.prints.startedAt),
    );
  const theoreticalMap = new Map(theoreticalRows.map(r => [`${r.year}-${r.month}`, r.theoretical]));
  const usedMap = new Map(usedRows.map(r => [`${r.year}-${r.month}`, r.used]));
  const wastePerMonth: WastePerMonth[] = months.map(m => {
    const key = `${m.year}-${m.month}`;
    const delta = (usedMap.get(key) ?? 0) - (theoreticalMap.get(key) ?? 0);
    return { month: m.label, grams: Math.max(0, Math.round(delta)) };
  });

  // 10. Color distribution: top 12 colors of active spools by remaining weight
  const colorRows = await db.select({
    colorHex: schema.filaments.colorHex,
    colorName: schema.filaments.colorName,
    material: schema.filaments.material,
    weight: sqlCoalesceSum(schema.spools.remainingWeight),
  })
    .from(schema.spools)
    .innerJoin(schema.filaments, eq(schema.spools.filamentId, schema.filaments.id))
    .where(eq(schema.spools.status, "active"))
    .groupBy(schema.filaments.colorHex, schema.filaments.colorName, schema.filaments.material)
    .orderBy(sql`sum(${schema.spools.remainingWeight}) desc`)
    .limit(12);
  const colorDistribution: ColorDistribution[] = colorRows.map(r => ({
    colorHex: r.colorHex ?? "888888",
    label: `${r.colorName ?? "?"} ${r.material}`,
    weight: Math.round(r.weight),
  }));

  // 11. Vendor quality: success/failed distinct print counts per vendor
  const vqRaw = await db.selectDistinct({
    printId: schema.prints.id,
    status: schema.prints.status,
    vendor: schema.vendors.name,
  })
    .from(schema.prints)
    .innerJoin(schema.printUsage, eq(schema.printUsage.printId, schema.prints.id))
    .innerJoin(schema.spools, eq(schema.printUsage.spoolId, schema.spools.id))
    .innerJoin(schema.filaments, eq(schema.spools.filamentId, schema.filaments.id))
    .innerJoin(schema.vendors, eq(schema.filaments.vendorId, schema.vendors.id));
  const vqMap = new Map<string, { success: number; failed: number }>();
  for (const row of vqRaw) {
    if (!vqMap.has(row.vendor)) vqMap.set(row.vendor, { success: 0, failed: 0 });
    const v = vqMap.get(row.vendor)!;
    if (row.status === "finished") v.success++;
    else if (row.status === "failed" || row.status === "cancelled") v.failed++;
  }
  const vendorQuality: VendorQuality[] = Array.from(vqMap.entries())
    .map(([vendor, v]) => {
      const total = v.success + v.failed;
      return {
        vendor,
        success: v.success,
        failed: v.failed,
        total,
        rate: total > 0 ? Math.round((v.success / total) * 100) : 0,
      };
    })
    .filter(v => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // 12. Stock value history: running (purchases - consumed cost) over last 6 months
  const firstMonthStart = new Date(months[0].year, months[0].month - 1, 1).toISOString();
  const [basePurchase] = await db.select({
    val: sqlCoalesceSumProduct(schema.orderItems.unitPrice, schema.orderItems.quantity),
  })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(sql`${schema.orders.orderDate} < ${firstMonthStart}`);
  const [baseConsumed] = await db.select({
    val: sqlCoalesceSum(schema.printUsage.cost),
  })
    .from(schema.printUsage)
    .where(sql`${schema.printUsage.createdAt} < ${firstMonthStart}`);
  const consumedRowsByMonth = await db.select({
    year: sqlExtractYear(schema.printUsage.createdAt),
    month: sqlExtractMonth(schema.printUsage.createdAt),
    cost: sqlCoalesceSum(schema.printUsage.cost),
  })
    .from(schema.printUsage)
    .where(sqlNowMinusSixMonths(schema.printUsage.createdAt))
    .groupBy(
      sqlGroupByYear(schema.printUsage.createdAt),
      sqlGroupByMonth(schema.printUsage.createdAt),
    );
  const consumedCostMap = new Map(consumedRowsByMonth.map(r => [`${r.year}-${r.month}`, r.cost]));
  let runningValue = (basePurchase?.val ?? 0) - (baseConsumed?.val ?? 0);
  const stockValueHistory: StockValuePoint[] = months.map(m => {
    const key = `${m.year}-${m.month}`;
    runningValue += (spendMap.get(key) ?? 0) - (consumedCostMap.get(key) ?? 0);
    return { month: m.label, value: Math.round(runningValue * 100) / 100 };
  });

  // 13. Print success rate per month (derived from printsPerMonth)
  const successRate: SuccessRatePerMonth[] = printsPerMonth.map(p => {
    const total = p.finished + p.failed;
    return {
      month: p.month,
      rate: total > 0 ? Math.round((p.finished / total) * 100) : 0,
      total,
    };
  });

  // 14. Print cost per month: filament cost + energy cost breakdown
  const printCostRows = await db.select({
    year: sqlExtractYear(schema.prints.startedAt),
    month: sqlExtractMonth(schema.prints.startedAt),
    filamentCost: sqlCoalesceSum(schema.prints.filamentCost),
    energyCost: sqlCoalesceSum(schema.prints.energyCost),
  })
    .from(schema.prints)
    .where(sqlSixMonthsAgo(schema.prints.startedAt))
    .groupBy(
      sqlGroupByYear(schema.prints.startedAt),
      sqlGroupByMonth(schema.prints.startedAt),
    );

  const printCostMap = new Map(printCostRows.map(r => [
    `${r.year}-${r.month}`,
    { filamentCost: r.filamentCost ?? 0, energyCost: r.energyCost ?? 0 },
  ]));
  const printCostPerMonth: PrintCostPerMonth[] = months.map(m => {
    const costs = printCostMap.get(`${m.year}-${m.month}`) ?? { filamentCost: 0, energyCost: 0 };
    const filament = Math.round(costs.filamentCost * 100) / 100;
    const energy = Math.round(costs.energyCost * 100) / 100;
    return {
      month: m.label,
      filamentCost: filament,
      energyCost: energy,
      totalCost: Math.round((filament + energy) * 100) / 100,
    };
  });

  // 15. HMS errors per month
  const hmsMonthRows = await db.select({
    year: sqlExtractYear(schema.hmsEvents.createdAt),
    month: sqlExtractMonth(schema.hmsEvents.createdAt),
    count: sqlCount(),
  })
    .from(schema.hmsEvents)
    .where(sqlSixMonthsAgo(schema.hmsEvents.createdAt))
    .groupBy(
      sqlGroupByYear(schema.hmsEvents.createdAt),
      sqlGroupByMonth(schema.hmsEvents.createdAt),
    );

  const hmsMonthMap = new Map(hmsMonthRows.map(r => [`${r.year}-${r.month}`, r.count]));
  const hmsErrorsPerMonth: HmsErrorsPerMonth[] = months.map(m => ({
    month: m.label,
    count: hmsMonthMap.get(`${m.year}-${m.month}`) ?? 0,
  }));

  // 16. HMS errors by module
  const hmsModuleRows = await db.select({
    module: schema.hmsEvents.module,
    count: sqlCount(),
  })
    .from(schema.hmsEvents)
    .groupBy(schema.hmsEvents.module);

  const moduleLabels: Record<string, string> = {
    ams: "AMS",
    mc: "Motion",
    toolhead: "Toolhead",
    mainboard: "Mainboard",
    xcam: "Camera",
    unknown: "Other",
  };
  const hmsErrorsByModule: HmsErrorsByModule[] = hmsModuleRows.map(r => ({
    module: moduleLabels[r.module ?? "unknown"] ?? r.module ?? "Other",
    count: r.count,
  }));

  return {
    monthlySpend, inventory, printsPerMonth, spendByVendor, filamentConsumed,
    spoolLifecycle, materialUsage,
    avgDuration, wastePerMonth, colorDistribution, vendorQuality, stockValueHistory, successRate,
    printCostPerMonth, hmsErrorsPerMonth, hmsErrorsByModule,
  };
}

export async function getSupplyStatus() {
  const { runSupplyAnalysis } = await import("./supply-engine-db");
  const statuses = await runSupplyAnalysis();

  const enriched = await Promise.all(statuses.map(async (s) => {
    const filament = await db.query.filaments.findFirst({
      where: eq(schema.filaments.id, s.filamentId),
      with: { vendor: true },
    });
    return {
      ...s,
      filamentName: filament?.name ?? "Unknown",
      material: filament?.material ?? "",
      vendor: filament?.vendor?.name ?? "",
      colorHex: filament?.colorHex ?? "888888",
    };
  }));

  return enriched;
}
