import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { or, like } from "drizzle-orm";
import { getOrders } from "@/lib/queries";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage() {
  const [orders, rackSpools] = await Promise.all([
    getOrders(),
    db.query.spools.findMany({
      where: or(like(schema.spools.location, "rack:%")),
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

  const rack = { rows: 4, cols: 8, occupiedPositions };

  return (
    <OrdersClient
      orders={JSON.parse(JSON.stringify(orders))}
      rack={rack}
    />
  );
}
