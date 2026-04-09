#!/usr/bin/env npx tsx
/**
 * Link unlinked order items to spools.
 *
 * For each order_item with spool_id=NULL:
 *   1. Look for an existing spool with the same filament_id that has no
 *      order_item linked to it (status empty/archived preferred, then active).
 *   2. If found → link the order item to that spool + set purchasePrice.
 *   3. If not found → create a new archived spool (remainingWeight=0) and link.
 *
 * Usage:
 *   npx tsx scripts/link-unlinked-order-items.ts            # dry run (default)
 *   npx tsx scripts/link-unlinked-order-items.ts --apply     # actually modify DB
 *
 * The script prints a summary of what it will/did do. Run the dry run first!
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import {
  orderItems,
  orders,
  spools,
  filaments,
  vendors,
} from "@/lib/db/schema";
import { eq, isNull, and, notInArray, inArray, sql } from "drizzle-orm";

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");
  console.log();

  // Find all unlinked order items with their order + filament info
  const unlinked = await db
    .select({
      itemId: orderItems.id,
      orderId: orderItems.orderId,
      filamentId: orderItems.filamentId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      orderNumber: orders.orderNumber,
      orderDate: orders.orderDate,
      filamentName: filaments.name,
      vendorName: vendors.name,
      material: filaments.material,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(filaments, eq(orderItems.filamentId, filaments.id))
    .innerJoin(vendors, eq(filaments.vendorId, vendors.id))
    .where(isNull(orderItems.spoolId));

  if (unlinked.length === 0) {
    console.log("No unlinked order items found. Nothing to do.");
    return;
  }

  console.log(`Found ${unlinked.length} unlinked order item(s):\n`);

  // Get all spool IDs that are already linked to an order item
  const linkedSpoolIds = await db
    .selectDistinct({ spoolId: orderItems.spoolId })
    .from(orderItems)
    .where(sql`${orderItems.spoolId} IS NOT NULL`);
  const alreadyLinked = new Set(linkedSpoolIds.map((r) => r.spoolId!));

  let linkedCount = 0;
  let createdCount = 0;

  for (const item of unlinked) {
    const label = `[${item.orderNumber ?? item.orderId.slice(0, 8)}] ${item.vendorName} ${item.filamentName} ×${item.quantity} (€${item.unitPrice?.toFixed(2) ?? "?"})`;

    // Strategy B: find an existing spool with the same filament that isn't linked yet
    const candidateSpools = await db
      .select({
        id: spools.id,
        status: spools.status,
        remainingWeight: spools.remainingWeight,
        purchasePrice: spools.purchasePrice,
        createdAt: spools.createdAt,
      })
      .from(spools)
      .where(eq(spools.filamentId, item.filamentId))
      .orderBy(
        // Prefer empty/archived spools first (most likely the used-up ones)
        sql`CASE WHEN ${spools.status} IN ('empty','archived') THEN 0 ELSE 1 END`,
        sql`${spools.createdAt} ASC`,
      );

    // Filter out spools already linked to another order item
    const available = candidateSpools.filter((s) => !alreadyLinked.has(s.id));

    if (available.length > 0) {
      // Link to the best candidate
      const match = available[0];
      console.log(`  LINK  ${label}`);
      console.log(`        → spool ${match.id.slice(0, 8)}… (${match.status}, ${match.remainingWeight}g remaining)`);

      if (!DRY_RUN) {
        await db
          .update(orderItems)
          .set({ spoolId: match.id })
          .where(eq(orderItems.id, item.itemId));
        if (item.unitPrice != null && match.purchasePrice == null) {
          await db
            .update(spools)
            .set({ purchasePrice: item.unitPrice, purchaseDate: item.orderDate })
            .where(eq(spools.id, match.id));
        }
      }

      alreadyLinked.add(match.id);
      linkedCount++;
    } else {
      // Strategy A: create an archived spool
      console.log(`  CREATE  ${label}`);
      console.log(`          → new archived spool (0g remaining, price €${item.unitPrice?.toFixed(2) ?? "0"})`);

      if (!DRY_RUN) {
        const [newSpool] = await db
          .insert(spools)
          .values({
            filamentId: item.filamentId,
            initialWeight: 1000,
            remainingWeight: 0,
            status: "archived",
            location: "archived",
            purchasePrice: item.unitPrice,
            purchaseDate: item.orderDate,
          })
          .returning({ id: spools.id });

        await db
          .update(orderItems)
          .set({ spoolId: newSpool.id })
          .where(eq(orderItems.id, item.itemId));

        alreadyLinked.add(newSpool.id);
      }

      createdCount++;
    }
  }

  console.log();
  console.log(`Summary: ${linkedCount} linked to existing spools, ${createdCount} new archived spools`);
  if (DRY_RUN) {
    console.log("\nThis was a dry run. Re-run with --apply to make changes.");
  } else {
    console.log("\nDone! Changes applied to the database.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
