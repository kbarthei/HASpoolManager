/**
 * Integration tests for linkSpoolToOrderItem and mergeSpools server actions.
 * Uses the per-worker SQLite harness.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

describe("spool manage actions", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe("linkSpoolToOrderItem", () => {
    it("links spool to order item and transfers purchase price", async () => {
      const { db } = await import("@/lib/db");
      const { spools, orderItems } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeOrder, makeOrderItem } =
        await import("../fixtures/seed");
      const { linkSpoolToOrderItem } = await import("@/lib/actions");

      const vendorId = await makeVendor(`LinkV_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `LinkFil_${Date.now()}` });
      const spoolId = await makeSpool(filamentId, { purchasePrice: undefined });
      const orderId = await makeOrder();
      const itemId = await makeOrderItem(orderId, filamentId, { unitPrice: 34.95 });

      await linkSpoolToOrderItem(spoolId, itemId);

      const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, itemId) });
      expect(item!.spoolId).toBe(spoolId);

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
      expect(spool!.purchasePrice).toBe(34.95);
    });

    it("unlinks previous spool when re-linking order item", async () => {
      const { db } = await import("@/lib/db");
      const { orderItems } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeOrder, makeOrderItem } =
        await import("../fixtures/seed");
      const { linkSpoolToOrderItem } = await import("@/lib/actions");

      const vendorId = await makeVendor(`RelinkV_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `RelinkFil_${Date.now()}` });
      const oldSpoolId = await makeSpool(filamentId);
      const newSpoolId = await makeSpool(filamentId);
      const orderId = await makeOrder();
      const itemId = await makeOrderItem(orderId, filamentId, {
        spoolId: oldSpoolId,
        unitPrice: 20,
      });

      await linkSpoolToOrderItem(newSpoolId, itemId);

      const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, itemId) });
      expect(item!.spoolId).toBe(newSpoolId);
    });

    it("does not overwrite existing purchase price", async () => {
      const { db } = await import("@/lib/db");
      const { spools } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeOrder, makeOrderItem } =
        await import("../fixtures/seed");
      const { linkSpoolToOrderItem } = await import("@/lib/actions");

      const vendorId = await makeVendor(`KeepPriceV_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `KeepPriceFil_${Date.now()}` });
      const spoolId = await makeSpool(filamentId, { purchasePrice: 25.0 });
      const orderId = await makeOrder();
      const itemId = await makeOrderItem(orderId, filamentId, { unitPrice: 34.95 });

      await linkSpoolToOrderItem(spoolId, itemId);

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
      expect(spool!.purchasePrice).toBe(25.0); // not overwritten
    });
  });

  describe("mergeSpools", () => {
    it("transfers usage, tags, order items and deletes source", async () => {
      const { db } = await import("@/lib/db");
      const { spools, printUsage, tagMappings, orderItems } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const {
        makeVendor, makeFilament, makeSpool, makeTagMapping,
        makePrinter, makeOrder, makeOrderItem,
      } = await import("../fixtures/seed");
      const { mergeSpools } = await import("@/lib/actions");

      const vendorId = await makeVendor(`MergeV_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `MergeFil_${Date.now()}` });

      // Target spool: in AMS, no price, has usage
      const targetId = await makeSpool(filamentId, { location: "ams", purchasePrice: undefined });

      // Source spool: from order, has price, has tag
      const sourceId = await makeSpool(filamentId, { purchasePrice: 34.95 });
      const tagUid = `MERGE${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(sourceId, tagUid);
      const orderId = await makeOrder();
      await makeOrderItem(orderId, filamentId, { spoolId: sourceId, unitPrice: 34.95 });

      // Add a print usage to source
      const printerId = await makePrinter();
      const { prints } = await import("@/lib/db/schema");
      const [print] = await db.insert(prints).values({
        printerId,
        name: "merge-test-print",
        status: "finished",
        startedAt: new Date(),
      }).returning();
      await db.insert(printUsage).values({
        printId: print.id,
        spoolId: sourceId,
        weightUsed: 50,
        cost: 1.75,
      });

      await mergeSpools(targetId, sourceId);

      // Source should be deleted
      const source = await db.query.spools.findFirst({ where: eq(spools.id, sourceId) });
      expect(source).toBeUndefined();

      // Target should have the price
      const target = await db.query.spools.findFirst({ where: eq(spools.id, targetId) });
      expect(target!.purchasePrice).toBe(34.95);

      // Usage moved to target
      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, print.id),
      });
      expect(usage!.spoolId).toBe(targetId);

      // Tag moved to target
      const tag = await db.query.tagMappings.findFirst({
        where: eq(tagMappings.tagUid, tagUid),
      });
      expect(tag!.spoolId).toBe(targetId);

      // Order item moved to target
      const items = await db.query.orderItems.findMany({
        where: eq(orderItems.spoolId, targetId),
      });
      expect(items.length).toBe(1);
    });

    it("rejects merging spool with itself", async () => {
      const { makeVendor, makeFilament, makeSpool } = await import("../fixtures/seed");
      const { mergeSpools } = await import("@/lib/actions");

      const vendorId = await makeVendor(`SelfMergeV_${Date.now()}`);
      const filamentId = await makeFilament(vendorId);
      const spoolId = await makeSpool(filamentId);

      await expect(mergeSpools(spoolId, spoolId)).rejects.toThrow("Cannot merge spool with itself");
    });
  });
});
