"use server";

import { db } from "@/lib/db";
import { amsSlots, spools } from "@/lib/db/schema";
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
