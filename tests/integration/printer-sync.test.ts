/**
 * Integration tests for POST /api/v1/events/printer-sync
 *
 * Requires:
 *   - DATABASE_URL in .env.local
 *   - `npm run dev` running on localhost:3000
 *
 * Tests hit a REAL database. All test data is cleaned up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { prints, printUsage, amsSlots, tagMappings, spools, filaments, vendors, syncLog } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { makeVendor, makeFilament, makeSpool, makeTagMapping, cleanup, cleanupStaleTestData } from "../fixtures/seed";

const BASE = "http://localhost:3000/api/v1";
const AUTH_HEADERS = {
  Authorization: `Bearer ${process.env.API_SECRET_KEY || "test-dev-key-2026"}`,
  "Content-Type": "application/json",
};

// ── Test state (IDs to clean up) ─────────────────────────────────────────────

const toClean: {
  vendors: string[];
  filaments: string[];
  spools: string[];
  prints: string[];
  tagMappings: string[];
} = { vendors: [], filaments: [], spools: [], prints: [], tagMappings: [] };

let testPrinterId: string;

// ── Helper: POST /api/v1/events/printer-sync ──────────────────────────────────

async function sync(overrides: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/events/printer-sync`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      printer_id: testPrinterId,
      print_state: "idle",
      ...overrides,
    }),
  });
  return { status: res.status, body: await res.json() };
}

// ── Collect print IDs created by sync ────────────────────────────────────────

async function getRunningPrint(): Promise<{ id: string; name: string | null; activeSpoolId: string | null } | null> {
  const result = await db.query.prints.findFirst({
    where: and(eq(prints.printerId, testPrinterId), eq(prints.status, "running")),
  });
  return result ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("printer-sync integration", () => {

  beforeAll(async () => {
    // Clean up stale test data from previous crashed runs
    await cleanupStaleTestData();

    // Fetch the real printer ID from the database
    const res = await fetch(`${BASE}/printers`, { headers: AUTH_HEADERS });
    const printers = await res.json();
    if (!printers[0]?.id) throw new Error("No printer in DB — seed the database first");
    testPrinterId = printers[0].id;

    // Guard: abort any running print left over from a previous crashed test run.
    // Without this, the first PRINTING sync would find an existing running print
    // instead of creating a new one, causing ordering-sensitive tests to fail.
    const staleRunning = await db.query.prints.findFirst({
      where: and(eq(prints.printerId, testPrinterId), eq(prints.status, "running")),
    });
    if (staleRunning) {
      await db.update(prints).set({ status: "failed", finishedAt: new Date() })
        .where(eq(prints.id, staleRunning.id));
    }
  });

  afterAll(async () => {
    // Remove ALL prints created by tests — match by name pattern and event ID pattern
    const testPrints = await db.select({ id: prints.id }).from(prints)
      .where(sql`${prints.name} LIKE 'test-%' OR ${prints.name} = 'Integration Test Print' OR ${prints.haEventId} LIKE 'test_%' OR ${prints.haEventId} LIKE 'sync_%_test-%'`);
    for (const p of testPrints) {
      await db.delete(printUsage).where(eq(printUsage.printId, p.id)).catch(() => {});
    }
    if (testPrints.length > 0) {
      await db.delete(prints)
        .where(sql`${prints.name} LIKE 'test-%' OR ${prints.name} = 'Integration Test Print' OR ${prints.haEventId} LIKE 'test_%' OR ${prints.haEventId} LIKE 'sync_%_test-%'`)
        .catch(() => {});
    }

    // Remove all test-created spools/filaments/vendors/tags
    await cleanup(toClean);

    // Clean up sync_log entries from tests
    await db.delete(syncLog)
      .where(inArray(syncLog.printerId, [testPrinterId]))
      .catch(() => {});
  });

  // ── A. Print Lifecycle ─────────────────────────────────────────────────────

  describe("A. Print Lifecycle", () => {
    it("A1: IDLE with no running print → transition none", async () => {
      const { status, body } = await sync({ print_state: "idle" });
      expect(status).toBe(200);
      expect(body.synced).toBe(true);
      expect(body.print_transition).toBe("none");
      expect(body.print_id).toBeNull();
    });

    it("A2: PRINTING creates a new print record", async () => {
      const printName = `test-print-A2-${Date.now()}`;
      const { status, body } = await sync({
        print_state: "printing",
        print_name: printName,
        print_weight: 45,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");
      expect(body.print_id).toBeTruthy();

      // Verify DB record
      const print = await db.query.prints.findFirst({ where: eq(prints.id, body.print_id) });
      expect(print).toBeDefined();
      expect(print!.status).toBe("running");
      expect(print!.name).toBe(printName);

      toClean.prints.push(body.print_id);
    });

    it("A3: PRINTING again (same print running) → transition none, no duplicate", async () => {
      // A2 left a running print; send PRINTING again
      const { status, body } = await sync({
        print_state: "printing",
        print_name: `test-print-A3-${Date.now()}`,
        print_weight: 50,
      });
      expect(status).toBe(200);
      // Should update the existing print, not create a second one
      expect(body.print_transition).toBe("none");
      // print_id references the existing running print
      expect(body.print_id).toBe(toClean.prints[toClean.prints.length - 1]);
    });

    it("A4: IDLE after printing → marks print finished", async () => {
      const { status, body } = await sync({
        print_state: "idle",
        print_weight: 45,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("finished");
      expect(body.print_id).toBeTruthy();

      // DB check
      const print = await db.query.prints.findFirst({ where: eq(prints.id, body.print_id) });
      expect(print!.status).toBe("finished");
      expect(print!.finishedAt).not.toBeNull();
    });

    it("A5: Second print with same name same day → unique ha_event_id (appends _2 or higher)", async () => {
      const sharedName = `test-print-A5-${Date.now()}`;

      // First print — start + finish
      const r1 = await sync({ print_state: "printing", print_name: sharedName });
      expect(r1.body.print_transition).toBe("started");
      const firstPrintId = r1.body.print_id;
      toClean.prints.push(firstPrintId);

      await sync({ print_state: "idle" });

      // Second print with same name
      const r2 = await sync({ print_state: "printing", print_name: sharedName });
      expect(r2.body.print_transition).toBe("started");
      expect(r2.body.print_id).not.toBe(firstPrintId);
      toClean.prints.push(r2.body.print_id);

      // Verify distinct ha_event_ids
      const p1 = await db.query.prints.findFirst({ where: eq(prints.id, firstPrintId) });
      const p2 = await db.query.prints.findFirst({ where: eq(prints.id, r2.body.print_id) });
      expect(p1!.haEventId).toBeDefined();
      expect(p2!.haEventId).toBeDefined();
      expect(p1!.haEventId).not.toBe(p2!.haEventId);
      // Second one should end with _2 (or higher counter)
      expect(p2!.haEventId).toMatch(/_\d+$/);

      // Clean up: finish this second print
      await sync({ print_state: "idle" });
    });
  });

  // ── B. Print Failure ───────────────────────────────────────────────────────

  describe("B. Print Failure", () => {
    it("B1: PRINTING then FAILED → marks print failed", async () => {
      const printName = `test-print-B1-${Date.now()}`;
      const r1 = await sync({ print_state: "printing", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      toClean.prints.push(r1.body.print_id);

      const r2 = await sync({ print_state: "failed", print_weight: 10 });
      expect(r2.status).toBe(200);
      expect(r2.body.print_transition).toBe("failed");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id) });
      expect(print!.status).toBe("failed");
    });

    it("B2: PRINTING then CANCELED → marks print failed", async () => {
      const printName = `test-print-B2-${Date.now()}`;
      const r1 = await sync({ print_state: "printing", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      toClean.prints.push(r1.body.print_id);

      const r2 = await sync({ print_state: "canceled", print_weight: 5 });
      expect(r2.status).toBe(200);
      expect(r2.body.print_transition).toBe("failed");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id) });
      expect(print!.status).toBe("failed");
    });

    it("B3: Failed print with weight > 0 and active spool → creates usage record", async () => {
      // Seed a spool with a known tag so active_slot_tag can match it
      const vendorId = await makeVendor(`TestVendor_B3_${Date.now()}`);
      toClean.vendors.push(vendorId);
      const filamentId = await makeFilament(vendorId, { name: `TestFil_B3_${Date.now()}`, material: "PLA", colorHex: "FF0000" });
      toClean.filaments.push(filamentId);
      const spoolId = await makeSpool(filamentId, { remainingWeight: 800, initialWeight: 1000, purchasePrice: "20.00" });
      toClean.spools.push(spoolId);
      const tagUid = `TESTB3${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const tagMappingRecord = await makeTagMapping(spoolId, tagUid);
      toClean.tagMappings.push(tagMappingRecord);

      const printName = `test-print-B3-${Date.now()}`;
      const r1 = await sync({
        print_state: "printing",
        print_name: printName,
        print_weight: 30,
        active_slot_tag: tagUid,
      });
      expect(r1.body.print_transition).toBe("started");
      toClean.prints.push(r1.body.print_id);

      // Update active spool while running
      await sync({
        print_state: "printing",
        print_name: printName,
        print_weight: 30,
        active_slot_tag: tagUid,
      });

      const r2 = await sync({ print_state: "failed", print_weight: 30 });
      expect(r2.body.print_transition).toBe("failed");

      // Verify usage record was created
      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, r1.body.print_id),
      });
      expect(usage).toBeDefined();
      expect(usage!.weightUsed).toBe(30);
    });
  });

  // ── C. Calibration States ─────────────────────────────────────────────────

  describe("C. Calibration States", () => {
    it("C1: CALIBRATING_EXTRUSION when idle → starts a new print (active state)", async () => {
      const printName = `test-print-C1-${Date.now()}`;
      const { status, body } = await sync({
        print_state: "CALIBRATING_EXTRUSION",
        print_name: printName,
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");
      toClean.prints.push(body.print_id);

      // Clean up: finish this print
      await sync({ print_state: "idle" });
    });

    it("C2: SWEEPING_XY_MECH_MODE while print running → no new print (still active)", async () => {
      const printName = `test-print-C2-${Date.now()}`;
      const r1 = await sync({ print_state: "printing", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      const runningId = r1.body.print_id;
      toClean.prints.push(runningId);

      // Send another active state while already running
      const r2 = await sync({ print_state: "SWEEPING_XY_MECH_MODE", print_name: printName });
      expect(r2.status).toBe(200);
      expect(r2.body.print_transition).toBe("none");
      expect(r2.body.print_id).toBe(runningId);

      // Clean up
      await sync({ print_state: "idle" });
    });
  });

  // ── D. Filament Error ─────────────────────────────────────────────────────

  describe("D. Filament Error", () => {
    it("D1: IDLE + print_error=on with running print → keeps print running (NOT finished)", async () => {
      const printName = `test-print-D1-${Date.now()}`;
      const r1 = await sync({ print_state: "printing", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      toClean.prints.push(r1.body.print_id);

      // Simulate filament runout: printer reports idle + error=on (waiting for spool swap)
      const r2 = await sync({ print_state: "idle", print_error: "on" });
      expect(r2.status).toBe(200);
      expect(r2.body.print_transition).toBe("none"); // NOT finished
      expect(r2.body.print_error).toBe(true);

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id) });
      expect(print!.status).toBe("running"); // still running

      // Clean up: error cleared, print finishes
      await sync({ print_state: "idle", print_error: "off" });
    });

    it("D2: IDLE + print_error=off with running print → finishes the print", async () => {
      const printName = `test-print-D2-${Date.now()}`;
      const r1 = await sync({ print_state: "printing", print_name: printName });
      expect(r1.body.print_transition).toBe("started");
      toClean.prints.push(r1.body.print_id);

      // First, simulate error state
      await sync({ print_state: "idle", print_error: "on" });

      // Then error clears → print finishes
      const r2 = await sync({ print_state: "idle", print_error: "off" });
      expect(r2.status).toBe(200);
      expect(r2.body.print_transition).toBe("finished");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, r1.body.print_id) });
      expect(print!.status).toBe("finished");
    });
  });

  // ── E. AMS Slot Updates ───────────────────────────────────────────────────

  describe("E. AMS Slot Updates", () => {
    it("E1: Send slot_1 data → slot updated in DB", async () => {
      const { status, body } = await sync({
        print_state: "idle",
        slot_1_type: "PLA",
        slot_1_color: "FF0000FF",
        slot_1_remain: 75,
        slot_1_empty: false,
      });
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0)
        ),
      });
      expect(slot).toBeDefined();
      expect(slot!.isEmpty).toBe(false);
      expect(slot!.bambuType).toBe("PLA");
      expect(slot!.bambuRemain).toBe(75);
    });

    it("E2: Slot with known RFID tag → matches existing spool", async () => {
      // Use the known RFID tag from existing seed data
      const knownTag = "B568B1A400000100";
      const { status, body } = await sync({
        print_state: "idle",
        slot_1_type: "ABS-GF",
        slot_1_color: "C6C6C6FF",
        slot_1_filament_id: "GFB50",
        slot_1_tag: knownTag,
        slot_1_remain: 70,
        slot_1_empty: false,
      });
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0)
        ),
      });
      expect(slot!.spoolId).not.toBeNull();
      expect(slot!.bambuTagUid).toBe(knownTag);
    });

    it("E3: Slot with unknown RFID tag → auto-creates Bambu spool + tag mapping", async () => {
      // A tag that definitely doesn't exist.
      // Use a unique material + bambu_idx that won't fuzzy-match any real spool,
      // so the auto-create path is reached (matchedSpoolId remains null after matching).
      const newTag = `AUTOC${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const unusedBambuIdx = `ZZTE3_${Date.now()}`.slice(0, 12);

      const { status, body } = await sync({
        print_state: "idle",
        slot_2_type: "TPU_TEST_E3",
        slot_2_color: `${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase()}FF`,
        slot_2_filament_id: unusedBambuIdx,
        slot_2_tag: newTag,
        slot_2_remain: 90,
        slot_2_empty: false,
      });
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      // Verify the tag mapping and spool were created
      const mapping = await db.query.tagMappings.findFirst({
        where: eq(tagMappings.tagUid, newTag),
      });
      expect(mapping).toBeDefined();
      expect(mapping!.source).toBe("bambu");

      // Register for cleanup
      if (mapping) {
        toClean.spools.push(mapping.spoolId);
        // The filament was auto-created too; find it via spool
        const spool = await db.query.spools.findFirst({ where: eq(spools.id, mapping.spoolId) });
        if (spool) toClean.filaments.push(spool.filamentId);
      }
    });

    it("E4: Slot with tag=0000000000000000 and no match → creates draft spool", async () => {
      // Use a completely unique material name so fuzzy matching can't find any existing spool.
      const uniqueColor = `${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase()}FF`;
      const uniqueMaterial = `DRAFT_E4_${Date.now()}`;

      const { status, body } = await sync({
        print_state: "idle",
        slot_3_type: uniqueMaterial,
        slot_3_color: uniqueColor,
        slot_3_tag: "0000000000000000",
        slot_3_remain: 50,
        slot_3_empty: false,
      });
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 2)
        ),
      });
      expect(slot!.spoolId).not.toBeNull();

      // Verify draft status
      if (slot?.spoolId) {
        const spool = await db.query.spools.findFirst({ where: eq(spools.id, slot.spoolId) });
        expect(spool!.status).toBe("draft");
        toClean.spools.push(spool!.id);
        toClean.filaments.push(spool!.filamentId);
      }
    });

    it("E5: Empty slot → marks slot as empty, moves old spool to storage", async () => {
      // First put a known spool in slot_1
      await sync({
        print_state: "idle",
        slot_1_type: "ABS-GF",
        slot_1_color: "C6C6C6FF",
        slot_1_filament_id: "GFB50",
        slot_1_tag: "B568B1A400000100",
        slot_1_remain: 70,
        slot_1_empty: false,
      });

      const slotBefore = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0)
        ),
      });
      const previousSpoolId = slotBefore?.spoolId;

      // Now send empty slot
      const { status, body } = await sync({
        print_state: "idle",
        slot_1_type: "Empty",
        slot_1_empty: true,
      });
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(1);

      const slot = await db.query.amsSlots.findFirst({
        where: and(
          eq(amsSlots.printerId, testPrinterId),
          eq(amsSlots.slotType, "ams"),
          eq(amsSlots.amsIndex, 0),
          eq(amsSlots.trayIndex, 0)
        ),
      });
      expect(slot!.isEmpty).toBe(true);
      expect(slot!.spoolId).toBeNull();

      // Old spool should be moved to storage
      if (previousSpoolId) {
        const prevSpool = await db.query.spools.findFirst({ where: eq(spools.id, previousSpoolId) });
        expect(prevSpool!.location).toBe("storage");
      }
    });

    it("E6: Multiple slots in single sync → all updated", async () => {
      const { status, body } = await sync({
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
      expect(status).toBe(200);
      expect(body.slots_updated).toBeGreaterThanOrEqual(3);
    });
  });

  // ── F. Active Spool Tracking ──────────────────────────────────────────────

  describe("F. Active Spool Tracking", () => {
    let trackingSpoolId: string;
    let trackingFilamentId: string;
    let trackingVendorId: string;
    let trackingTagUid: string;
    let trackingPrintId: string;

    beforeAll(async () => {
      // Create a test spool with a known tag
      trackingVendorId = await makeVendor(`TestVendor_F_${Date.now()}`);
      toClean.vendors.push(trackingVendorId);
      trackingFilamentId = await makeFilament(trackingVendorId, {
        name: `TestFil_F_${Date.now()}`,
        material: "PETG",
        colorHex: "0000FF",
      });
      toClean.filaments.push(trackingFilamentId);
      trackingSpoolId = await makeSpool(trackingFilamentId, {
        remainingWeight: 900,
        initialWeight: 1000,
        purchasePrice: "25.00",
      });
      toClean.spools.push(trackingSpoolId);
      trackingTagUid = `TRACKF${Date.now().toString(16).toUpperCase()}`.slice(0, 16);
      const tagMappingId = await makeTagMapping(trackingSpoolId, trackingTagUid);
      toClean.tagMappings.push(tagMappingId);
    });

    it("F1: PRINTING with active_slot_tag → stores activeSpoolId on print record", async () => {
      const printName = `test-print-F1-${Date.now()}`;
      const { status, body } = await sync({
        print_state: "printing",
        print_name: printName,
        print_weight: 50,
        active_slot_tag: trackingTagUid,
        active_slot_type: "PETG",
        active_slot_color: "0000FFFF",
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("started");
      trackingPrintId = body.print_id;
      toClean.prints.push(trackingPrintId);

      const print = await db.query.prints.findFirst({ where: eq(prints.id, trackingPrintId) });
      expect(print!.activeSpoolId).toBe(trackingSpoolId);
    });

    it("F2: Continued PRINTING updates activeSpoolId from current payload", async () => {
      // Keep sending the tag while printing — stored spool should stay the same
      const { status, body } = await sync({
        print_state: "printing",
        print_weight: 55,
        active_slot_tag: trackingTagUid,
        active_slot_type: "PETG",
        active_slot_color: "0000FFFF",
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("none");

      const print = await db.query.prints.findFirst({ where: eq(prints.id, trackingPrintId) });
      expect(print!.activeSpoolId).toBe(trackingSpoolId);
    });

    it("F3: On finish, creates print_usage record with correct weight and cost", async () => {
      const weightUsed = 55;
      const { status, body } = await sync({
        print_state: "idle",
        print_weight: weightUsed,
        // active_slot_tag is intentionally NOT sent (printer clears it on idle)
      });
      expect(status).toBe(200);
      expect(body.print_transition).toBe("finished");

      // Usage record should have been created using the stored activeSpoolId
      const usage = await db.query.printUsage.findFirst({
        where: eq(printUsage.printId, trackingPrintId),
      });
      expect(usage).toBeDefined();
      expect(usage!.spoolId).toBe(trackingSpoolId);
      expect(usage!.weightUsed).toBe(weightUsed);

      // Cost = (weightUsed / initialWeight) * purchasePrice = (55/1000) * 25 = 1.375 → "1.38"
      expect(usage!.cost).toBeDefined();
      const cost = Number(usage!.cost);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeCloseTo(1.375, 1);

      // Spool weight should be deducted
      const spool = await db.query.spools.findFirst({ where: eq(spools.id, trackingSpoolId) });
      expect(spool!.remainingWeight).toBe(900 - weightUsed);
    });
  });

  // ── G. Edge Cases ─────────────────────────────────────────────────────────

  describe("G. Edge Cases", () => {
    it("G1: Missing auth → 401", async () => {
      const res = await fetch(`${BASE}/events/printer-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer_id: testPrinterId, print_state: "idle" }),
      });
      expect(res.status).toBe(401);
    });

    it("G2: Missing printer_id → 400", async () => {
      const res = await fetch(`${BASE}/events/printer-sync`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ print_state: "idle" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/printer_id/i);
    });

    it("G3: All None/unavailable values → handles gracefully (no crash)", async () => {
      const { status, body } = await sync({
        print_state: "None",
        print_name: "None",
        print_weight: "unavailable",
        print_error: "None",
        active_slot_tag: "None",
      });
      expect(status).toBe(200);
      expect(body.synced).toBe(true);
      // "None" state → treated as idle
      expect(body.print_transition).toBe("none");
    });

    it("G4: Unknown state string → treated as idle", async () => {
      const { status, body } = await sync({ print_state: "SOME_FUTURE_STATE_XYZ" });
      expect(status).toBe(200);
      expect(body.synced).toBe(true);
      // Unknown state falls through to isIdle=true
      expect(body.print_transition).toBe("none");
    });
  });

  // ── H. Idempotency ────────────────────────────────────────────────────────

  describe("H. Idempotency", () => {
    it("H1: Same IDLE payload 5 times → same result each time", async () => {
      const payload = { print_state: "idle" };
      const results = [];
      for (let i = 0; i < 5; i++) {
        const { status, body } = await sync(payload);
        results.push({ status, transition: body.print_transition });
      }
      // All should succeed with no transition
      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.transition).toBe("none");
      }
    });

    it("H2: Same PRINTING payload while print running → no duplicate prints", async () => {
      const printName = `test-print-H2-${Date.now()}`;

      // Start the print
      const r1 = await sync({ print_state: "printing", print_name: printName, print_weight: 30 });
      expect(r1.body.print_transition).toBe("started");
      const firstId = r1.body.print_id;
      toClean.prints.push(firstId);

      // Send the exact same payload 3 more times
      for (let i = 0; i < 3; i++) {
        const r = await sync({ print_state: "printing", print_name: printName, print_weight: 30 });
        expect(r.status).toBe(200);
        expect(r.body.print_transition).toBe("none");
        expect(r.body.print_id).toBe(firstId);
      }

      // Clean up: finish the print
      await sync({ print_state: "idle" });
    });
  });
});
