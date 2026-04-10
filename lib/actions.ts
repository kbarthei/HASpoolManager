"use server";

import { db } from "@/lib/db";
import { amsSlots, spools, shops, orders, orderItems, filaments, vendors, shoppingListItems, shopListings, tagMappings, printUsage, prints, settings } from "@/lib/db/schema";
import { eq, and, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRackConfig } from "@/lib/queries";

export async function moveSpoolInRack(
  spoolId: string,
  toRow: number,
  toCol: number,
  swapSpoolId?: string,
  fromRow?: number,
  fromCol?: number,
) {
  await db.update(spools)
    .set({ location: `rack:${toRow}-${toCol}`, updatedAt: new Date() })
    .where(eq(spools.id, spoolId));

  if (swapSpoolId && fromRow != null && fromCol != null) {
    await db.update(spools)
      .set({ location: `rack:${fromRow}-${fromCol}`, updatedAt: new Date() })
      .where(eq(spools.id, swapSpoolId));
  }

  revalidatePath("/storage");
  revalidatePath("/");
}

export async function assignSpoolToRack(spoolId: string, row: number, col: number) {
  await db.update(spools)
    .set({ location: `rack:${row}-${col}`, updatedAt: new Date() })
    .where(eq(spools.id, spoolId));
  revalidatePath("/storage");
  revalidatePath("/");
}

export async function removeSpoolFromRack(spoolId: string) {
  await db.update(spools)
    .set({ location: "storage", updatedAt: new Date() })
    .where(eq(spools.id, spoolId));
  revalidatePath("/storage");
  revalidatePath("/");
}

export async function moveSpoolTo(spoolId: string, location: string) {
  await db.update(spools)
    .set({ location, updatedAt: new Date() })
    .where(eq(spools.id, spoolId));
  revalidatePath("/storage");
  revalidatePath("/spools");
  revalidatePath("/");
}

export async function moveAllRackToWorkbench() {
  const result = await db.update(spools)
    .set({ location: "workbench", updatedAt: new Date() })
    .where(like(spools.location, "rack:%"))
    .returning();
  revalidatePath("/storage");
  revalidatePath("/spools");
  revalidatePath("/");
  return result.length;
}

export async function moveOutOfBoundsToWorkbench() {
  const { rows, columns } = await getRackConfig();
  const rackSpools = await db.query.spools.findMany({
    where: like(spools.location, "rack:%"),
  });
  let moved = 0;
  for (const spool of rackSpools) {
    const match = spool.location?.match(/^rack:(\d+)-(\d+)$/);
    if (!match) continue;
    const r = parseInt(match[1], 10);
    const c = parseInt(match[2], 10);
    if (r > rows || c > columns) {
      await db.update(spools)
        .set({ location: "workbench", updatedAt: new Date() })
        .where(eq(spools.id, spool.id));
      moved++;
    }
  }
  if (moved > 0) {
    revalidatePath("/storage");
    revalidatePath("/spools");
    revalidatePath("/");
  }
  return moved;
}

export async function loadSpoolToSlot(slotId: string, spoolId: string) {
  // Get the slot to determine slot_type
  const slot = await db.query.amsSlots.findFirst({
    where: eq(amsSlots.id, slotId),
  });
  if (!slot) throw new Error("Slot not found");

  const locationMap: Record<string, string> = {
    ams: "ams",
    ams_ht: "ams-ht",
    external: "external",
  };

  // Update the slot
  await db.update(amsSlots).set({ spoolId, isEmpty: false, updatedAt: new Date() }).where(eq(amsSlots.id, slotId));

  // Update spool location
  await db.update(spools).set({
    location: locationMap[slot.slotType] || "ams",
    updatedAt: new Date(),
  }).where(eq(spools.id, spoolId));

  revalidatePath("/ams");
  revalidatePath("/");
}

export async function unloadSlotSpool(slotId: string) {
  const slot = await db.query.amsSlots.findFirst({
    where: eq(amsSlots.id, slotId),
    with: { spool: true },
  });
  if (!slot) throw new Error("Slot not found");

  // Clear the slot
  await db.update(amsSlots).set({ spoolId: null, isEmpty: true, updatedAt: new Date() }).where(eq(amsSlots.id, slotId));

  // Move spool back to storage
  if (slot.spoolId) {
    await db.update(spools).set({ location: "storage", updatedAt: new Date() }).where(eq(spools.id, slot.spoolId));
  }

  revalidatePath("/ams");
  revalidatePath("/");
}

