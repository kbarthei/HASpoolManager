import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { or, like, eq } from "drizzle-orm";
import { getOrders } from "@/lib/queries";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage() {
  const [orders, rackSpools, orderedSpools] = await Promise.all([
    getOrders(),
    db.query.spools.findMany({
      where: or(like(schema.spools.location, "rack:%")),
    }),
    db.query.spools.findMany({
      where: eq(schema.spools.location, "ordered"),
      with: { filament: true },
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

  return (
    <OrdersClient
      orders={JSON.parse(JSON.stringify(enrichedOrders))}
      rack={rack}
    />
  );
}
