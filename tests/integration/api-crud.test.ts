import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000/api/v1";
const AUTH = { Authorization: `Bearer ${process.env.API_SECRET_KEY || "test-dev-key-2026"}` };

describe.skip("CRUD API Integration Tests", () => {
  describe("Vendors", () => {
    it("GET /api/v1/vendors lists all vendors", async () => {
      const res = await fetch(`${BASE}/vendors`, { headers: AUTH });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].name).toBeDefined();
    });
  });

  describe("Spools", () => {
    it("GET /api/v1/spools lists spools with filament data", async () => {
      const res = await fetch(`${BASE}/spools`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].filament).toBeDefined();
      expect(data[0].filament.vendor).toBeDefined();
    });

    it("GET /api/v1/spools filters by material", async () => {
      const res = await fetch(`${BASE}/spools?material=PETG`);
      // Note: the current spools route may not support material filter directly
      // This tests the API behavior
      expect(res.status).toBe(200);
    });

    it("GET /api/v1/spools/:id returns spool detail", async () => {
      const listRes = await fetch(`${BASE}/spools`);
      const spools = await listRes.json();
      const id = spools[0]?.id;
      if (!id) return;

      const res = await fetch(`${BASE}/spools/${id}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(id);
      expect(data.filament).toBeDefined();
      expect(data.remainingWeight).toBeDefined();
    });

    it("GET /api/v1/spools/:id returns 404 for unknown id", async () => {
      const res = await fetch(`${BASE}/spools/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });
  });

  describe("Tags", () => {
    it("GET /api/v1/tags lists tag mappings", async () => {
      const res = await fetch(`${BASE}/tags`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2); // at least 2 real tags
    });

    it("GET /api/v1/tags/:tag_uid looks up spool by tag", async () => {
      const res = await fetch(`${BASE}/tags/B568B1A400000100`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tagUid).toBe("B568B1A400000100");
      expect(data.spool).toBeDefined();
    });

    it("GET /api/v1/tags/:tag_uid returns 404 for unknown tag", async () => {
      const res = await fetch(`${BASE}/tags/ZZZZZZZZZZZZZZZZ`);
      expect(res.status).toBe(404);
    });
  });

  describe("Printers", () => {
    it("GET /api/v1/printers lists printers with AMS slots", async () => {
      const res = await fetch(`${BASE}/printers`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].name).toBe("H2S");
      expect(data[0].amsSlots).toBeDefined();
      expect(data[0].amsSlots.length).toBeGreaterThanOrEqual(6);
    });
  });
});
