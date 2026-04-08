import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000/api/v1";
const AUTH = { Authorization: `Bearer ${process.env.API_SECRET_KEY || "test-dev-key-2026"}` };

describe.skip("Event Webhook Integration Tests", () => {
  const testEventId = `test_integration_${Date.now()}`;

  describe("POST /api/v1/events/print-started", () => {
    it("requires printer_id", async () => {
      const res = await fetch(`${BASE}/events/print-started`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ name: "Test Print" }),
      });
      expect(res.status).toBe(400);
    });

    it("creates a print record", async () => {
      // First get a printer ID
      const printersRes = await fetch(`${BASE}/printers`, { headers: AUTH });
      const printers = await printersRes.json();
      const printerId = printers[0]?.id;
      if (!printerId) return; // skip if no printer

      const res = await fetch(`${BASE}/events/print-started`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          printer_id: printerId,
          name: "Integration Test Print",
          ha_event_id: testEventId,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.print_id).toBeDefined();
      expect(data.status).toBe("created");
    });

    it("is idempotent with same ha_event_id", async () => {
      const printersRes = await fetch(`${BASE}/printers`, { headers: AUTH });
      const printers = await printersRes.json();
      const printerId = printers[0]?.id;
      if (!printerId) return;

      const res = await fetch(`${BASE}/events/print-started`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          printer_id: printerId,
          name: "Integration Test Print Duplicate",
          ha_event_id: testEventId,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("already_exists");
    });
  });

  describe("POST /api/v1/events/print-finished", () => {
    it("returns 404 for unknown print", async () => {
      const res = await fetch(`${BASE}/events/print-finished`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          ha_event_id: "nonexistent_event_id",
          status: "finished",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/events/ams-slot-changed", () => {
    it("requires printer_id, ams_index, tray_index", async () => {
      const res = await fetch(`${BASE}/events/ams-slot-changed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ tray_type: "PLA" }),
      });
      expect(res.status).toBe(400);
    });

    it("updates slot and runs matching", async () => {
      const printersRes = await fetch(`${BASE}/printers`, { headers: AUTH });
      const printers = await printersRes.json();
      const printerId = printers[0]?.id;
      if (!printerId) return;

      const res = await fetch(`${BASE}/events/ams-slot-changed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          printer_id: printerId,
          ams_index: 0,
          tray_index: 0,
          tray_type: "ABS-GF",
          tray_color: "C6C6C6FF",
          tray_info_idx: "GFB50",
          tag_uid: "B568B1A400000100",
          remain: 70,
          is_empty: false,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_empty).toBe(false);
      expect(data.matched_spool).not.toBeNull();
      expect(data.matched_spool.confidence).toBe(1.0);
    });

    it("handles empty slot", async () => {
      const printersRes = await fetch(`${BASE}/printers`, { headers: AUTH });
      const printers = await printersRes.json();
      const printerId = printers[0]?.id;
      if (!printerId) return;

      const res = await fetch(`${BASE}/events/ams-slot-changed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          printer_id: printerId,
          ams_index: 1,
          tray_index: 0,
          slot_type: "ams_ht",
          is_empty: true,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.is_empty).toBe(true);
      expect(data.matched_spool).toBeNull();
    });
  });
});
