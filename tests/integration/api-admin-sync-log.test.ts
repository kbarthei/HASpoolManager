import { describe, it, expect } from "vitest";

// Integration tests require `npm run dev` running and DATABASE_URL set.

const BASE = "http://localhost:3000/api/v1";

describe.skipIf(!process.env.DATABASE_URL)("GET /api/v1/admin/sync-log", () => {
  it("returns paginated results", async () => {
    const res = await fetch(`${BASE}/admin/sync-log?page=1&limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.total).toBeGreaterThanOrEqual(0);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
  });

  it("returns correct shape for each entry", async () => {
    const res = await fetch(`${BASE}/admin/sync-log?page=1&limit=5`);
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const entry of data.entries) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("normalizedState");
      expect(entry).toHaveProperty("printTransition");
      expect(entry).toHaveProperty("createdAt");
    }
  });

  it("filters by transitions only", async () => {
    const res = await fetch(`${BASE}/admin/sync-log?filter=transitions&limit=50`);
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const entry of data.entries) {
      expect(entry.printTransition).not.toBe("none");
    }
  });

  it("filters by active states", async () => {
    const ACTIVE = ["PRINTING", "CHANGING_FILAMENT", "CALIBRATING_EXTRUSION", "CALIBRATING_BED", "HEATING"];
    const res = await fetch(`${BASE}/admin/sync-log?filter=active&limit=50`);
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const entry of data.entries) {
      expect(ACTIVE).toContain(entry.normalizedState);
    }
  });

  it("returns page 2", async () => {
    const res = await fetch(`${BASE}/admin/sync-log?page=2&limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.page).toBe(2);
    expect(data.limit).toBe(10);
  });

  it("total count is consistent across pages", async () => {
    const res1 = await fetch(`${BASE}/admin/sync-log?page=1&limit=10`);
    const res2 = await fetch(`${BASE}/admin/sync-log?page=2&limit=10`);
    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1.total).toBe(data2.total);
  });
});