export async function createOrderFromParsed(data: {
  shop: string | null;
  orderNumber: string | null;
  orderDate: string | null;
  items: Array<{
    name: string;
    vendor: string;
    material: string;
    colorName: string | null;
    colorHex: string | null;
    weight: number;
    quantity: number;
    price: number | null;
    currency: string;
    url: string | null;
    matchedFilamentId: string | null;
  }>;
}) {
  // Find or create shop
  let shopId: string | null = null;
  if (data.shop) {
    let shop = await db.query.shops.findFirst({
      where: eq(shops.name, data.shop),
    });
    if (!shop) {
      [shop] = await db.insert(shops).values({ name: data.shop }).returning();
    }
    shopId = shop.id;
  }

  // Calculate total cost
  const totalCost = data.items.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0,
  );

  // Create order
  const [order] = await db
    .insert(orders)
    .values({
      shopId,
      orderNumber: data.orderNumber,
      orderDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
      status: "ordered",
      totalCost: totalCost > 0 ? totalCost : null,
      currency: data.items[0]?.currency || "EUR",
    })
    .returning();

  // Process each line item
  for (const item of data.items) {
    let filamentId = item.matchedFilamentId;

    if (!filamentId) {
      // Find or create vendor
      let vendor = await db.query.vendors.findFirst({
        where: eq(vendors.name, item.vendor),
      });
      if (!vendor) {
        [vendor] = await db
          .insert(vendors)
          .values({ name: item.vendor })
          .returning();
      }

      // Find existing filament by vendor + name, or create new
      const allVendorFilaments = await db.query.filaments.findMany({
        where: eq(filaments.vendorId, vendor.id),
      });
      const nameMatch = allVendorFilaments.find(
        (f) => f.name.toLowerCase() === item.name.toLowerCase()
      );

      if (nameMatch) {
        filamentId = nameMatch.id;
      } else {
        const [filament] = await db
          .insert(filaments)
          .values({
            vendorId: vendor.id,
            name: item.name,
            material: item.material,
            colorName: item.colorName,
            colorHex: item.colorHex,
            spoolWeight: item.weight || 1000,
          })
          .returning();
        filamentId = filament.id;
      }
    }

    // Create or update shop listing (links filament to shop product URL for price tracking)
    if (shopId && item.url && filamentId) {
      const existingListing = await db.query.shopListings.findFirst({
        where: and(
          eq(shopListings.shopId, shopId),
          eq(shopListings.filamentId, filamentId)
        ),
      });
      if (existingListing) {
        await db.update(shopListings).set({
          productUrl: item.url,
          currentPrice: item.price ?? existingListing.currentPrice,
          pricePerSpool: item.price ?? existingListing.pricePerSpool,
          lastCheckedAt: new Date(),
        }).where(eq(shopListings.id, existingListing.id));
      } else {
        await db.insert(shopListings).values({
          shopId,
          filamentId,
          productUrl: item.url,
          currentPrice: item.price ?? null,
          pricePerSpool: item.price ?? null,
          currency: item.currency || "EUR",
          lastCheckedAt: new Date(),
        });
      }
    }

    // Create one order item and spool per quantity unit, linking them directly
    for (let i = 0; i < item.quantity; i++) {
      const [newSpool] = await db.insert(spools).values({
        filamentId,
        initialWeight: item.weight || 1000,
        remainingWeight: item.weight || 1000,
        purchasePrice: item.price ?? null,
        currency: item.currency || "EUR",
        purchaseDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
        location: "ordered",
        status: "active",
      }).returning();

      await db.insert(orderItems).values({
        orderId: order.id,
        filamentId,
        quantity: 1,
        unitPrice: item.price ?? null,
        spoolId: newSpool.id,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/orders");

  return { orderId: order.id };
}

// Wrapper with error logging for client calls
export async function createOrderSafe(data: Parameters<typeof createOrderFromParsed>[0]) {
  try {
    return await createOrderFromParsed(data);
  } catch (error) {
    console.error("createOrderFromParsed failed:", error);
    throw error;
  }
}

export async function adjustSpoolWeight(spoolId: string, newWeight: number) {
  if (newWeight < 0) throw new Error("Weight cannot be negative");

  const spool = await db.query.spools.findFirst({
    where: eq(spools.id, spoolId),
  });
  if (!spool) throw new Error("Spool not found");

  await db.update(spools)
    .set({
      remainingWeight: Math.round(newWeight),
      status: newWeight <= 0 ? "empty" : "active",
      updatedAt: new Date(),
    })
    .where(eq(spools.id, spoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath(`/spools/${spoolId}`);
  revalidatePath("/storage");
  revalidatePath("/ams");
}

export async function receiveOrder(
  orderId: string,
  placements: Array<{ spoolId: string; location: string }>,
) {
  for (const { spoolId, location } of placements) {
    await db
      .update(spools)
      .set({ location, updatedAt: new Date() })
      .where(eq(spools.id, spoolId));
  }

  await db
    .update(orders)
    .set({ status: "delivered", updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/orders");
}

export async function addToShoppingList(filamentId: string, quantity: number = 1) {
  const existing = await db.query.shoppingListItems.findFirst({
    where: eq(shoppingListItems.filamentId, filamentId),
  });
  if (existing) {
    await db.update(shoppingListItems)
      .set({ quantity: existing.quantity + quantity, updatedAt: new Date() })
      .where(eq(shoppingListItems.id, existing.id));
  } else {
    await db.insert(shoppingListItems).values({ filamentId, quantity });
  }
  revalidatePath("/orders");
}

export async function removeFromShoppingList(itemId: string) {
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
  revalidatePath("/orders");
}

export async function updateShoppingListQuantity(itemId: string, quantity: number) {
  if (quantity <= 0) {
    await db.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
  } else {
    await db.update(shoppingListItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(shoppingListItems.id, itemId));
  }
  revalidatePath("/orders");
}

export async function clearShoppingList() {
  await db.delete(shoppingListItems);
  revalidatePath("/orders");
}

// ─── Spool Link & Merge ─────────────────────────────────────────────────────

export async function linkSpoolToOrderItem(spoolId: string, orderItemId: string) {
  const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
  if (!spool) throw new Error("Spool not found");

  const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, orderItemId) });
  if (!item) throw new Error("Order item not found");

  // If the order item already points to a different spool, unlink it
  if (item.spoolId && item.spoolId !== spoolId) {
    await db.update(orderItems).set({ spoolId: null }).where(eq(orderItems.id, orderItemId));
  }

  // Link spool to order item
  await db.update(orderItems).set({ spoolId }).where(eq(orderItems.id, orderItemId));

  // Transfer purchase price from order item to spool (if spool has none)
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (!spool.purchasePrice && item.unitPrice) {
    updates.purchasePrice = item.unitPrice;
    updates.currency = "EUR";
  }
  await db.update(spools).set(updates).where(eq(spools.id, spoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath(`/spools/${spoolId}`);
  revalidatePath("/orders");
}

export async function mergeSpools(targetSpoolId: string, sourceSpoolId: string) {
  if (targetSpoolId === sourceSpoolId) throw new Error("Cannot merge spool with itself");

  const target = await db.query.spools.findFirst({ where: eq(spools.id, targetSpoolId) });
  const source = await db.query.spools.findFirst({ where: eq(spools.id, sourceSpoolId) });
  if (!target) throw new Error("Target spool not found");
  if (!source) throw new Error("Source spool not found");

  // Move print usage records from source to target
  await db.update(printUsage)
    .set({ spoolId: targetSpoolId })
    .where(eq(printUsage.spoolId, sourceSpoolId));

  // Move tag mappings from source to target
  await db.update(tagMappings)
    .set({ spoolId: targetSpoolId })
    .where(eq(tagMappings.spoolId, sourceSpoolId));

  // Re-link order items from source to target
  await db.update(orderItems)
    .set({ spoolId: targetSpoolId })
    .where(eq(orderItems.spoolId, sourceSpoolId));

  // Transfer purchase price if target has none
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (!target.purchasePrice && source.purchasePrice) {
    updates.purchasePrice = source.purchasePrice;
    updates.currency = source.currency;
  }
  if (!target.purchaseDate && source.purchaseDate) {
    updates.purchaseDate = source.purchaseDate;
  }
  await db.update(spools).set(updates).where(eq(spools.id, targetSpoolId));

  // Clear AMS slot if source was in one
  await db.update(amsSlots)
    .set({ spoolId: null, isEmpty: true, updatedAt: new Date() })
    .where(eq(amsSlots.spoolId, sourceSpoolId));

  // Delete the source spool
  await db.delete(spools).where(eq(spools.id, sourceSpoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath(`/spools/${targetSpoolId}`);
  revalidatePath("/orders");
  revalidatePath("/storage");
  revalidatePath("/ams");
}

export async function archiveSpool(spoolId: string) {
  // If spool is in an AMS slot, clear the slot first
  const slot = await db.query.amsSlots.findFirst({
    where: eq(amsSlots.spoolId, spoolId),
  });
  if (slot) {
    await db.update(amsSlots).set({ spoolId: null, isEmpty: true, updatedAt: new Date() }).where(eq(amsSlots.id, slot.id));
  }

  await db.update(spools).set({
    status: "archived",
    location: "archive",
    updatedAt: new Date(),
  }).where(eq(spools.id, spoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/ams");
}

export async function restoreSpool(spoolId: string) {
  await db.update(spools).set({
    status: "active",
    location: "surplus",
    updatedAt: new Date(),
  }).where(eq(spools.id, spoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/storage");
}

export async function permanentlyDeleteSpool(spoolId: string) {
  // Delete tag mappings
  await db.delete(tagMappings).where(eq(tagMappings.spoolId, spoolId));
  // Delete print usage records
  await db.delete(printUsage).where(eq(printUsage.spoolId, spoolId));
  // Null out order item references
  await db.update(orderItems).set({ spoolId: null }).where(eq(orderItems.spoolId, spoolId));
  // Delete the spool
  await db.delete(spools).where(eq(spools.id, spoolId));

  revalidatePath("/spools");
}

export async function bulkDeleteSpools(spoolIds: string[]) {
  for (const id of spoolIds) {
    await permanentlyDeleteSpool(id);
  }
  revalidatePath("/spools");
}

export async function confirmDraftSpool(
  spoolId: string,
  data: {
    filamentId?: string;           // if assigning an existing filament
    vendorName?: string;           // for new filament creation
    filamentName?: string;
    material?: string;
    colorHex?: string;
    colorName?: string;
    purchasePrice?: number;
    initialWeight?: number;
  }
) {
  const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
  if (!spool) throw new Error("Spool not found");
  if (spool.status !== "draft") throw new Error("Spool is not a draft");

  let targetFilamentId = data.filamentId;

  if (!targetFilamentId && data.filamentName && data.material) {
    // Find or create vendor
    const vendorName = data.vendorName?.trim() || "Unknown";
    let vendor = await db.query.vendors.findFirst({ where: eq(vendors.name, vendorName) });
    if (!vendor) {
      [vendor] = await db.insert(vendors).values({ name: vendorName }).returning();
    }

    // Find or create filament
    const colorHex = (data.colorHex ?? "888888").replace("#", "").slice(0, 6).toUpperCase();
    let filament = await db.query.filaments.findFirst({
      where: and(
        eq(filaments.vendorId, vendor.id),
        eq(filaments.name, data.filamentName),
        eq(filaments.colorHex, colorHex),
      ),
    });
    if (!filament) {
      [filament] = await db.insert(filaments).values({
        vendorId: vendor.id,
        name: data.filamentName,
        material: data.material,
        colorHex,
        colorName: data.colorName ?? null,
        spoolWeight: data.initialWeight ?? 1000,
      }).returning();
    }
    targetFilamentId = filament.id;
  }

  if (!targetFilamentId) throw new Error("filamentId or filament details required");

  const newWeight = data.initialWeight ?? spool.initialWeight;

  await db.update(spools).set({
    filamentId: targetFilamentId,
    status: "active",
    initialWeight: newWeight,
    remainingWeight: newWeight,
    purchasePrice: data.purchasePrice ?? null,
    updatedAt: new Date(),
  }).where(eq(spools.id, spoolId));

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/ams");
}

export async function updateRackConfig(rows: number, columns: number) {
  "use server";
  await db.insert(settings)
    .values({ key: "rack_rows", value: String(rows) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(rows), updatedAt: new Date() } });
  await db.insert(settings)
    .values({ key: "rack_columns", value: String(columns) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(columns), updatedAt: new Date() } });
  revalidatePath("/storage");
  revalidatePath("/admin");
}

export async function createSpoolFromFilament(filamentId: string, initialWeight: number = 1000) {
  const [spool] = await db.insert(spools).values({
    filamentId,
    initialWeight,
    remainingWeight: initialWeight,
    status: "active",
    location: "workbench",
  }).returning();
  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/");
  return spool;
}

export async function cloneSpool(sourceSpoolId: string, initialWeight: number = 1000) {
  const source = await db.query.spools.findFirst({
    where: eq(spools.id, sourceSpoolId),
  });
  if (!source) throw new Error("Source spool not found");

  const [newSpool] = await db.insert(spools).values({
    filamentId: source.filamentId,
    initialWeight,
    remainingWeight: initialWeight,
    status: "active",
    location: "workbench",
  }).returning();
  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/");
  return newSpool;
}

export async function createSpoolFromScan(data: {
  vendorName: string;
  filamentName: string;
  material: string;
  colorName?: string | null;
  colorHex?: string | null;
  weight?: number;
  nozzleTempMin?: number | null;
  nozzleTempMax?: number | null;
}) {
  // Find or create vendor
  const vendorName = data.vendorName.trim() || "Unknown";
  let vendor = await db.query.vendors.findFirst({ where: eq(vendors.name, vendorName) });
  if (!vendor) {
    [vendor] = await db.insert(vendors).values({ name: vendorName }).returning();
  }

  const colorHex = (data.colorHex ?? "888888").replace("#", "").slice(0, 6).toUpperCase();
  const weight = data.weight ?? 1000;

  // Find existing filament by vendor + name + color, or create new
  let filament = await db.query.filaments.findFirst({
    where: and(
      eq(filaments.vendorId, vendor.id),
      eq(filaments.name, data.filamentName),
      eq(filaments.colorHex, colorHex),
    ),
  });
  if (!filament) {
    [filament] = await db.insert(filaments).values({
      vendorId: vendor.id,
      name: data.filamentName,
      material: data.material,
      colorHex,
      colorName: data.colorName ?? null,
      spoolWeight: weight,
      nozzleTempMin: data.nozzleTempMin ?? null,
      nozzleTempMax: data.nozzleTempMax ?? null,
    }).returning();
  }

  const [spool] = await db.insert(spools).values({
    filamentId: filament.id,
    initialWeight: weight,
    remainingWeight: weight,
    status: "active",
    location: "workbench",
  }).returning();

  revalidatePath("/spools");
  revalidatePath("/storage");
  revalidatePath("/");
  return spool;
}

export async function importHistoricalOrder(data: {
  shopName: string;
  orderNumber: string;
  orderedAt: string; // ISO date YYYY-MM-DD
  items: Array<{
    filamentId: string;
    spoolIds: string[]; // spools to link and update purchase price
    quantity: number;
    unitPrice: number;
  }>;
}) {
  // 1. Find or create shop
  let shopId: string | null = null;
  if (data.shopName?.trim()) {
    let shop = await db.query.shops.findFirst({
      where: eq(shops.name, data.shopName.trim()),
    });
    if (!shop) {
      [shop] = await db.insert(shops).values({ name: data.shopName.trim() }).returning();
    }
    shopId = shop.id;
  }

  // 2. Calculate total cost
  const totalCost = data.items.reduce(
    (sum, item) => sum + (item.unitPrice || 0) * item.quantity,
    0,
  );

  // 3. Create order with status "delivered" (historical)
  const [order] = await db
    .insert(orders)
    .values({
      shopId,
      orderNumber: data.orderNumber?.trim() || null,
      orderDate: data.orderedAt,
      status: "delivered",
      actualDelivery: data.orderedAt,
      totalCost: totalCost > 0 ? totalCost : null,
      currency: "EUR",
    })
    .returning();

  // 4. Create order items and update spool purchase prices
  for (const item of data.items) {
    if (item.spoolIds.length <= 1) {
      // Single spool (or none) — one order item, optionally linked directly
      await db.insert(orderItems).values({
        orderId: order.id,
        filamentId: item.filamentId,
        quantity: item.quantity,
        unitPrice: item.unitPrice > 0 ? item.unitPrice : null,
        spoolId: item.spoolIds[0] ?? null,
      });

      if (item.spoolIds[0]) {
        await db.update(spools)
          .set({
            purchasePrice: item.unitPrice > 0 ? item.unitPrice : null,
            purchaseDate: data.orderedAt,
            updatedAt: new Date(),
          })
          .where(eq(spools.id, item.spoolIds[0]));
      }
    } else {
      // Multiple spools — create one order item per spool for direct linkage
      for (const spoolId of item.spoolIds) {
        await db.insert(orderItems).values({
          orderId: order.id,
          filamentId: item.filamentId,
          quantity: 1,
          unitPrice: item.unitPrice > 0 ? item.unitPrice : null,
          spoolId,
        });

        await db.update(spools)
          .set({
            purchasePrice: item.unitPrice > 0 ? item.unitPrice : null,
            purchaseDate: data.orderedAt,
            updatedAt: new Date(),
          })
          .where(eq(spools.id, spoolId));
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/orders");
  revalidatePath("/admin");

  return { orderId: order.id };
}

export async function importBatchOrders(batchOrders: Array<{
  shopName: string;
  orderNumber: string;
  orderedAt: string;
  items: Array<{
    filamentId: string | null;
    spoolIds: string[];
    quantity: number;
    unitPrice: number;
    name: string;
  }>;
}>) {
  let ordersCreated = 0;
  let spoolsUpdated = 0;

  for (const order of batchOrders) {
    // Find or create shop
    let shopId: string | null = null;
    if (order.shopName?.trim()) {
      let shop = await db.query.shops.findFirst({
        where: eq(shops.name, order.shopName.trim()),
      });
      if (!shop) {
        [shop] = await db.insert(shops).values({ name: order.shopName.trim() }).returning();
      }
      shopId = shop.id;
    }

    // Calculate total cost
    const totalCost = order.items.reduce(
      (sum, item) => sum + (item.unitPrice || 0) * item.quantity,
      0,
    );

    // Create order with status "delivered" (historical)
    const [createdOrder] = await db
      .insert(orders)
      .values({
        shopId,
        orderNumber: order.orderNumber?.trim() || null,
        orderDate: order.orderedAt,
        status: "delivered",
        actualDelivery: order.orderedAt,
        totalCost: totalCost > 0 ? totalCost : null,
        currency: "EUR",
      })
      .returning();

    // Create order items and update spool purchase prices
    for (const item of order.items) {
      if (!item.filamentId) continue;

      if (item.spoolIds.length <= 1) {
        // Single spool (or none) — one order item, optionally linked directly
        await db.insert(orderItems).values({
          orderId: createdOrder.id,
          filamentId: item.filamentId,
          quantity: item.quantity,
          unitPrice: item.unitPrice > 0 ? item.unitPrice : null,
          spoolId: item.spoolIds[0] ?? null,
        });

        if (item.spoolIds[0]) {
          await db.update(spools)
            .set({
              purchasePrice: item.unitPrice > 0 ? item.unitPrice : null,
              purchaseDate: order.orderedAt,
              updatedAt: new Date(),
            })
            .where(eq(spools.id, item.spoolIds[0]));
          spoolsUpdated++;
        }
      } else {
        // Multiple spools — create one order item per spool for direct linkage
        for (const spoolId of item.spoolIds) {
          await db.insert(orderItems).values({
            orderId: createdOrder.id,
            filamentId: item.filamentId,
            quantity: 1,
            unitPrice: item.unitPrice > 0 ? item.unitPrice : null,
            spoolId,
          });

          await db.update(spools)
            .set({
              purchasePrice: item.unitPrice > 0 ? item.unitPrice : null,
              purchaseDate: order.orderedAt,
              updatedAt: new Date(),
            })
            .where(eq(spools.id, spoolId));
          spoolsUpdated++;
        }
      }
    }

    ordersCreated++;
  }

  revalidatePath("/admin");
  revalidatePath("/orders");
  revalidatePath("/spools");
  revalidatePath("/");

  return { ordersCreated, spoolsUpdated };
}

export async function clearStaleRunningPrints() {
  const result = await db.update(prints)
    .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(prints.status, "running"))
    .returning();
  revalidatePath("/admin");
  revalidatePath("/prints");
  revalidatePath("/");
  return result.length;
}

export async function purgeAllCaches() {
  revalidatePath("/");
  revalidatePath("/spools");
  revalidatePath("/inventory");
  revalidatePath("/orders");
  revalidatePath("/prints");
  revalidatePath("/history");
  revalidatePath("/admin");
  return true;
}
