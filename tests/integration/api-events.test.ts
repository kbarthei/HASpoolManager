/**
 * Event webhook integration tests — rewritten onto the harness.
 * Covers print-started, print-finished, and ams-slot-changed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

describe("event webhooks integration", () => {
  let printerId: string;
  const haEventId = `evt_${Date.now()}`;
  const matchTagUid = "EVTTAG_ABSGF";

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

    printerId = await makePrinter({ name: "EventPrinter" });
    // AMS 0 slot 0 + HT slot for the slot-changed tests
    await makeAmsSlot(printerId, { slotType: "ams", amsIndex: 0, trayIndex: 0 });
    await makeAmsSlot(printerId, { slotType: "ams_ht", amsIndex: 1, trayIndex: 0 });

    // Seed an ABS-GF spool with known RFID for matching
    const vendorId = await makeVendor("EventVendor");
    const filamentId = await makeFilament(vendorId, {
      name: "ABS-GF Gray",
      material: "ABS-GF",
      colorHex: "C6C6C6",
    });
    const spoolId = await makeSpool(filamentId);
    await makeTagMapping(spoolId, matchTagUid);
  });

  afterAll(() => {
    teardownTestDb();
  });

  describe("POST /events/print-started", () => {
    it("requires printer_id", async () => {
      const { POST } = await import("@/app/api/v1/events/print-started/route");
      const res = await POST(
        makePostRequest("/api/v1/events/print-started", { name: "no printer" }),
      );
      expect(res.status).toBe(400);
    });

    it("creates a print record", async () => {
      const { POST } = await import("@/app/api/v1/events/print-started/route");
      const res = await POST(
        makePostRequest("/api/v1/events/print-started", {
          printer_id: printerId,
          name: "Integration Test Print",
          ha_event_id: haEventId,
        }),
      );
      expect(res.status).toBe(201);
      const data = (await res.json()) as { print_id: string; status: string };
      expect(data.print_id).toBeTruthy();
      expect(data.status).toBe("created");
    });

    it("is idempotent with same ha_event_id", async () => {
      const { POST } = await import("@/app/api/v1/events/print-started/route");
      const res = await POST(
        makePostRequest("/api/v1/events/print-started", {
          printer_id: printerId,
          name: "Integration Test Print Duplicate",
          ha_event_id: haEventId,
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe("already_exists");
    });
  });

  describe("POST /events/print-finished", () => {
    it("returns 404 for unknown print", async () => {
      const { POST } = await import("@/app/api/v1/events/print-finished/route");
      const res = await POST(
        makePostRequest("/api/v1/events/print-finished", {
          ha_event_id: "nonexistent_event_id",
          status: "finished",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /events/ams-slot-changed", () => {
    it("requires printer_id, ams_index, tray_index", async () => {
      const { POST } = await import("@/app/api/v1/events/ams-slot-changed/route");
      const res = await POST(
        makePostRequest("/api/v1/events/ams-slot-changed", { tray_type: "PLA" }),
      );
      expect(res.status).toBe(400);
    });

    it("updates slot and runs matching via RFID", async () => {
      const { POST } = await import("@/app/api/v1/events/ams-slot-changed/route");
      const res = await POST(
        makePostRequest("/api/v1/events/ams-slot-changed", {
          printer_id: printerId,
          ams_index: 0,
          tray_index: 0,
          tray_type: "ABS-GF",
          tray_color: "C6C6C6FF",
          tray_info_idx: "GFB50",
          tag_uid: matchTagUid,
          remain: 70,
          is_empty: false,
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        is_empty: boolean;
        matched_spool: { confidence: number } | null;
      };
      expect(data.is_empty).toBe(false);
      expect(data.matched_spool).not.toBeNull();
      expect(data.matched_spool!.confidence).toBe(1.0);
    });

    it("handles an empty slot", async () => {
      const { POST } = await import("@/app/api/v1/events/ams-slot-changed/route");
      const res = await POST(
        makePostRequest("/api/v1/events/ams-slot-changed", {
          printer_id: printerId,
          ams_index: 1,
          tray_index: 0,
          slot_type: "ams_ht",
          is_empty: true,
        }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        is_empty: boolean;
        matched_spool: unknown | null;
      };
      expect(data.is_empty).toBe(true);
      expect(data.matched_spool).toBeNull();
    });
  });
});
