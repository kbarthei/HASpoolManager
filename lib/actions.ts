"use server";

import { db } from "@/lib/db";
import { amsSlots, spools, shops, orders, orderItems, filaments, vendors, shoppingListItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
      totalCost: totalCost > 0 ? String(totalCost) : null,
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

    // Create order item
    await db.insert(orderItems).values({
      orderId: order.id,
      filamentId,
      quantity: item.quantity,
      unitPrice: item.price ? String(item.price) : null,
    });

    // Create one spool per quantity unit
    for (let i = 0; i < item.quantity; i++) {
      await db.insert(spools).values({
        filamentId,
        initialWeight: item.weight || 1000,
        remainingWeight: item.weight || 1000,
        purchasePrice: item.price ? String(item.price) : null,
        currency: item.currency || "EUR",
        purchaseDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
        location: "ordered",
        status: "active",
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
