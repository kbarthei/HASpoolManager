/**
 * GET /api/v1/admin/sync-log — rewritten onto the harness.
 * Seeds a few sync_log rows and asserts pagination + filter shapes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest } from "../harness/request";

type Entry = {
  id: string;
  normalizedState: string;
  printTransition: string;
  createdAt: string;
};

describe("GET /api/v1/admin/sync-log", () => {
  beforeAll(async () => {
    await setupTestDb();
    const { makePrinter } = await import("../fixtures/seed");
    const printerId = await makePrinter({ name: "SyncLogPrinter" });

    const { db } = await import("@/lib/db");
    const { syncLog } = await import("@/lib/db/schema");

    // Seed a variety of rows so we can assert filters
    const rows = [
      { normalizedState: "IDLE", printTransition: "none" },
      { normalizedState: "PRINTING", printTransition: "idle_to_running" },
      { normalizedState: "PRINTING", printTransition: "none" },
      { normalizedState: "CHANGING_FILAMENT", printTransition: "none" },
      { normalizedState: "IDLE", printTransition: "running_to_finished" },
      { normalizedState: "HEATING", printTransition: "none" },
      { normalizedState: "FINISH", printTransition: "none" },
    ];
    for (const r of rows) {
      await db.insert(syncLog).values({
        printerId,
        rawState: r.normalizedState,
        normalizedState: r.normalizedState,
        printTransition: r.printTransition,
      });
    }
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("returns paginated results", async () => {
    const { GET } = await import("@/app/api/v1/admin/sync-log/route");
    const res = await GET(makeGetRequest("/api/v1/admin/sync-log?page=1&limit=10"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { entries: Entry[]; total: number; page: number; limit: number };
    expect(Array.isArray(data.entries)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.total).toBeGreaterThanOrEqual(7);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
  });

  it("returns the expected shape for each entry", async () => {
    const { GET } = await import("@/app/api/v1/admin/sync-log/route");
    const res = await GET(makeGetRequest("/api/v1/admin/sync-log?page=1&limit=5"));
    const data = (await res.json()) as { entries: Entry[] };
    for (const entry of data.entries) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("normalizedState");
      expect(entry).toHaveProperty("printTransition");
      expect(entry).toHaveProperty("createdAt");
    }
  });

  it("filters by transitions only", async () => {
    const { GET } = await import("@/app/api/v1/admin/sync-log/route");
    const res = await GET(
      makeGetRequest("/api/v1/admin/sync-log?filter=transitions&limit=50"),
    );
    const data = (await res.json()) as { entries: Entry[] };
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of data.entries) {
      expect(entry.printTransition).not.toBe("none");
    }
  });

  it("filters by active states", async () => {
    const ACTIVE = [
      "PRINTING",
      "CHANGING_FILAMENT",
      "CALIBRATING_EXTRUSION",
      "CALIBRATING_BED",
      "HEATING",
    ];
    const { GET } = await import("@/app/api/v1/admin/sync-log/route");
    const res = await GET(
      makeGetRequest("/api/v1/admin/sync-log?filter=active&limit=50"),
    );
    const data = (await res.json()) as { entries: Entry[] };
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of data.entries) {
      expect(ACTIVE).toContain(entry.normalizedState);
    }
  });

  it("total count is stable across pages", async () => {
    const { GET } = await import("@/app/api/v1/admin/sync-log/route");
    const r1 = await GET(makeGetRequest("/api/v1/admin/sync-log?page=1&limit=3"));
    const r2 = await GET(makeGetRequest("/api/v1/admin/sync-log?page=2&limit=3"));
    const d1 = (await r1.json()) as { total: number; page: number };
    const d2 = (await r2.json()) as { total: number; page: number };
    expect(d1.total).toBe(d2.total);
    expect(d2.page).toBe(2);
  });
});
