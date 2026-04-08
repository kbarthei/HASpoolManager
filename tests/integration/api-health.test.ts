/**
 * Integration test POC for Chunk 1 of the test strategy.
 *
 * Exercises:
 *   1. Route handler called directly (no HTTP / dev server).
 *   2. Per-worker SQLite harness (`setupTestDb`) + a DB round-trip through
 *      the real `@/lib/db` singleton, proving the lazy SQLITE_PATH override
 *      works.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";

describe("API health + harness smoke", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("GET /api/v1/health returns ok via direct handler call", async () => {
    const { GET } = await import("@/app/api/v1/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.1.0");
    expect(typeof data.timestamp).toBe("string");
  });

  it("harness DB accepts insert + select via @/lib/db", async () => {
    const { db } = await import("@/lib/db");
    const { vendors } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const name = `HarnessVendor_${Date.now()}`;
    const [inserted] = await db.insert(vendors).values({ name }).returning({
      id: vendors.id,
      name: vendors.name,
    });

    expect(inserted.id).toBeTruthy();
    expect(inserted.name).toBe(name);

    const rows = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, inserted.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(name);
  });
});
