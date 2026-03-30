import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

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
