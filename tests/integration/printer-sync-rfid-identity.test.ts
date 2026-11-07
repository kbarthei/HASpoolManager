/**
 * printer-sync — RFID identity guarantees.
 *
 * Reproduces the live 2026-11-07 incident: one untagged "PLA Matte Charcoal
 * Black" spool was bound to three AMS slots at once (Bone White Matte, Black
 * Matte, Red Silk+) because unknown RFID tags fell through to fuzzy matching.
 *
 * Invariants under test:
 *  - A real RFID tag resolves to the spool mapped to that tag, or (if unknown)
 *    learns onto a strictly-matching untagged spool, or auto-creates a spool.
 *    It never fuzzy-binds a spool of a different colour / product.
 *  - A spool is bound to at most one slot.
 *  - A stale wrong binding heals on the next sync.
 *  - An RFID-identified spool that is archived/empty is reactivated with the
 *    printer's remain% as its weight (the tag proves it's physically loaded).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));
vi.mock("@/lib/ha-notifications", () => ({
  sendHaPersistentNotification: vi.fn().mockResolvedValue(true),
  dismissHaPersistentNotification: vi.fn().mockResolvedValue(true),
}));

let printerId: string;
let bambuVendorId: string;

async function sync(overrides: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/events/printer-sync/route");
  const res = await POST(
    makePostRequest("/api/v1/events/printer-sync", {
      printer_id: printerId,
      print_state: "idle",
      ...overrides,
    }),
  );
  expect(res.status).toBe(200);
}

function trayFields(key: string, t: { type: string; color: string; idx: string; tag: string; remain: number }) {
  return {
    [`${key}_type`]: t.type,
    [`${key}_color`]: t.color,
    [`${key}_filament_id`]: t.idx,
    [`${key}_tag`]: t.tag,
    [`${key}_remain`]: t.remain,
    [`${key}_empty`]: false,
  };
}

async function slotSpoolId(amsIndex: number, trayIndex: number): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const { amsSlots } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const slot = await db.query.amsSlots.findFirst({
    where: and(
      eq(amsSlots.printerId, printerId),
      eq(amsSlots.amsIndex, amsIndex),
      eq(amsSlots.trayIndex, trayIndex),
    ),
  });
  return slot?.spoolId ?? null;
}

async function tagOwner(tagUid: string): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const { tagMappings } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const m = await db.query.tagMappings.findFirst({ where: eq(tagMappings.tagUid, tagUid) });
  return m?.spoolId ?? null;
}

describe("printer-sync RFID identity", () => {
  beforeAll(async () => {
    await setupTestDb();
    const { makePrinter, makeVendor, makeAmsSlot, seedStandardH2SAmsUnits } = await import(
      "../fixtures/seed"
    );
    printerId = await makePrinter({ name: "H2S" });
    await seedStandardH2SAmsUnits(printerId);
    for (let i = 0; i < 4; i++) {
      await makeAmsSlot(printerId, { slotType: "ams", amsIndex: 0, trayIndex: i });
    }
    await makeAmsSlot(printerId, { slotType: "ams_ht", amsIndex: 1, trayIndex: 0 });
    bambuVendorId = await makeVendor("Bambu Lab");
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots, prints, spools } = await import("@/lib/db/schema");
    await db.delete(prints);
    await db.update(amsSlots).set({
      spoolId: null,
      bambuColor: null,
      bambuType: null,
      bambuTagUid: null,
      bambuTrayIdx: null,
      isEmpty: true,
    });
    await db.delete(spools);
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("K1: heals one spool bound to three slots — learns the right tag, auto-creates the rest", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots, spools } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { makeFilament, makeSpool } = await import("../fixtures/seed");

    const charcoal = await makeFilament(bambuVendorId, {
      name: "PLA Matte",
      material: "PLA",
      colorHex: "1C1C1C",
      bambuIdx: "GFA01",
    });
    const blackSpool = await makeSpool(charcoal, {
      location: "ams",
      remainingWeight: 550,
      initialWeight: 1000,
    });

    // Stale state: the same untagged spool is bound to slots 0, 1 and 3,
    // with the slots' bambu_* already reflecting the current trays (so swap
    // detection does NOT fire — the binding is simply wrong).
    const stale = [
      { tray: 0, color: "CBC6B8FF", type: "PLA" },
      { tray: 1, color: "000000FF", type: "PLA" },
      { tray: 3, color: "D02727FF", type: "PLA" },
    ];
    for (const s of stale) {
      const all = await db.query.amsSlots.findMany({ where: eq(amsSlots.printerId, printerId) });
      const slot = all.find((x) => x.amsIndex === 0 && x.trayIndex === s.tray)!;
      await db
        .update(amsSlots)
        .set({ spoolId: blackSpool, bambuColor: s.color, bambuType: s.type, isEmpty: false })
        .where(eq(amsSlots.id, slot.id));
    }

    await sync({
      ...trayFields("slot_ams_0_0", { type: "PLA", color: "CBC6B8FF", idx: "GFA01", tag: "7D3E7B3600000100", remain: 53 }),
      ...trayFields("slot_ams_0_1", { type: "PLA", color: "000000FF", idx: "GFA01", tag: "B676E2C900000100", remain: 55 }),
      ...trayFields("slot_ams_0_3", { type: "PLA", color: "D02727FF", idx: "GFA06", tag: "A73D127C00000100", remain: 91 }),
    });

    const s0 = await slotSpoolId(0, 0);
    const s1 = await slotSpoolId(0, 1);
    const s3 = await slotSpoolId(0, 3);

    // Black Matte learned its tag onto the existing spool
    expect(s1).toBe(blackSpool);
    expect(await tagOwner("B676E2C900000100")).toBe(blackSpool);

    // Bone White + Silk+ Red got fresh auto-created spools with their tags
    expect(s0).not.toBeNull();
    expect(s3).not.toBeNull();
    expect(s0).not.toBe(blackSpool);
    expect(s3).not.toBe(blackSpool);
    expect(s0).not.toBe(s3);
    expect(await tagOwner("7D3E7B3600000100")).toBe(s0);
    expect(await tagOwner("A73D127C00000100")).toBe(s3);

    // The black spool still lives in the AMS (it was NOT moved to workbench
    // just because it was unbound from slots 0 and 3)
    const black = await db.query.spools.findFirst({ where: eq(spools.id, blackSpool) });
    expect(black!.location).toBe("ams");

    // Second sync is stable: no new spools, same bindings
    const countBefore = (await db.query.spools.findMany()).length;
    await sync({
      ...trayFields("slot_ams_0_0", { type: "PLA", color: "CBC6B8FF", idx: "GFA01", tag: "7D3E7B3600000100", remain: 53 }),
      ...trayFields("slot_ams_0_1", { type: "PLA", color: "000000FF", idx: "GFA01", tag: "B676E2C900000100", remain: 55 }),
      ...trayFields("slot_ams_0_3", { type: "PLA", color: "D02727FF", idx: "GFA06", tag: "A73D127C00000100", remain: 91 }),
    });
    expect((await db.query.spools.findMany()).length).toBe(countBefore);
    expect(await slotSpoolId(0, 0)).toBe(s0);
    expect(await slotSpoolId(0, 1)).toBe(blackSpool);
    expect(await slotSpoolId(0, 3)).toBe(s3);
  });

  it("K2: unknown tag never binds a spool that already carries a different tag", async () => {
    const { makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");
    const fil = await makeFilament(bambuVendorId, {
      name: "PLA Matte",
      material: "PLA",
      colorHex: "000000",
      bambuIdx: "GFA01",
    });
    const tagged = await makeSpool(fil, { location: "storage" });
    await makeTagMapping(tagged, "AAAA111100000100");

    await sync(
      trayFields("slot_ams_0_0", { type: "PLA", color: "000000FF", idx: "GFA01", tag: "BBBB222200000100", remain: 80 }),
    );

    const bound = await slotSpoolId(0, 0);
    expect(bound).not.toBeNull();
    expect(bound).not.toBe(tagged);
    expect(await tagOwner("BBBB222200000100")).toBe(bound);
    expect(await tagOwner("AAAA111100000100")).toBe(tagged);
  });

  it("K3: unknown tag learns onto a strictly-matching untagged rack spool instead of duplicating", async () => {
    const { db } = await import("@/lib/db");
    const { spools } = await import("@/lib/db/schema");
    const { makeFilament, makeSpool } = await import("../fixtures/seed");
    const fil = await makeFilament(bambuVendorId, {
      name: "PETG HF",
      material: "PETG",
      colorHex: "ADB1B2",
      bambuIdx: "GFG02",
    });
    const rackSpool = await makeSpool(fil, { location: "rack:r1:1-1" });

    await sync(
      trayFields("slot_ams_0_2", { type: "PETG", color: "ADB1B2FF", idx: "GFG02", tag: "CCCC333300000100", remain: 100 }),
    );

    expect(await slotSpoolId(0, 2)).toBe(rackSpool);
    expect(await tagOwner("CCCC333300000100")).toBe(rackSpool);
    expect((await db.query.spools.findMany()).length).toBe(1);
  });

  it("K4: unknown tag with only a different-colour candidate auto-creates instead", async () => {
    const { makeFilament, makeSpool } = await import("../fixtures/seed");
    const fil = await makeFilament(bambuVendorId, {
      name: "PLA Matte",
      material: "PLA",
      colorHex: "FFFFFF",
      bambuIdx: "GFA01",
    });
    const ivory = await makeSpool(fil, { location: "rack:r1:2-3" });

    await sync(
      trayFields("slot_ams_0_0", { type: "PLA", color: "CBC6B8FF", idx: "GFA01", tag: "DDDD444400000100", remain: 53 }),
    );

    const bound = await slotSpoolId(0, 0);
    expect(bound).not.toBe(ivory);
    expect(await tagOwner("DDDD444400000100")).toBe(bound);
  });

  it("K5: RFID-identified archived/empty spool is reactivated with weight from remain%", async () => {
    const { db } = await import("@/lib/db");
    const { spools } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

    const absFil = await makeFilament(bambuVendorId, { name: "ABS", material: "ABS", colorHex: "000000" });
    const abs = await makeSpool(absFil, { status: "empty", remainingWeight: 0, location: "ams-ht" });
    await makeTagMapping(abs, "765746EA00000100");

    const petgFil = await makeFilament(bambuVendorId, {
      name: "PETG HF Gray",
      material: "PETG",
      colorHex: "ADB1B2",
      bambuIdx: "GFG02",
    });
    const petg = await makeSpool(petgFil, { status: "archived", remainingWeight: 470, location: "archive" });
    await makeTagMapping(petg, "D7C546ED00000100");

    await sync({
      ...trayFields("slot_ht_1", { type: "ABS", color: "000000FF", idx: "GFB00", tag: "765746EA00000100", remain: 97 }),
      ...trayFields("slot_ams_0_2", { type: "PETG", color: "ADB1B2FF", idx: "GFG02", tag: "D7C546ED00000100", remain: 43 }),
    });

    const absRow = await db.query.spools.findFirst({ where: eq(spools.id, abs) });
    expect(absRow!.status).toBe("active");
    expect(absRow!.remainingWeight).toBe(970);
    expect(absRow!.location).toBe("ams-ht");

    const petgRow = await db.query.spools.findFirst({ where: eq(spools.id, petg) });
    expect(petgRow!.status).toBe("active");
    expect(petgRow!.remainingWeight).toBe(430);
    expect(petgRow!.location).toBe("ams");
  });

  it("K7: auto-created Bambu spool takes its filament name from the HA tray name", async () => {
    const { db } = await import("@/lib/db");
    const { spools } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    await sync({
      ...trayFields("slot_ams_0_3", { type: "PLA", color: "2850E0FF", idx: "GFA06", tag: "EEEE555500000100", remain: 91 }),
      slot_ams_0_3_name: "Bambu PLA Silk+",
    });

    const spoolId = await slotSpoolId(0, 3);
    const spool = await db.query.spools.findFirst({
      where: eq(spools.id, spoolId!),
      with: { filament: true },
    });
    expect(spool!.filament.name).toBe("PLA Silk+");
    expect(spool!.filament.bambuIdx).toBe("GFA06");
  });

  it("K8: a full rack spool wrongly bound to the slot is NOT learned onto a tray at 55%", async () => {
    // Live 2026-11-07: old fuzzy code bound full rack spool eecc102c to the
    // black-Matte slot. Learning must not cement that: weight 1000 g ≠ 55 %.
    const { db } = await import("@/lib/db");
    const { amsSlots, spools } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { makeFilament, makeSpool } = await import("../fixtures/seed");

    const fil = await makeFilament(bambuVendorId, {
      name: "PLA Matte K8",
      material: "PLA",
      colorHex: "1C1C1C",
      bambuIdx: "GFA01",
    });
    const rackA = await makeSpool(fil, { location: "ams", remainingWeight: 1000 });
    const rackB = await makeSpool(fil, { location: "rack:r1:2-9", remainingWeight: 1000 });
    const all = await db.query.amsSlots.findMany({ where: eq(amsSlots.printerId, printerId) });
    const slot1 = all.find((x) => x.amsIndex === 0 && x.trayIndex === 1)!;
    await db
      .update(amsSlots)
      .set({ spoolId: rackA, bambuColor: "000000FF", bambuType: "PLA", isEmpty: false })
      .where(eq(amsSlots.id, slot1.id));

    await sync(
      trayFields("slot_ams_0_1", { type: "PLA", color: "000000FF", idx: "GFA01", tag: "FFFF666600000100", remain: 55 }),
    );

    const bound = await slotSpoolId(0, 1);
    expect(bound).not.toBe(rackA);
    expect(bound).not.toBe(rackB);
    expect(await tagOwner("FFFF666600000100")).toBe(bound);

    const b = await db.query.spools.findFirst({ where: eq(spools.id, rackB) });
    expect(b!.location).toBe("rack:r1:2-9");
    expect(b!.remainingWeight).toBe(1000);
    const a = await db.query.spools.findFirst({ where: eq(spools.id, rackA) });
    expect(a!.remainingWeight).toBe(1000);
  });

  it("K6: fuzzy (no-RFID) matching never binds a spool already bound to another slot", async () => {
    const { db } = await import("@/lib/db");
    const { amsSlots } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { makeFilament, makeSpool } = await import("../fixtures/seed");

    const fil = await makeFilament(bambuVendorId, { name: "PLA Basic", material: "PLA", colorHex: "FF0000" });
    const red = await makeSpool(fil, { location: "ams" });
    const all = await db.query.amsSlots.findMany({ where: eq(amsSlots.printerId, printerId) });
    const slot0 = all.find((x) => x.amsIndex === 0 && x.trayIndex === 0)!;
    await db
      .update(amsSlots)
      .set({ spoolId: red, bambuColor: "FF0000FF", bambuType: "PLA", isEmpty: false })
      .where(eq(amsSlots.id, slot0.id));

    // Slot 2 gets an untagged red PLA too — must not steal the slot-0 spool
    await sync({
      ...trayFields("slot_ams_0_0", { type: "PLA", color: "FF0000FF", idx: "", tag: "0000000000000000", remain: -1 }),
      ...trayFields("slot_ams_0_1", { type: "PLA", color: "FF0000FF", idx: "", tag: "0000000000000000", remain: -1 }),
    });

    expect(await slotSpoolId(0, 0)).toBe(red);
    const s1 = await slotSpoolId(0, 1);
    expect(s1).not.toBeNull();
    expect(s1).not.toBe(red);
  });
});
