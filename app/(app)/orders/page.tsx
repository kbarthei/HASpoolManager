export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { or, like, eq, desc } from "drizzle-orm";
import { getOrders, getShoppingListWithPrices } from "@/lib/queries";
import { OrdersClient } from "./orders-client";
import { SupplyAlertsSection } from "./supply-alerts-section";
import { SupplyRules } from "@/components/orders/supply-rules";
import { OptimizedCart } from "@/components/orders/optimized-cart";
import { BudgetCard } from "@/components/budget/budget-card";

export default async function OrdersPage() {
  const [orders, rackSpools, orderedSpools, shoppingList, allFilaments, supplyAlerts, supplyRulesList] = await Promise.all([
    getOrders(),
    db.query.spools.findMany({
      where: or(like(schema.spools.location, "rack:%")),
    }),
    db.query.spools.findMany({
      where: eq(schema.spools.location, "ordered"),
      with: { filament: true },
    }),
    getShoppingListWithPrices(),
    db.query.filaments.findMany({
      with: { vendor: true },
      orderBy: (f, { asc }) => [asc(f.name)],
    }),
    db.query.supplyAlerts.findMany({
      where: eq(schema.supplyAlerts.status, "active"),
      orderBy: [desc(schema.supplyAlerts.createdAt)],
      with: { filament: { with: { vendor: true } } },
    }),
    db.query.supplyRules.findMany({
      orderBy: [desc(schema.supplyRules.createdAt)],
      with: {
        filament: { with: { vendor: true } },
        vendor: true,
        preferredShop: true,
      },
    }),
  ]);

  // Build occupied rack positions list for ReceiveWizard
  const occupiedPositions: string[] = [];
  for (const spool of rackSpools) {
    const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
    if (match) {
      occupiedPositions.push(`${match[1]}-${match[2]}`);
    }
  }

  // Attach ordered spools to their order items by filament_id
  // Group ordered spools by filament_id for matching
  const spoolsByFilament = new Map<string, typeof orderedSpools>();
  for (const spool of orderedSpools) {
    const key = spool.filamentId;
    if (!spoolsByFilament.has(key)) spoolsByFilament.set(key, []);
    spoolsByFilament.get(key)!.push(spool);
  }

  // Enrich orders: for each "ordered" order, attach spools to items
  const enrichedOrders = orders.map(order => {
    if (order.status !== "ordered") return order;

    // Track which spools we've already assigned (avoid double-counting)
    const assignedSpoolIds = new Set<string>();

    const enrichedItems = order.items.map(item => {
      const availableSpools = (spoolsByFilament.get(item.filamentId) || [])
        .filter(s => !assignedSpoolIds.has(s.id));

      // Take as many spools as the quantity
      const assignedSpools = availableSpools.slice(0, item.quantity);
      assignedSpools.forEach(s => assignedSpoolIds.add(s.id));

      return {
        ...item,
        spools: assignedSpools.map(s => ({ id: s.id, location: s.location })),
      };
    });

    return { ...order, items: enrichedItems };
  });

  const rack = { rows: 4, cols: 8, occupiedPositions };

  const filamentList = allFilaments.map(f => ({
    id: f.id,
    name: f.name,
    material: f.material,
    colorHex: f.colorHex,
    vendor: { name: f.vendor.name },
  }));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Budget */}
      <BudgetCard />

      {/* Supply Alerts */}
      {supplyAlerts.length > 0 && (
        <SupplyAlertsSection alerts={JSON.parse(JSON.stringify(supplyAlerts))} />
      )}

      {/* Optimized cart (from supply analysis) */}
      <OptimizedCart />

      {/* Orders + Shopping List (existing) */}
      <OrdersClient
        orders={JSON.parse(JSON.stringify(enrichedOrders))}
        rack={rack}
        shoppingList={JSON.parse(JSON.stringify(shoppingList))}
        allFilaments={JSON.parse(JSON.stringify(filamentList))}
      />

      {/* Supply Rules (collapsible) */}
      <SupplyRules
        rules={JSON.parse(JSON.stringify(supplyRulesList))}
        filaments={JSON.parse(JSON.stringify(filamentList))}
      />
    </div>
  );
}
