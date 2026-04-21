/**
 * Diagnostics queries — verify each issue detector flags the expected
 * entities and leaves clean entities alone. Exercises lib/diagnostics.ts
 * directly against the per-worker SQLite harness.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb } from "@/tests/harness/sqlite-db";
import { db } from "@/lib/db";
import {
  spools,
  amsSlots,
  prints,
  orders,
  syncLog,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  makeVendor,
  makeFilament,
  makeSpool,
  makePrinter,
  makeAmsSlot,
  makeOrder,
} from "@/tests/fixtures/seed";
import {
  getSpoolDrift,
  getSpoolStale,
  getSpoolZeroActive,
  getPrintStuck,
  getPrintNoWeight,
  getPrintNoUsage,
  getOrderStuck,
  getSyncErrors,
} from "@/lib/diagnostics";

beforeAll(async () => {
  await setupTestDb();
});

describe("getSpoolDrift", () => {
  it("flags spools in AMS slots where DB% and RFID% differ by >10pp", async () => {
    const v = await makeVendor("DriftVendor");
    const f = await makeFilament(v, { name: "DriftFil" });
    const driftSpool = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 200, // 20%
    });
    const cleanSpool = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 850, // 85%
    });
    const printerId = await makePrinter({ name: "DriftPrinter" });
    // Drift slot: RFID says 90%, DB says 20% → 70pp drift
    const driftSlot = await makeAmsSlot(printerId, {
      amsIndex: 0,
      trayIndex: 0,
      spoolId: driftSpool,
    });
    await db
      .update(amsSlots)
      .set({ bambuRemain: 90 })
      .where(eq(amsSlots.id, driftSlot));
    // Clean slot: RFID says 90%, DB says 85% → 5pp drift (ok)
    const cleanSlot = await makeAmsSlot(printerId, {
      amsIndex: 0,
      trayIndex: 1,
      spoolId: cleanSpool,
    });
    await db
      .update(amsSlots)
      .set({ bambuRemain: 90 })
      .where(eq(amsSlots.id, cleanSlot));

    const result = await getSpoolDrift();
    const flaggedIds = result.rows.map((r) => r.spoolId);
    expect(flaggedIds).toContain(driftSpool);
    expect(flaggedIds).not.toContain(cleanSpool);
  });
});

describe("getSpoolStale", () => {
  it("flags active spools with last_used_at > 90 days ago", async () => {
    const v = await makeVendor("StaleVendor");
    const f = await makeFilament(v, { name: "StaleFil" });
    const staleSpool = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 500,
    });
    const freshSpool = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 500,
    });
    // 120 days ago
    await db
      .update(spools)
      .set({ lastUsedAt: new Date(Date.now() - 120 * 86400 * 1000) })
      .where(eq(spools.id, staleSpool));
    // 30 days ago
    await db
      .update(spools)
      .set({ lastUsedAt: new Date(Date.now() - 30 * 86400 * 1000) })
      .where(eq(spools.id, freshSpool));

    const result = await getSpoolStale();
    const ids = result.rows.map((r) => r.spoolId);
    expect(ids).toContain(staleSpool);
    expect(ids).not.toContain(freshSpool);
  });
});

describe("getSpoolZeroActive", () => {
  it("flags spools where status='active' but remainingWeight<=0", async () => {
    const v = await makeVendor("ZeroVendor");
    const f = await makeFilament(v, { name: "ZeroFil" });
    const zeroActive = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 0,
      status: "active",
    });
    const zeroArchived = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 0,
      status: "empty",
    });
    const liveSpool = await makeSpool(f, {
      initialWeight: 1000,
      remainingWeight: 500,
      status: "active",
    });

    const result = await getSpoolZeroActive();
    const ids = result.rows.map((r) => r.spoolId);
    expect(ids).toContain(zeroActive);
    expect(ids).not.toContain(zeroArchived);
    expect(ids).not.toContain(liveSpool);
  });
});

describe("getPrintStuck", () => {
  it("flags prints with status='running' and updated_at > 24h ago", async () => {
    const printerId = await makePrinter({ name: "StuckPrinter" });
    const stuckDate = new Date(Date.now() - 30 * 3600 * 1000);
    const [stuckPrint] = await db
      .insert(prints)
      .values({
        printerId,
        name: "test-stuck-print",
        status: "running",
        updatedAt: stuckDate,
      })
      .returning({ id: prints.id });
    const [freshPrint] = await db
      .insert(prints)
      .values({
        printerId,
        name: "test-fresh-print",
        status: "running",
      })
      .returning({ id: prints.id });

    const result = await getPrintStuck();
    const ids = result.rows.map((r) => r.printId);
    expect(ids).toContain(stuckPrint.id);
    expect(ids).not.toContain(freshPrint.id);
  });
});

describe("getPrintNoWeight", () => {
  it("flags finished prints in last 30d with null printWeight", async () => {
    const printerId = await makePrinter({ name: "NoWeightPrinter" });
    const recent = new Date(Date.now() - 2 * 86400 * 1000);
    const [missing] = await db
      .insert(prints)
      .values({
        printerId,
        name: "test-no-weight",
        status: "finished",
        finishedAt: recent,
        printWeight: null,
      })
      .returning({ id: prints.id });
    const [ok] = await db
      .insert(prints)
      .values({
        printerId,
        name: "test-with-weight",
        status: "finished",
        finishedAt: recent,
        printWeight: 42.5,
      })
      .returning({ id: prints.id });

    const result = await getPrintNoWeight();
    const ids = result.rows.map((r) => r.printId);
    expect(ids).toContain(missing.id);
    expect(ids).not.toContain(ok.id);
  });
});

describe("getPrintNoUsage", () => {
  it("flags finished prints in last 30d with no print_usage rows", async () => {
    const printerId = await makePrinter({ name: "NoUsagePrinter" });
    const recent = new Date(Date.now() - 2 * 86400 * 1000);
    const [orphan] = await db
      .insert(prints)
      .values({
        printerId,
        name: "test-no-usage",
        status: "finished",
        finishedAt: recent,
      })
      .returning({ id: prints.id });

    const result = await getPrintNoUsage();
    const ids = result.rows.map((r) => r.printId);
    expect(ids).toContain(orphan.id);
  });
});

describe("getOrderStuck", () => {
  it("flags orders in 'ordered' status for >30 days", async () => {
    const oldDate = new Date(Date.now() - 45 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const stuck = await makeOrder({
      orderNumber: "TEST-STUCK-ORDER",
      orderDate: oldDate,
      status: "ordered",
    });
    const fresh = await makeOrder({
      orderNumber: "TEST-FRESH-ORDER",
      status: "ordered",
    });
    const delivered = await makeOrder({
      orderNumber: "TEST-DELIVERED-ORDER",
      orderDate: oldDate,
      status: "delivered",
    });

    const result = await getOrderStuck();
    const ids = result.rows.map((r) => r.orderId);
    expect(ids).toContain(stuck);
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(delivered);

    // Cleanup so order count stays bounded
    await db.delete(orders).where(eq(orders.id, stuck));
    await db.delete(orders).where(eq(orders.id, fresh));
    await db.delete(orders).where(eq(orders.id, delivered));
  });
});

describe("getSyncErrors", () => {
  it("flags sync_log entries in last 24h with print_error=1 or offline state", async () => {
    const printerId = await makePrinter({ name: "SyncErrPrinter" });
    const [errLog] = await db
      .insert(syncLog)
      .values({
        printerId,
        rawState: "offline",
        normalizedState: "offline",
      })
      .returning({ id: syncLog.id });
    const [okLog] = await db
      .insert(syncLog)
      .values({
        printerId,
        rawState: "running",
        normalizedState: "active",
      })
      .returning({ id: syncLog.id });

    const result = await getSyncErrors();
    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(errLog.id);
    expect(ids).not.toContain(okLog.id);

    await db.delete(syncLog).where(eq(syncLog.id, errLog.id));
    await db.delete(syncLog).where(eq(syncLog.id, okLog.id));
  });
});
