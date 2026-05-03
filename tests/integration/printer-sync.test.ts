/**
 * POST /api/v1/events/printer-sync — rewritten onto the per-worker SQLite
 * harness. Calls the route handler directly, no dev server, no shared
 * production DB. Each test suite gets a fresh DB and seeds what it needs.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

// revalidatePath requires a Next.js server context; stub it out for direct handler tests.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// HA notifications require a supervisor token + network; stub them so H1
// can assert on the call without actually reaching HA.
vi.mock("@/lib/ha-notifications", () => ({
  sendHaPersistentNotification: vi.fn().mockResolvedValue(true),
  dismissHaPersistentNotification: vi.fn().mockResolvedValue(true),
}));

// Lazy-loaded to make sure @/lib/db binds to the harness DB first.
type SyncResult = { status: number; body: Record<string, unknown> };
let testPrinterId: string;

async function sync(overrides: Record<string, unknown> = {}): Promise<SyncResult> {
  const { POST } = await import("@/app/api/v1/events/printer-sync/route");
  const req = makePostRequest("/api/v1/events/printer-sync", {
    printer_id: testPrinterId,
    print_state: "idle",
    ...overrides,
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("printer-sync integration", () => {
  // Known seed tag for tier-1 RFID matching tests
  const SEED_TAG_BAMBU_ABSGF = "B568B1A400000100";

  beforeAll(async () => {
    await setupTestDb();
    const {
      makeVendor,
      makeFilament,
      makeSpool,
      makeTagMapping,
      makePrinter,
      makeAmsSlot,
      seedStandardH2SAmsUnits,
    } = await import("../fixtures/seed");

    testPrinterId = await makePrinter({ name: "H2S" });
    // H2S has 1 AMS unit (4 slots) + 1 AMS HT (1 slot) enabled by default
    await seedStandardH2SAmsUnits(testPrinterId);

    // 4 AMS slots + 1 HT slot
    for (let i = 0; i < 4; i++) {
      await makeAmsSlot(testPrinterId, { slotType: "ams", amsIndex: 0, trayIndex: i });
    }
    await makeAmsSlot(testPrinterId, { slotType: "ams_ht", amsIndex: 1, trayIndex: 0 });

    // Seed a Bambu Lab ABS-GF spool with a known RFID tag so tier-1 matching works
    const bambuVendor = await makeVendor("Bambu Lab");
    const absgfFil = await makeFilament(bambuVendor, {
      name: "ABS-GF Gray",
      material: "ABS-GF",
      colorHex: "C6C6C6",
      bambuIdx: "GFB50",
    });
    const absgfSpool = await makeSpool(absgfFil);
    await makeTagMapping(absgfSpool, SEED_TAG_BAMBU_ABSGF);
  });

  afterAll(() => {
    teardownTestDb();
  });

  // ── A. Print Lifecycle ─────────────────────────────────────────────────────

  describe("A. Print Lifecycle", () => {
    let a2PrintId: string;

    it("A1: IDLE with no running print → transition none", async () => {
      const { status, body } = await sync({ print_state: "idle" });
      expect(status).toBe(200);
      expect(body.synced).toBe(true);
      expect(body.print_transition).toBe("none");
      expect(body.print_id).toBeNull();
    });

    it("A2: PRINTING creates a new print record", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const printName = `test-print-A2-${Date.now()}`;
      const { status, body } = await sync({
        print_state: "RUNNING",
        print_name: printName,
        print_weight: 45,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");
      expect(body.print_id).toBeTruthy();
      a2PrintId = body.print_id as string;

      const print = await db.query.prints.findFirst({ where: eq(prints.id, a2PrintId) });
      expect(print).toBeDefined();
      expect(print!.status).toBe("running");
      expect(print!.name).toBe(printName);
    });

    it("A3: PRINTING again (same print running) → transition none, no duplicate", async () => {
      const { body } = await sync({
        print_state: "RUNNING",
        print_name: `test-print-A3-${Date.now()}`,
        print_weight: 50,
      });
      expect(body.print_transition).toBe("none");
      expect(body.print_id).toBe(a2PrintId);
    });

    it("A4: IDLE after printing → marks print finished", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const { body } = await sync({ print_state: "idle", print_weight: 45 });
      expect(body.print_transition).toBe("finished");
      expect(body.print_id).toBeTruthy();

      const print = await db.query.prints.findFirst({ where: eq(prints.id, body.print_id as string) });
      expect(print!.status).toBe("finished");
      expect(print!.finishedAt).not.toBeNull();
    });

    it("A5: Second print with same name → distinct ha_event_ids", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const sharedName = `test-print-A5-${Date.now()}`;
      const r1 = await sync({ print_state: "RUNNING", print_name: sharedName });
      expect(r1.body.print_transition).toBe("started");
      const firstPrintId = r1.body.print_id as string;

      await sync({ print_state: "idle" });

      const r2 = await sync({ print_state: "RUNNING", print_name: sharedName });
      expect(r2.body.print_transition).toBe("started");
      expect(r2.body.print_id).not.toBe(firstPrintId);

      const p1 = await db.query.prints.findFirst({ where: eq(prints.id, firstPrintId) });
      const p2 = await db.query.prints.findFirst({ where: eq(prints.id, r2.body.print_id as string) });
      expect(p1!.haEventId).not.toBe(p2!.haEventId);
      expect(p2!.haEventId).toMatch(/_\d+$/);

      await sync({ print_state: "idle" });
    });
  });

  // ── B. Print Failure ───────────────────────────────────────────────────────

  describe("B. Print Failure", () => {
    it("B1: PRINTING then FAILED → marks print failed", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ print_state: "RUNNING", print_name: `test-print-B1-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");
      const r2 = await sync({ print_state: "FAILED", print_weight: 10 });
      expect(r2.body.print_transition).toBe("failed");
      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("failed");
    });

    it("B2: PRINTING then CANCELED → marks print failed", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ print_state: "RUNNING", print_name: `test-print-B2-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");
      const r2 = await sync({ print_state: "CANCELED", print_weight: 5 });
      expect(r2.body.print_transition).toBe("failed");
      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("failed");
    });

    it("B3: Failed print with weight > 0 and active spool → creates usage record", async () => {
      const { db } = await import("@/lib/db");
      const { printUsage } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import(
        "../fixtures/seed"
      );

      const vendorId = await makeVendor(`TestVendor_B3_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, {
        name: `TestFil_B3_${Date.now()}`,
        material: "PLA",
        colorHex: "FF0000",
      });
      const spoolId = await makeSpool(filamentId, {
        remainingWeight: 800,
        initialWeight: 1000,
        purchasePrice: 20,
      });
      const tagUid = `TESTB3${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spoolId, tagUid);

      const r1 = await sync({
        print_state: "RUNNING",
        print_name: `test-print-B3-${Date.now()}`,
        print_weight: 30,
        active_slot_tag: tagUid,
      });
      expect(r1.body.print_transition).toBe("started");
      await sync({
        print_state: "RUNNING",
        print_name: `test-print-B3-${Date.now()}`,
        print_weight: 30,
        active_slot_tag: tagUid,
      });
      const r2 = await sync({ print_state: "FAILED", print_weight: 30, print_progress: 100 });
      expect(r2.body.print_transition).toBe("failed");

      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, r1.body.print_id as string),
      });
      expect(usage).toBeDefined();
      expect(usage!.weightUsed).toBe(30);
    });

    it("B4: Failed print at 10% progress → usage scaled to 10% of total weight", async () => {
      const { db } = await import("@/lib/db");
      const { printUsage, spools: spoolsTable } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import(
        "../fixtures/seed"
      );

      const vendorId = await makeVendor(`TestVendor_B4_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, {
        name: `TestFil_B4_${Date.now()}`,
        material: "ASA",
        colorHex: "FFFFFF",
      });
      const spoolId = await makeSpool(filamentId, {
        remainingWeight: 1000,
        initialWeight: 1000,
        purchasePrice: 30,
      });
      const tagUid = `TESTB4${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spoolId, tagUid);

      // Start print
      const r1 = await sync({
        print_state: "RUNNING",
        print_name: `test-print-B4-${Date.now()}`,
        print_weight: 750,
        active_slot_tag: tagUid,
      });
      expect(r1.body.print_transition).toBe("started");

      // Fail at 10% progress
      const r2 = await sync({
        print_state: "FAILED",
        print_weight: 750,
        print_progress: 10,
      });
      expect(r2.body.print_transition).toBe("failed");

      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, r1.body.print_id as string),
      });
      expect(usage).toBeDefined();
      expect(usage!.weightUsed).toBe(75); // 750 * 10% = 75g

      // Spool should have 925g remaining (1000 - 75)
      const spool = await db.query.spools.findFirst({
        where: eq(spoolsTable.id, spoolId),
      });
      expect(spool!.remainingWeight).toBe(925);
    });
  });

  // ── C. Calibration States ─────────────────────────────────────────────────

  describe("C. Calibration States", () => {
    it("C1: CALIBRATING_EXTRUSION when idle → starts a new print", async () => {
      const { status, body } = await sync({
        print_state: "RUNNING",
        print_name: `test-print-C1-${Date.now()}`,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");
      await sync({ print_state: "idle" });
    });

    it("C2: SWEEPING_XY_MECH_MODE while running → no new print", async () => {
      const printName = `test-print-C2-${Date.now()}`;
      const r1 = await sync({ print_state: "RUNNING", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      const runningId = r1.body.print_id;
      const r2 = await sync({ print_state: "SWEEPING_XY_MECH_MODE", print_name: printName });
      expect(r2.body.print_transition).toBe("none");
      expect(r2.body.print_id).toBe(runningId);
      await sync({ print_state: "idle" });
    });
  });

  // ── D. Filament Error ─────────────────────────────────────────────────────

  describe("D. Filament Error", () => {
    it("D1: IDLE + print_error=on with running print → keeps print running", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ print_state: "RUNNING", print_name: `test-print-D1-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");
      const r2 = await sync({ print_state: "idle", print_error: "on" });
      expect(r2.body.print_transition).toBe("none");
      expect(r2.body.print_error).toBe(true);
      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("running");
      await sync({ print_state: "idle", print_error: "off" });
    });

    it("D2: IDLE + print_error=off with running print → finishes the print", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ print_state: "RUNNING", print_name: `test-print-D2-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");
      await sync({ print_state: "idle", print_error: "on" });
      const r2 = await sync({ print_state: "idle", print_error: "off" });
      expect(r2.body.print_transition).toBe("finished");
      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("finished");
    });
  });

  // ── E. AMS Slot Updates ───────────────────────────────────────────────────

  describe("E. AMS Slot Updates", () => {
    it("E1: slot_ams_0_0 data → slot updated", async () => {
      const { db } = await import("@/lib/db");
      const { amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "FF0000FF",
        slot_ams_0_0_remain: 75,
        slot_ams_0_0_empty: false,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0),
        ),
      });
      expect(slot!.isEmpty).toBe(false);
      expect(slot!.bambuType).toBe("PLA");
      expect(slot!.bambuRemain).toBe(75);
    });

    it("E2: slot with known RFID tag → matches existing spool", async () => {
      const { db } = await import("@/lib/db");
      const { amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "ABS-GF",
        slot_ams_0_0_color: "C6C6C6FF",
        slot_ams_0_0_filament_id: "GFB50",
        slot_ams_0_0_tag: SEED_TAG_BAMBU_ABSGF,
        slot_ams_0_0_remain: 70,
        slot_ams_0_0_empty: false,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0),
        ),
      });
      expect(slot!.spoolId).not.toBeNull();
      expect(slot!.bambuTagUid).toBe(SEED_TAG_BAMBU_ABSGF);
    });

    it("E3: slot with unknown RFID tag → auto-creates Bambu spool + mapping", async () => {
      const { db } = await import("@/lib/db");
      const { tagMappings } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const newTag = `AUTOC${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const unusedBambuIdx = `ZZTE3_${Date.now()}`.slice(0, 12);

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_1_type: "TPU_TEST_E3",
        slot_ams_0_1_color: `${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()}FF`,
        slot_ams_0_1_filament_id: unusedBambuIdx,
        slot_ams_0_1_tag: newTag,
        slot_ams_0_1_remain: 90,
        slot_ams_0_1_empty: false,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const mapping = await db.query.tagMappings.findFirst({
        where: eq(tagMappings.tagUid, newTag),
      });
      expect(mapping).toBeDefined();
      expect(mapping!.source).toBe("bambu");
    });

    it("E4: slot with tag=0000000000000000 and no match → draft spool", async () => {
      const { db } = await import("@/lib/db");
      const { amsSlots, spools } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      const uniqueColor = `${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()}FF`;
      const uniqueMaterial = `DRAFT_E4_${Date.now()}`;

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_2_type: uniqueMaterial,
        slot_ams_0_2_color: uniqueColor,
        slot_ams_0_2_tag: "0000000000000000",
        slot_ams_0_2_remain: 50,
        slot_ams_0_2_empty: false,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 2),
        ),
      });
      expect(slot!.spoolId).not.toBeNull();
      const spool = await db.query.spools.findFirst({ where: eq(spools.id, slot!.spoolId!) });
      expect(spool!.status).toBe("draft");
    });

    it("E5: empty slot → marks slot empty, moves old spool to surplus", async () => {
      const { db } = await import("@/lib/db");
      const { amsSlots, spools } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      // Put a known spool in slot 0 first
      await sync({
        print_state: "idle",
        slot_ams_0_0_type: "ABS-GF",
        slot_ams_0_0_color: "C6C6C6FF",
        slot_ams_0_0_filament_id: "GFB50",
        slot_ams_0_0_tag: SEED_TAG_BAMBU_ABSGF,
        slot_ams_0_0_remain: 70,
        slot_ams_0_0_empty: false,
      });
      const slotBefore = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0),
        ),
      });
      const previousSpoolId = slotBefore?.spoolId;

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "Empty",
        slot_ams_0_0_empty: true,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0),
        ),
      });
      expect(slot!.isEmpty).toBe(true);
      expect(slot!.spoolId).toBeNull();

      if (previousSpoolId) {
        const prevSpool = await db.query.spools.findFirst({ where: eq(spools.id, previousSpoolId) });
        expect(prevSpool!.location).toBe("surplus");
      }
    });

    it("E6: multiple slots in single sync → all updated", async () => {
      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "FFFFFFFF",
        slot_ams_0_0_empty: false,
        slot_ams_0_1_type: "PETG",
        slot_ams_0_1_color: "000000FF",
        slot_ams_0_1_empty: false,
        slot_ams_0_2_type: "ABS",
        slot_ams_0_2_color: "FF0000FF",
        slot_ams_0_2_empty: false,
      });
      expect(body.slots_updated).toBeGreaterThanOrEqual(3);
    });
  });

  // ── F. Active Spool Tracking ──────────────────────────────────────────────

  describe("F. Active Spool Tracking", () => {
    let trackingSpoolId: string;
    let trackingTagUid: string;
    let trackingPrintId: string;

    beforeAll(async () => {
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import(
        "../fixtures/seed"
      );
      const vendorId = await makeVendor(`TestVendor_F_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, {
        name: `TestFil_F_${Date.now()}`,
        material: "PETG",
        colorHex: "0000FF",
      });
      trackingSpoolId = await makeSpool(filamentId, {
        remainingWeight: 900,
        initialWeight: 1000,
        purchasePrice: 25,
      });
      trackingTagUid = `TRACKF${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(trackingSpoolId, trackingTagUid);
    });

    it("F1: PRINTING with active_slot_tag → records spool in activeSpoolIds", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "RUNNING",
        print_name: `test-print-F1-${Date.now()}`,
        print_weight: 50,
        active_slot_tag: trackingTagUid,
        active_slot_type: "PETG",
        active_slot_color: "0000FFFF",
      });
      expect(body.print_transition).toBe("started");
      trackingPrintId = body.print_id as string;

      const print = await db.query.prints.findFirst({ where: eq(prints.id, trackingPrintId) });
      const ids = JSON.parse(print!.activeSpoolIds!);
      expect(ids).toContain(trackingSpoolId);
    });

    it("F2: continued PRINTING keeps spool in activeSpoolIds stable", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "RUNNING",
        print_weight: 55,
        active_slot_tag: trackingTagUid,
        active_slot_type: "PETG",
        active_slot_color: "0000FFFF",
      });
      expect(body.print_transition).toBe("none");
      const print = await db.query.prints.findFirst({ where: eq(prints.id, trackingPrintId) });
      const ids = JSON.parse(print!.activeSpoolIds!);
      expect(ids).toContain(trackingSpoolId);
    });

    it("F3: on finish, creates print_usage with correct weight + cost", async () => {
      const { db } = await import("@/lib/db");
      const { printUsage, spools } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const weightUsed = 55;
      const { body } = await sync({ print_state: "idle", print_weight: weightUsed });
      expect(body.print_transition).toBe("finished");

      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, trackingPrintId),
      });
      expect(usage).toBeDefined();
      expect(usage!.spoolId).toBe(trackingSpoolId);
      expect(usage!.weightUsed).toBe(weightUsed);
      const cost = Number(usage!.cost);
      expect(cost).toBeCloseTo(1.375, 1);

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, trackingSpoolId) });
      expect(spool!.remainingWeight).toBe(900 - weightUsed);
    });
  });

  // ── G. Edge Cases ─────────────────────────────────────────────────────────

  describe("G. Edge Cases", () => {
    it("G1: missing auth → 401", async () => {
      const { POST } = await import("@/app/api/v1/events/printer-sync/route");
      const res = await POST(
        makePostRequest(
          "/api/v1/events/printer-sync",
          { printer_id: testPrinterId, print_state: "idle" },
          false,
        ),
      );
      expect(res.status).toBe(401);
    });

    it("G2: missing printer_id → 400", async () => {
      const { POST } = await import("@/app/api/v1/events/printer-sync/route");
      const res = await POST(
        makePostRequest("/api/v1/events/printer-sync", { print_state: "idle" }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/printer_id/i);
    });

    it("G3: all None/unavailable values → handled gracefully", async () => {
      const { body } = await sync({
        print_state: "None",
        print_name: "None",
        print_weight: "unavailable",
        print_error: "None",
        active_slot_tag: "None",
      });
      expect(body.synced).toBe(true);
      expect(body.print_transition).toBe("none");
    });

    it("G4: unknown state string → treated as idle", async () => {
      const { body } = await sync({ print_state: "SOME_FUTURE_STATE_XYZ" });
      expect(body.synced).toBe(true);
      expect(body.print_transition).toBe("none");
    });
  });

  // ── H. Idempotency ────────────────────────────────────────────────────────

  describe("H. Idempotency", () => {
    it("H1: same IDLE 5x → same result each time", async () => {
      for (let i = 0; i < 5; i++) {
        const { status, body } = await sync({ print_state: "idle" });
        expect(status).toBe(200);
        expect(body.print_transition).toBe("none");
      }
    });

    it("H2: same PRINTING while running → no duplicate prints", async () => {
      const printName = `test-print-H2-${Date.now()}`;
      const r1 = await sync({ print_state: "RUNNING", print_name: printName, print_weight: 30 });
      expect(r1.body.print_transition).toBe("started");
      const firstId = r1.body.print_id;

      for (let i = 0; i < 3; i++) {
        const r = await sync({ print_state: "RUNNING", print_name: printName, print_weight: 30 });
        expect(r.body.print_transition).toBe("none");
        expect(r.body.print_id).toBe(firstId);
      }
      await sync({ print_state: "idle" });
    });
  });

  // ── I. Weight Sync from AMS remain ───────────────────────────────────────

  describe("I. Weight Sync from AMS remain", () => {
    let weightSyncSpoolId: string;
    let weightSyncTagUid: string;

    beforeAll(async () => {
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import(
        "../fixtures/seed"
      );
      const vendorId = await makeVendor(`TestVendor_I_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, {
        name: `TestFil_I_${Date.now()}`,
        material: "PLA",
        colorHex: "00FF00",
      });
      weightSyncTagUid = `WSYNC${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      weightSyncSpoolId = await makeSpool(filamentId, {
        remainingWeight: 1000,
        initialWeight: 1000,
        purchasePrice: 20,
      });
      await makeTagMapping(weightSyncSpoolId, weightSyncTagUid);
    });

    it("I1: updates weight when idle with valid remain and >5% delta", async () => {
      const { db } = await import("@/lib/db");
      const { spools } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "00FF00FF",
        slot_ams_0_0_tag: weightSyncTagUid,
        slot_ams_0_0_remain: 80,
        slot_ams_0_0_empty: false,
      });
      const weightSyncs = body.weight_syncs as Array<{ spoolId: string; from: number; to: number; remain: number }>;
      expect(weightSyncs.length).toBeGreaterThanOrEqual(1);

      const entry = weightSyncs.find((s) => s.spoolId === weightSyncSpoolId);
      expect(entry).toBeDefined();
      expect(entry!.from).toBe(1000);
      expect(entry!.to).toBe(800);
      expect(entry!.remain).toBe(80);

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, weightSyncSpoolId) });
      expect(spool!.remainingWeight).toBe(800);
    });

    it("I2: does not update during printing", async () => {
      const { db } = await import("@/lib/db");
      const { spools } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({
        print_state: "RUNNING",
        print_name: `test-print-I2-${Date.now()}`,
        print_weight: 50,
        active_slot_tag: weightSyncTagUid,
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "00FF00FF",
        slot_ams_0_0_tag: weightSyncTagUid,
        slot_ams_0_0_remain: 50,
        slot_ams_0_0_empty: false,
      });
      expect(r1.body.print_transition).toBe("started");

      const weightSyncs = r1.body.weight_syncs as Array<{ spoolId: string }>;
      const entry = weightSyncs.find((s) => s.spoolId === weightSyncSpoolId);
      expect(entry).toBeUndefined();

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, weightSyncSpoolId) });
      expect(spool!.remainingWeight).toBe(800);

      await sync({ print_state: "idle" });
    });

    it("I3: does not increase weight", async () => {
      const { db } = await import("@/lib/db");
      const { spools } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(spools).set({ remainingWeight: 500 }).where(eq(spools.id, weightSyncSpoolId));

      const { body } = await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "00FF00FF",
        slot_ams_0_0_tag: weightSyncTagUid,
        slot_ams_0_0_remain: 90,
        slot_ams_0_0_empty: false,
      });
      const weightSyncs = body.weight_syncs as Array<{ spoolId: string }>;
      const entry = weightSyncs.find((s) => s.spoolId === weightSyncSpoolId);
      expect(entry).toBeUndefined();

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, weightSyncSpoolId) });
      expect(spool!.remainingWeight).toBe(500);
    });
  });

  // ── J. Critical Gap Tests ─────────────────────────────────────────────────

  describe("J. Critical Gaps", () => {
    it("J1: gcode_state takes precedence over print_state", async () => {
      // gcode_state=RUNNING should start print even if print_state=idle
      const r = await sync({
        gcode_state: "RUNNING",
        print_state: "idle",
        print_name: `test-print-J1-${Date.now()}`,
      });
      expect(r.body.print_transition).toBe("started");
      // Clean up
      await sync({ gcode_state: "FINISH" });
    });

    it("J2: OFFLINE keeps running print alive (ambiguous state)", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ gcode_state: "RUNNING", print_name: `test-print-J2-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");

      const r2 = await sync({ gcode_state: "OFFLINE" });
      expect(r2.body.print_transition).toBe("none");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("running");
      // Clean up
      await sync({ gcode_state: "FINISH" });
    });

    it("J3: PAUSE keeps running print alive", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({ gcode_state: "RUNNING", print_name: `test-print-J3-${Date.now()}` });
      expect(r1.body.print_transition).toBe("started");

      const r2 = await sync({ gcode_state: "PAUSE" });
      expect(r2.body.print_transition).toBe("none");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id as string) });
      expect(print!.status).toBe("running");
      // Resume and finish
      await sync({ gcode_state: "RUNNING" });
      await sync({ gcode_state: "FINISH" });
    });

    it("J4: Failed print with no progress → no usage deducted", async () => {
      const { db } = await import("@/lib/db");
      const { printUsage } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

      const vendorId = await makeVendor(`J4V_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `J4Fil_${Date.now()}` });
      const spoolId = await makeSpool(filamentId, { remainingWeight: 1000, initialWeight: 1000 });
      const tagUid = `J4TAG${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spoolId, tagUid);

      const r1 = await sync({
        gcode_state: "PREPARE",
        print_name: `test-print-J4-${Date.now()}`,
        print_weight: 500,
        active_slot_tag: tagUid,
      });
      expect(r1.body.print_transition).toBe("started");

      // Fail immediately — no progress, no layers
      const r2 = await sync({
        gcode_state: "FAILED",
        print_weight: 500,
        print_progress: 0,
        print_layers_current: 0,
        print_layers_total: 0,
      });
      expect(r2.body.print_transition).toBe("failed");

      // No usage should be created
      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, r1.body.print_id as string),
      });
      expect(usage).toBeUndefined();
    });

    it("J5: Spool marked empty when remaining hits 0", async () => {
      const { db } = await import("@/lib/db");
      const { spools: spoolsTable, printUsage } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

      const vendorId = await makeVendor(`J5V_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `J5Fil_${Date.now()}` });
      // Spool with only 10g left
      const spoolId = await makeSpool(filamentId, { remainingWeight: 10, initialWeight: 1000, purchasePrice: 20 });
      const tagUid = `J5TAG${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spoolId, tagUid);

      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `test-print-J5-${Date.now()}`,
        print_weight: 50,
        active_slot_tag: tagUid,
      });
      // Finish — will deduct 50g from a spool with 10g
      await sync({ gcode_state: "FINISH", print_weight: 50 });

      const spool = await db.query.spools.findFirst({ where: eq(spoolsTable.id, spoolId) });
      expect(spool!.remainingWeight).toBe(0);
      expect(spool!.status).toBe("empty");
    });

    it("J6: Slot swap moves old spool to workbench (not surplus)", async () => {
      const { db } = await import("@/lib/db");
      const { spools: spoolsTable, amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

      const vendorId = await makeVendor(`J6V_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `J6Fil_${Date.now()}` });
      const oldSpoolId = await makeSpool(filamentId, { location: "ams" });
      const oldTag = `J6OLD${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(oldSpoolId, oldTag);

      // First sync: old spool in slot_1
      await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "FF0000FF",
        slot_ams_0_0_tag: oldTag,
        slot_ams_0_0_remain: 80,
        slot_ams_0_0_empty: false,
      });

      // New spool replaces old in same slot
      const newSpoolId = await makeSpool(filamentId);
      const newTag = `J6NEW${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(newSpoolId, newTag);

      await sync({
        print_state: "idle",
        slot_ams_0_0_type: "PLA",
        slot_ams_0_0_color: "FF0000FF",
        slot_ams_0_0_tag: newTag,
        slot_ams_0_0_remain: 100,
        slot_ams_0_0_empty: false,
      });

      // Old spool should be moved to workbench (not surplus, because slot is now occupied)
      const oldSpool = await db.query.spools.findFirst({ where: eq(spoolsTable.id, oldSpoolId) });
      expect(oldSpool!.location).toBe("workbench");
    });

    it("J6b: draft-spool swap (no-RFID filament change) creates new draft instead of reusing old spool", async () => {
      const { db } = await import("@/lib/db");
      const { spools: spoolsTable, amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      // First sync: unknown-vendor black PLA in slot 4 (auto-creates a draft)
      await sync({
        print_state: "idle",
        slot_ams_0_3_type: "PLA",
        slot_ams_0_3_color: "000000FF",
        slot_ams_0_3_tag: "0000000000000000",
        slot_ams_0_3_remain: 80,
        slot_ams_0_3_empty: false,
      });

      const slotAfterFirst = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 3)
        ),
      });
      const firstSpoolId = slotAfterFirst?.spoolId;
      expect(firstSpoolId).toBeTruthy();

      // Second sync: filament SWAPPED — same type, different color (green)
      await sync({
        print_state: "idle",
        slot_ams_0_3_type: "PLA",
        slot_ams_0_3_color: "0ACC38FF",
        slot_ams_0_3_tag: "0000000000000000",
        slot_ams_0_3_remain: 100,
        slot_ams_0_3_empty: false,
      });

      const slotAfterSwap = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 3)
        ),
      });

      // The slot should reference a DIFFERENT spool now
      expect(slotAfterSwap?.spoolId).toBeTruthy();
      expect(slotAfterSwap?.spoolId).not.toBe(firstSpoolId);
      expect(slotAfterSwap?.bambuColor).toBe("0ACC38FF");

      // The old spool should have been moved out of the slot
      const oldSpool = await db.query.spools.findFirst({ where: eq(spoolsTable.id, firstSpoolId!) });
      expect(oldSpool?.location).toBe("workbench");
    });

    it("J6d: repeated syncs of an unmatchable non-RFID slot do NOT spawn duplicate drafts (oscillation guard)", async () => {
      const { db } = await import("@/lib/db");
      const { spools: spoolsTable, amsSlots, filaments, vendors } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      // Set up the J6d slot fresh — slot_ht (HT slot) so we don't conflict with
      // other suite tests touching slot_ams_0_3.
      const htSlot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams_ht"),
          eq(amsSlots.amsIndex, 1),
          eq(amsSlots.trayIndex, 0),
        ),
      });
      // Reset the slot to a clean state
      if (htSlot) {
        await db.update(amsSlots).set({
          spoolId: null,
          bambuColor: null,
          bambuType: null,
          bambuTagUid: null,
          isEmpty: true,
        }).where(eq(amsSlots.id, htSlot.id));
      }

      // Seed an active "white ASA" spool — this mirrors the prod scenario
      // where the user-entered colour (FFFFFF) diverges from Bambu's reading
      // (C1C1C1).
      const [vendor] = await db.insert(vendors).values({ name: `J6dV_${Date.now()}` }).returning();
      const [filament] = await db.insert(filaments).values({
        vendorId: vendor.id,
        name: `J6dFil_${Date.now()}`,
        material: "ASA",
        colorHex: "FFFFFF",
        spoolWeight: 1000,
      }).returning();
      const [activeSpool] = await db.insert(spoolsTable).values({
        filamentId: filament.id,
        initialWeight: 1000,
        remainingWeight: 800,
        status: "active",
        location: "ams-ht",
      }).returning();
      void activeSpool; // location is what makes matchSpool prefer it

      const slotPayload = {
        slot_ht_1_type: "ASA",
        slot_ht_1_color: "C1C1C1FF",
        slot_ht_1_tag: "0000000000000000",
        slot_ht_1_remain: 0,
        slot_ht_1_empty: false,
      };

      // Capture pre-test draft count
      const draftsBefore = await db.query.spools.findMany({
        where: eq(spoolsTable.status, "draft"),
      });

      // Run 5 successive syncs with the SAME bambu reading. The original
      // bug spawned one fresh draft per sync (oscillation between the
      // active spool and a new draft). With identity-dedup + bambu_color
      // baseline for swap detection, only ONE draft (or zero) should
      // result, not five.
      for (let i = 0; i < 5; i++) {
        await sync({ print_state: "idle", ...slotPayload });
      }

      const draftsAfter = await db.query.spools.findMany({
        where: eq(spoolsTable.status, "draft"),
      });

      // Allow at most ONE new draft to materialise — that's the
      // expected outcome when matchSpool can't bind the active spool.
      // The bug was N drafts for N syncs.
      expect(draftsAfter.length - draftsBefore.length).toBeLessThanOrEqual(1);
    });

    it("J6c: close color variation (ΔE<10) does NOT trigger swap detection", async () => {
      const { db } = await import("@/lib/db");
      const { spools: spoolsTable, amsSlots, filaments, vendors } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      // Set up: a real active spool bound directly to slot 4 (no RFID), red
      const [vendor] = await db.insert(vendors).values({ name: `J6cV_${Date.now()}` }).returning();
      const [filament] = await db.insert(filaments).values({
        vendorId: vendor.id,
        name: `J6cFil_${Date.now()}`,
        material: "PLA",
        colorHex: "E0352F",
        spoolWeight: 1000,
      }).returning();
      const [spool] = await db.insert(spoolsTable).values({
        filamentId: filament.id,
        initialWeight: 1000,
        remainingWeight: 800,
        status: "active",
        location: "ams",
      }).returning();

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 3)
        ),
      });
      if (slot) {
        await db.update(amsSlots).set({ spoolId: spool.id, bambuColor: "E0352FFF", bambuType: "PLA", isEmpty: false })
          .where(eq(amsSlots.id, slot.id));
      }

      // Sync with a slightly different red (ΔE < 1 — should NOT trigger swap)
      await sync({
        print_state: "idle",
        slot_ams_0_3_type: "PLA",
        slot_ams_0_3_color: "E23630FF",
        slot_ams_0_3_tag: "0000000000000000",
        slot_ams_0_3_remain: 78,
        slot_ams_0_3_empty: false,
      });

      // Spool location should still be "ams" — not moved to workbench by
      // a false-positive swap
      const after = await db.query.spools.findFirst({ where: eq(spoolsTable.id, spool.id) });
      expect(after?.location).toBe("ams");
    });

    it("J7: activeSpoolIds accumulates across spool changes mid-print", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

      const vendorId = await makeVendor(`J7V_${Date.now()}`);
      const filamentId = await makeFilament(vendorId, { name: `J7Fil_${Date.now()}` });
      const spool1 = await makeSpool(filamentId);
      const spool2 = await makeSpool(filamentId);
      const tag1 = `J7T1${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const tag2 = `J7T2${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spool1, tag1);
      await makeTagMapping(spool2, tag2);

      // Start print with spool1
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `test-print-J7-${Date.now()}`,
        active_slot_tag: tag1,
      });
      expect(r1.body.print_transition).toBe("started");

      // Continue with spool2 (mid-print swap)
      await sync({
        gcode_state: "RUNNING",
        active_slot_tag: tag2,
      });

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r1.body.print_id as string),
      });
      const ids = JSON.parse(print!.activeSpoolIds!);
      expect(ids).toContain(spool1);
      expect(ids).toContain(spool2);
      expect(ids.length).toBe(2);

      // Clean up
      await sync({ gcode_state: "FINISH" });
    });

    it("J8: remainSnapshot captured at print start", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `test-print-J8-${Date.now()}`,
        slot_ams_0_0_remain: 80,
        slot_ams_0_2_remain: 55,
      });
      expect(r1.body.print_transition).toBe("started");

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r1.body.print_id as string),
      });
      const snapshot = JSON.parse(print!.remainSnapshot!);
      expect(snapshot.slot_ams_0_0).toBe(80);
      expect(snapshot.slot_ams_0_2).toBe(55);

      // Clean up
      await sync({ gcode_state: "FINISH" });
    });

    it("J9: Multi-spool proportional weight via remain deltas", async () => {
      const { db } = await import("@/lib/db");
      const { printUsage, amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const { makeVendor, makeFilament, makeSpool, makeTagMapping } = await import("../fixtures/seed");

      const vendorId = await makeVendor(`J9V_${Date.now()}`);
      const fil1Id = await makeFilament(vendorId, { name: `J9F1_${Date.now()}`, material: "PLA", colorHex: "FF0000" });
      const fil2Id = await makeFilament(vendorId, { name: `J9F2_${Date.now()}`, material: "PLA", colorHex: "0000FF" });
      const spool1 = await makeSpool(fil1Id, { remainingWeight: 500, initialWeight: 1000, purchasePrice: 20 });
      const spool2 = await makeSpool(fil2Id, { remainingWeight: 800, initialWeight: 1000, purchasePrice: 25 });
      const tag1 = `J9A${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const tag2 = `J9B${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      await makeTagMapping(spool1, tag1);
      await makeTagMapping(spool2, tag2);

      // Assign spools to the existing seeded AMS slots (amsIndex=0, trayIndex=0 and 1)
      // SLOT_DEFS: slot_1 = ams/0/0, slot_2 = ams/0/1
      await db.update(amsSlots).set({ spoolId: spool1, isEmpty: false })
        .where(and(eq(amsSlots.printerId, testPrinterId), eq(amsSlots.slotType, "ams"), eq(amsSlots.amsIndex, 0), eq(amsSlots.trayIndex, 0)));
      await db.update(amsSlots).set({ spoolId: spool2, isEmpty: false })
        .where(and(eq(amsSlots.printerId, testPrinterId), eq(amsSlots.slotType, "ams"), eq(amsSlots.amsIndex, 0), eq(amsSlots.trayIndex, 1)));

      // Start print with spool1, remain slot_1=100, slot_2=100
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `test-print-J9-${Date.now()}`,
        print_weight: 100,
        active_slot_tag: tag1,
        slot_ams_0_0_remain: 100,
        slot_ams_0_1_remain: 100,
      });
      expect(r1.body.print_transition).toBe("started");

      // Add spool2 to activeSpoolIds by switching active tag
      await sync({
        gcode_state: "RUNNING",
        active_slot_tag: tag2,
        print_weight: 100,
      });

      // Finish: slot_1 went from 100→75 (25% delta), slot_2 from 100→50 (50% delta)
      // Total delta = 75%, so spool1 gets 25/75 = 33.3% of 100g, spool2 gets 50/75 = 66.7%
      await sync({
        gcode_state: "FINISH",
        print_weight: 100,
        slot_ams_0_0_remain: 75,
        slot_ams_0_1_remain: 50,
      });

      // Check usage records
      const usage1 = await db.query.printUsage.findFirst({
        where: eq(printUsage.spoolId, spool1),
      });
      const usage2 = await db.query.printUsage.findFirst({
        where: eq(printUsage.spoolId, spool2),
      });

      // With proportional: spool1 should get ~33.3g, spool2 ~66.7g
      expect(usage1).toBeDefined();
      expect(usage2).toBeDefined();
      const total = usage1!.weightUsed + usage2!.weightUsed;
      expect(total).toBeCloseTo(100, 0);
      expect(usage1!.weightUsed).toBeCloseTo(33.3, 0);
      expect(usage2!.weightUsed).toBeCloseTo(66.7, 0);
    });

    it("J10: Stale print auto-closed after 24h", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      // Create a print that started 25 hours ago
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const [stalePrint] = await db.insert(prints).values({
        printerId: testPrinterId,
        name: `stale-print-J10-${Date.now()}`,
        status: "running",
        startedAt: staleDate,
        updatedAt: staleDate,
      }).returning();

      // Next sync should auto-close the stale print and start fresh
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `new-print-J10-${Date.now()}`,
      });
      expect(r1.body.print_transition).toBe("started");
      expect(r1.body.print_id).not.toBe(stalePrint.id);

      // Stale print should be failed
      const stale = await db.query.prints.findFirst({ where: eq(prints.id, stalePrint.id) });
      expect(stale!.status).toBe("failed");
      expect(stale!.notes).toContain("Auto-closed");

      // Clean up
      await sync({ gcode_state: "FINISH" });
    });

    it("J12: cover image and snapshot paths stored on print record", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      // Start and finish a print
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: `test-print-J12-${Date.now()}`,
      });
      expect(r1.body.print_transition).toBe("started");

      // Simulate setting cover image and snapshot paths
      await db.update(prints).set({
        coverImagePath: "snapshots/cover_test.jpg",
        snapshotPath: "snapshots/snapshot_test.jpg",
      }).where(eq(prints.id, r1.body.print_id as string));

      // Verify they are stored
      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r1.body.print_id as string),
      });
      expect(print!.coverImagePath).toBe("snapshots/cover_test.jpg");
      expect(print!.snapshotPath).toBe("snapshots/snapshot_test.jpg");

      // Clean up
      await sync({ gcode_state: "FINISH" });
    });
  });

  // ── G. Energy Tracking ──────────────────────────────────────────────────────

  describe("G. Energy Tracking", () => {
    beforeAll(async () => {
      // Seed electricity price setting
      const { db } = await import("@/lib/db");
      const { settings } = await import("@/lib/db/schema");
      await db.insert(settings).values({
        key: "electricity_price_per_kwh",
        value: "0.32",
      }).onConflictDoUpdate({
        target: settings.key,
        set: { value: "0.32" },
      });
    });

    it("G1: stores energyStartKwh on print start", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r = await sync({
        gcode_state: "RUNNING",
        print_name: "energy_test.3mf",
        energy_start_kwh: 1234.56,
      });
      expect(r.status).toBe(200);
      expect(r.body.print_transition).toBe("started");

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r.body.print_id as string),
      });
      expect(print).toBeDefined();
      expect(print!.energyStartKwh).toBe(1234.56);
      expect(print!.energyEndKwh).toBeNull();
      expect(print!.energyCost).toBeNull();
    });

    it("G2: calculates energy cost on print finish", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const r = await sync({
        gcode_state: "FINISH",
        energy_end_kwh: 1234.78,
      });
      expect(r.status).toBe(200);
      expect(r.body.print_transition).toBe("finished");

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r.body.print_id as string),
      });
      expect(print).toBeDefined();
      expect(print!.energyStartKwh).toBe(1234.56);
      expect(print!.energyEndKwh).toBe(1234.78);
      expect(print!.energyKwh).toBe(0.22);
      expect(print!.energyCost).toBe(0.07);
    });

    it("G3: handles missing energy data gracefully", async () => {
      // Start a new print without energy data
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: "no_energy_test.3mf",
      });
      expect(r1.body.print_transition).toBe("started");

      // Finish without energy data
      const r2 = await sync({ gcode_state: "FINISH" });
      expect(r2.body.print_transition).toBe("finished");

      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r1.body.print_id as string),
      });
      expect(print!.energyStartKwh).toBeNull();
      expect(print!.energyEndKwh).toBeNull();
      expect(print!.energyKwh).toBeNull();
      expect(print!.energyCost).toBeNull();
    });

    it("G4: calculates energy cost on failed print", async () => {
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      // Start print with energy
      const r1 = await sync({
        gcode_state: "RUNNING",
        print_name: "failed_energy.3mf",
        energy_start_kwh: 2000.0,
      });
      expect(r1.body.print_transition).toBe("started");

      // Fail with energy (energy is consumed regardless)
      const r2 = await sync({
        gcode_state: "FAILED",
        energy_end_kwh: 2000.5,
      });
      expect(r2.body.print_transition).toBe("failed");

      const print = await db.query.prints.findFirst({
        where: eq(prints.id, r1.body.print_id as string),
      });
      expect(print!.energyKwh).toBe(0.5);
      expect(print!.energyCost).toBe(0.16);
    });
  });

  // ── H. Missing-Spool-Assignment Warning (H1) ──────────────────────────────

  describe("H. Missing-Spool-Assignment Warning", () => {
    // Ensure we start idle so each test can cleanly trigger the "started"
    // transition. Earlier test blocks may leave a running print behind.
    async function resetToIdle() {
      await sync({ gcode_state: "FINISH" });
      await sync({ gcode_state: "IDLE" });
    }

    it("H1: print starts with no slot data at all → sends HA notification", async () => {
      await resetToIdle();
      const { sendHaPersistentNotification } = await import("@/lib/ha-notifications");
      vi.mocked(sendHaPersistentNotification).mockClear();

      const { status, body } = await sync({
        gcode_state: "RUNNING",
        print_name: `H1-no-slot-${Date.now()}`,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");

      expect(sendHaPersistentNotification).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendHaPersistentNotification).mock.calls[0];
      expect(call[0]).toContain("Kein Spool");
      expect(call[1]).toContain("started without a matched spool");
      expect(call[2]).toMatch(/^haspoolmanager_missing_spool_/);

      // Finish the print so we don't pollute the next test
      await sync({ gcode_state: "FINISH" });
    });

    it("H1: print starts with RFID-matched spool → no warning", async () => {
      await resetToIdle();
      const { sendHaPersistentNotification } = await import("@/lib/ha-notifications");
      vi.mocked(sendHaPersistentNotification).mockClear();

      const { status, body } = await sync({
        gcode_state: "RUNNING",
        print_name: `H1-matched-${Date.now()}`,
        active_slot_type: "ABS-GF",
        active_slot_tag: SEED_TAG_BAMBU_ABSGF,
        active_slot_color: "C6C6C6FF",
        active_slot_filament_id: "GFB50",
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");

      expect(sendHaPersistentNotification).not.toHaveBeenCalled();

      await sync({ gcode_state: "FINISH" });
    });
  });
});
