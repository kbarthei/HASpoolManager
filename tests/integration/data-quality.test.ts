/**
 * Data-quality layer: DB triggers (weight clamp) verified against a real
 * SQLite file. The health-check script is exercised end-to-end during deploy
 * smoke tests — keeping this integration suite focused on the trigger
 * invariants that application code may rely on.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { setupTestDb, testDbPath } from "@/tests/harness/sqlite-db";
import { db } from "@/lib/db";
import { spools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeVendor, makeFilament } from "@/tests/fixtures/seed";

/** Apply triggers directly — they live in scripts/migrate-db.js which
 * the drizzle migrator doesn't see. Idempotent. */
function applyTriggers(dbPath: string) {
  const sqlite = new Database(dbPath);
  try {
    const existing = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='chk_spool_weight_negative'")
      .all();
    if (existing.length === 0) {
      sqlite.exec(`
        CREATE TRIGGER chk_spool_weight_negative AFTER UPDATE OF remaining_weight ON spools
          WHEN NEW.remaining_weight < 0
          BEGIN
            UPDATE spools SET remaining_weight = 0 WHERE id = NEW.id;
          END;
      `);
      sqlite.exec(`
        CREATE TRIGGER chk_spool_weight_max AFTER UPDATE OF remaining_weight ON spools
          WHEN NEW.remaining_weight > NEW.initial_weight AND NEW.initial_weight > 0
          BEGIN
            UPDATE spools SET remaining_weight = NEW.initial_weight WHERE id = NEW.id;
          END;
      `);
    }
  } finally {
    sqlite.close();
  }
}

describe("DB weight-clamp triggers", () => {
  beforeAll(async () => {
    await setupTestDb();
    applyTriggers(testDbPath());
  });

  it("clamps negative remaining_weight to 0", async () => {
    const vendorId = await makeVendor("Trigger Vendor");
    const filamentId = await makeFilament(vendorId, { name: "Trigger Filament" });
    const [spool] = await db
      .insert(spools)
      .values({ filamentId, initialWeight: 1000, remainingWeight: 100 })
      .returning();

    await db.update(spools).set({ remainingWeight: -5 }).where(eq(spools.id, spool.id));

    const after = await db.query.spools.findFirst({ where: eq(spools.id, spool.id) });
    expect(after?.remainingWeight).toBe(0);
  });

  it("clamps remaining_weight > initial_weight to initial", async () => {
    const vendorId = await makeVendor("Trigger Vendor 2");
    const filamentId = await makeFilament(vendorId, { name: "Trigger Filament 2" });
    const [spool] = await db
      .insert(spools)
      .values({ filamentId, initialWeight: 1000, remainingWeight: 500 })
      .returning();

    await db.update(spools).set({ remainingWeight: 2500 }).where(eq(spools.id, spool.id));

    const after = await db.query.spools.findFirst({ where: eq(spools.id, spool.id) });
    expect(after?.remainingWeight).toBe(1000);
  });

  it("allows valid updates unchanged", async () => {
    const vendorId = await makeVendor("Trigger Vendor 3");
    const filamentId = await makeFilament(vendorId, { name: "Trigger Filament 3" });
    const [spool] = await db
      .insert(spools)
      .values({ filamentId, initialWeight: 1000, remainingWeight: 500 })
      .returning();

    await db.update(spools).set({ remainingWeight: 250 }).where(eq(spools.id, spool.id));

    const after = await db.query.spools.findFirst({ where: eq(spools.id, spool.id) });
    expect(after?.remainingWeight).toBe(250);
  });
});
