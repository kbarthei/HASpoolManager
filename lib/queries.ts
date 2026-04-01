import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

export async function getRackConfig(): Promise<{ rows: number; columns: number }> {
  const [rowsSetting, colsSetting] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.key, "rack_rows") }),
    db.query.settings.findFirst({ where: eq(schema.settings.key, "rack_columns") }),
  ]);
  return {
    rows: rowsSetting ? parseInt(rowsSetting.value, 10) : 3,
    columns: colsSetting ? parseInt(colsSetting.value, 10) : 10,
  };
}

export async function getSyncLog(limit = 50) {
  return db.query.syncLog.findMany({
    orderBy: (log, { desc }) => [desc(log.createdAt)],
    limit,
  });
}

export async function getSystemStats() {
  const [spoolCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.spools);
  const [filamentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.filaments);
  const [printCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.prints);
  const [vendorCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.vendors);
  const [orderCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.orders);

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
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.spools).where(eq(schema.spools.status, "draft"));
  return result.count;
}

export async function getDashboardStats() {
  // Count active spools (excludes drafts)
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

  // Count draft spools needing review
  const [draftCount] = await db.select({ count: sql<number>`count(*)::int` })
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
    // Fallback to single spool
    if (spoolIds.length === 0 && runningPrint.activeSpoolId) {
      spoolIds = [runningPrint.activeSpoolId];
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

  return {
    name: printer.name,
    status: runningPrint ? "printing" : "idle",
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
    ...spoolPrices.map(s => ({ price: parseFloat(s.purchasePrice!), date: s.purchaseDate })),
    ...orderItemPrices.map(oi => ({ price: parseFloat(oi.unitPrice!), date: oi.order.orderDate })),
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
        currentShopPrice: listing?.currentPrice ? parseFloat(listing.currentPrice) : null,
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

export async function getDashboardChartData(): Promise<{
  monthlySpend: MonthlySpend[];
  inventory: InventoryByMaterial[];
  printsPerMonth: PrintsPerMonth[];
  spendByVendor: SpendByVendor[];
  filamentConsumed: FilamentConsumed[];
  spoolLifecycle: SpoolLifecycle[];
  materialUsage: MaterialUsage[];
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
    year: sql<number>`extract(year from ${schema.orders.orderDate})::int`,
    month: sql<number>`extract(month from ${schema.orders.orderDate})::int`,
    spend: sql<number>`coalesce(sum(${schema.orderItems.unitPrice}::numeric * ${schema.orderItems.quantity}), 0)::float`,
  })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(sql`${schema.orders.orderDate} >= (current_date - interval '6 months')`)
    .groupBy(
      sql`extract(year from ${schema.orders.orderDate})`,
      sql`extract(month from ${schema.orders.orderDate})`,
    );

  const spendMap = new Map(spendRows.map(r => [`${r.year}-${r.month}`, r.spend]));
  const monthlySpend: MonthlySpend[] = months.map(m => ({
    month: m.label,
    spend: Math.round((spendMap.get(`${m.year}-${m.month}`) ?? 0) * 100) / 100,
  }));

  // 2. Inventory by material: active spools grouped by filament.material
  const invRows = await db.select({
    material: schema.filaments.material,
    count: sql<number>`count(*)::int`,
    weight: sql<number>`coalesce(sum(${schema.spools.remainingWeight}), 0)::int`,
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
    year: sql<number>`extract(year from ${schema.prints.startedAt})::int`,
    month: sql<number>`extract(month from ${schema.prints.startedAt})::int`,
    status: schema.prints.status,
    count: sql<number>`count(*)::int`,
  })
    .from(schema.prints)
    .where(sql`${schema.prints.startedAt} >= (now() - interval '6 months')`)
    .groupBy(
      sql`extract(year from ${schema.prints.startedAt})`,
      sql`extract(month from ${schema.prints.startedAt})`,
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
    spend: sql<number>`coalesce(sum(${schema.orderItems.unitPrice}::numeric * ${schema.orderItems.quantity}), 0)::float`,
  })
    .from(schema.orderItems)
    .innerJoin(schema.filaments, eq(schema.orderItems.filamentId, schema.filaments.id))
    .innerJoin(schema.vendors, eq(schema.filaments.vendorId, schema.vendors.id))
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(sql`${schema.orders.orderDate} >= (current_date - interval '6 months')`)
    .groupBy(schema.vendors.name)
    .orderBy(sql`sum(${schema.orderItems.unitPrice}::numeric * ${schema.orderItems.quantity}) desc`);

  const spendByVendor: SpendByVendor[] = vendorSpendRows.map(r => ({
    vendor: r.vendor,
    spend: Math.round(r.spend * 100) / 100,
  }));

  // 5. Filament consumed: monthly grams from print_usage, last 6 months
  const consumedRows = await db.select({
    year: sql<number>`extract(year from ${schema.printUsage.createdAt})::int`,
    month: sql<number>`extract(month from ${schema.printUsage.createdAt})::int`,
    grams: sql<number>`coalesce(sum(${schema.printUsage.weightUsed}), 0)::float`,
  })
    .from(schema.printUsage)
    .where(sql`${schema.printUsage.createdAt} >= (now() - interval '6 months')`)
    .groupBy(
      sql`extract(year from ${schema.printUsage.createdAt})`,
      sql`extract(month from ${schema.printUsage.createdAt})`,
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
    totalUsed: sql<number>`coalesce(sum(${schema.printUsage.weightUsed}), 0)::float`,
    printCount: sql<number>`count(distinct ${schema.printUsage.printId})::int`,
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

  return { monthlySpend, inventory, printsPerMonth, spendByVendor, filamentConsumed, spoolLifecycle, materialUsage };
}
