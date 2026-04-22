/**
 * Multi-AMS printer sync — dedicated tests for SLOT_DEFS dynamism.
 * Verifies that the sync route correctly handles printers with 0/1/2
 * AMS units, honors the enabled flag, and maps payload keys per
 * amsIndex.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

async function sync(printerId: string, overrides: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/v1/events/printer-sync/route");
  const req = makePostRequest("/api/v1/events/printer-sync", {
    printer_id: printerId,
    print_state: "idle",
    ...overrides,
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("printer-sync with multiple AMS units", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("creates slot rows for both AMS units on sync", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { makePrinter, makeAmsUnit } = await import("../fixtures/seed");

    const printerId = await makePrinter({ name: "H2S-MultiAMS-1" });
    await makeAmsUnit(printerId, { amsIndex: 0, slotType: "ams", displayName: "AMS 1" });
    await makeAmsUnit(printerId, { amsIndex: 2, slotType: "ams", displayName: "AMS 2" });

    const r = await sync(printerId, {
      slot_ams_0_0_type: "PLA",
      slot_ams_0_0_color: "FFFFFFFF",
      slot_ams_0_0_empty: false,
      slot_ams_2_3_type: "PETG",
      slot_ams_2_3_color: "FF0000FF",
      slot_ams_2_3_empty: false,
    });
    expect(r.status).toBe(200);

    const slot00 = await db.query.amsSlots.findFirst({
      where: and(
        eq(amsSlots.printerId, printerId),
        eq(amsSlots.amsIndex, 0),
        eq(amsSlots.trayIndex, 0),
      ),
    });
    const slot23 = await db.query.amsSlots.findFirst({
      where: and(
        eq(amsSlots.printerId, printerId),
        eq(amsSlots.amsIndex, 2),
        eq(amsSlots.trayIndex, 3),
      ),
    });
    expect(slot00?.bambuType).toBe("PLA");
    expect(slot23?.bambuType).toBe("PETG");
  });

  it("ignores slot data for disabled AMS units", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { makePrinter, makeAmsUnit } = await import("../fixtures/seed");

    const printerId = await makePrinter({ name: "H2S-MultiAMS-2" });
    await makeAmsUnit(printerId, { amsIndex: 0, slotType: "ams", displayName: "AMS 1", enabled: true });
    await makeAmsUnit(printerId, { amsIndex: 2, slotType: "ams", displayName: "AMS 2", enabled: false });

    await sync(printerId, {
      slot_ams_0_0_type: "PLA",
      slot_ams_2_0_type: "IGNORED",
    });

    const slot00 = await db.query.amsSlots.findFirst({
      where: and(eq(amsSlots.printerId, printerId), eq(amsSlots.amsIndex, 0), eq(amsSlots.trayIndex, 0)),
    });
    const slot20 = await db.query.amsSlots.findFirst({
      where: and(eq(amsSlots.printerId, printerId), eq(amsSlots.amsIndex, 2), eq(amsSlots.trayIndex, 0)),
    });
    expect(slot00?.bambuType).toBe("PLA");
    expect(slot20).toBeUndefined();
  });

  it("handles printer with zero AMS units (external slot only)", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { makePrinter } = await import("../fixtures/seed");

    const printerId = await makePrinter({ name: "P1P-NoAMS" });
    // No AMS units registered — external slot is always present

    const r = await sync(printerId, {
      slot_ext_type: "PLA",
      slot_ext_color: "000000FF",
      slot_ext_empty: false,
    });
    expect(r.status).toBe(200);

    const slotExt = await db.query.amsSlots.findFirst({
      where: and(eq(amsSlots.printerId, printerId), eq(amsSlots.slotType, "external")),
    });
    expect(slotExt?.bambuType).toBe("PLA");
  });

  it("handles AMS HT with amsIndex 1 via slot_ht_1_* keys", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { makePrinter, makeAmsUnit } = await import("../fixtures/seed");

    const printerId = await makePrinter({ name: "H2S-HT-only" });
    await makeAmsUnit(printerId, { amsIndex: 1, slotType: "ams_ht", displayName: "AMS HT" });

    await sync(printerId, {
      slot_ht_1_type: "PC",
      slot_ht_1_empty: false,
    });

    const slotHt = await db.query.amsSlots.findFirst({
      where: and(eq(amsSlots.printerId, printerId), eq(amsSlots.slotType, "ams_ht")),
    });
    expect(slotHt?.bambuType).toBe("PC");
    expect(slotHt?.amsIndex).toBe(1);
  });
});
