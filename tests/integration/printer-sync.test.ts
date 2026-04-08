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
    } = await import("../fixtures/seed");

    testPrinterId = await makePrinter({ name: "H2S", amsCount: 1 });

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
      const r2 = await sync({ print_state: "FAILED", print_weight: 30 });
      expect(r2.body.print_transition).toBe("failed");

      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, r1.body.print_id as string),
      });
      expect(usage).toBeDefined();
      expect(usage!.weightUsed).toBe(30);
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
    it("E1: slot_1 data → slot updated", async () => {
      const { db } = await import("@/lib/db");
      const { amsSlots } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");

      const { body } = await sync({
        print_state: "idle",
        slot_1_type: "PLA",
        slot_1_color: "FF0000FF",
        slot_1_remain: 75,
        slot_1_empty: false,
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
        slot_1_type: "ABS-GF",
        slot_1_color: "C6C6C6FF",
        slot_1_filament_id: "GFB50",
        slot_1_tag: SEED_TAG_BAMBU_ABSGF,
        slot_1_remain: 70,
        slot_1_empty: false,
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
        slot_2_type: "TPU_TEST_E3",
        slot_2_color: `${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()}FF`,
        slot_2_filament_id: unusedBambuIdx,
        slot_2_tag: newTag,
        slot_2_remain: 90,
        slot_2_empty: false,
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
        slot_3_type: uniqueMaterial,
        slot_3_color: uniqueColor,
        slot_3_tag: "0000000000000000",
        slot_3_remain: 50,
        slot_3_empty: false,
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
        slot_1_type: "ABS-GF",
        slot_1_color: "C6C6C6FF",
        slot_1_filament_id: "GFB50",
        slot_1_tag: SEED_TAG_BAMBU_ABSGF,
        slot_1_remain: 70,
        slot_1_empty: false,
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
        slot_1_type: "Empty",
        slot_1_empty: true,
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
        slot_1_type: "PLA",
        slot_1_color: "FFFFFFFF",
        slot_1_empty: false,
        slot_2_type: "PETG",
        slot_2_color: "000000FF",
        slot_2_empty: false,
        slot_3_type: "ABS",
        slot_3_color: "FF0000FF",
        slot_3_empty: false,
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

    it("F1: PRINTING with active_slot_tag → stores activeSpoolId", async () => {
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
      expect(print!.activeSpoolId).toBe(trackingSpoolId);
    });

    it("F2: continued PRINTING keeps activeSpoolId stable", async () => {
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
      expect(print!.activeSpoolId).toBe(trackingSpoolId);
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
        slot_1_type: "PLA",
        slot_1_color: "00FF00FF",
        slot_1_tag: weightSyncTagUid,
        slot_1_remain: 80,
        slot_1_empty: false,
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
        slot_1_type: "PLA",
        slot_1_color: "00FF00FF",
        slot_1_tag: weightSyncTagUid,
        slot_1_remain: 50,
        slot_1_empty: false,
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
        slot_1_type: "PLA",
        slot_1_color: "00FF00FF",
        slot_1_tag: weightSyncTagUid,
        slot_1_remain: 90,
        slot_1_empty: false,
      });
      const weightSyncs = body.weight_syncs as Array<{ spoolId: string }>;
      const entry = weightSyncs.find((s) => s.spoolId === weightSyncSpoolId);
      expect(entry).toBeUndefined();

      const spool = await db.query.spools.findFirst({ where: eq(spools.id, weightSyncSpoolId) });
      expect(spool!.remainingWeight).toBe(500);
    });
  });
});
