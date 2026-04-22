/**
 * End-to-end test of the Multi-AMS + Multi-Rack data migration.
 *
 * Exercises lib/migrate-data.ts directly (no shell-out). The Drizzle test
 * harness creates the racks and printer_ams_units tables via the generated
 * SQL migrations 0008/0009. This test seeds pre-migration data that mimics
 * v1.x state, runs the backfill, and asserts the expected post-migration
 * state.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { setupTestDb, testDbPath } from "@/tests/harness/sqlite-db";
import { db } from "@/lib/db";
import { migrateRackData, migrateAmsUnits } from "@/lib/migrate-data";
import {
  spools,
  racks,
  printerAmsUnits,
  settings,
  printers,
  amsSlots,
  filaments,
  vendors,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("end-to-end multi-rack + multi-AMS migration", () => {
  let rawDb: Database.Database;

  function wipeForRackTest() {
    rawDb.prepare("DELETE FROM racks").run();
    rawDb.prepare("DELETE FROM settings WHERE key IN ('rack_rows', 'rack_columns')").run();
    rawDb.prepare("DELETE FROM spools").run();
  }

  function wipeForAmsTest() {
    rawDb.prepare("DELETE FROM printer_ams_units").run();
    rawDb.prepare("DELETE FROM ams_slots").run();
    rawDb.prepare("DELETE FROM printers").run();
  }

  beforeAll(async () => {
    await setupTestDb();
    rawDb = new Database(testDbPath());
    rawDb.pragma("foreign_keys = ON");
  });

  async function seedVendorFilament() {
    const [v] = await db.insert(vendors).values({ name: `V-${Date.now()}` }).returning();
    const [f] = await db.insert(filaments).values({ vendorId: v.id, name: "F", material: "PLA" }).returning();
    return { vendor: v, filament: f };
  }

  it("creates default rack and migrates legacy 'rack:R-C' locations", async () => {
    wipeForRackTest();

    const { filament } = await seedVendorFilament();
    await db.insert(spools).values([
      { filamentId: filament.id, location: "rack:2-5" },
      { filamentId: filament.id, location: "rack:1-10" },
      { filamentId: filament.id, location: "ams" },
      { filamentId: filament.id, location: "storage" },
    ]);
    await db.insert(settings).values([
      { key: "rack_rows", value: "4" },
      { key: "rack_columns", value: "8" },
    ]);

    const result = migrateRackData(rawDb);
    expect(result.created).toBe(true);

    const rackList = await db.select().from(racks);
    expect(rackList).toHaveLength(1);
    expect(rackList[0].name).toBe("Main");
    expect(rackList[0].rows).toBe(4);
    expect(rackList[0].cols).toBe(8);
    const defaultRackId = rackList[0].id;

    const rackSpools = (await db.select().from(spools)).filter((s) =>
      s.location?.startsWith("rack:"),
    );
    expect(rackSpools).toHaveLength(2);
    expect(rackSpools.every((s) => s.location!.startsWith(`rack:${defaultRackId}:`))).toBe(true);
    expect(rackSpools.map((s) => s.location).sort()).toEqual(
      [`rack:${defaultRackId}:1-10`, `rack:${defaultRackId}:2-5`].sort(),
    );

    const settingsRows = await db.select().from(settings);
    expect(settingsRows.find((r) => r.key === "rack_rows")).toBeUndefined();
    expect(settingsRows.find((r) => r.key === "rack_columns")).toBeUndefined();
  });

  it("derives printer_ams_units from existing amsSlots rows", async () => {
    wipeForAmsTest();

    const [printer] = await db
      .insert(printers)
      .values({ name: "H2S", model: "H2S" })
      .returning();
    await db.insert(amsSlots).values([
      { printerId: printer.id, slotType: "ams", amsIndex: 0, trayIndex: 0 },
      { printerId: printer.id, slotType: "ams", amsIndex: 0, trayIndex: 1 },
      { printerId: printer.id, slotType: "ams_ht", amsIndex: 1, trayIndex: 0 },
      { printerId: printer.id, slotType: "external", amsIndex: -1, trayIndex: 0 },
    ]);

    const result = migrateAmsUnits(rawDb);
    expect(result.createdUnits).toBe(2);

    const units = await db
      .select()
      .from(printerAmsUnits)
      .where(eq(printerAmsUnits.printerId, printer.id));
    expect(units).toHaveLength(2);
    const amsUnit = units.find((u) => u.slotType === "ams")!;
    const htUnit = units.find((u) => u.slotType === "ams_ht")!;
    expect(amsUnit.amsIndex).toBe(0);
    expect(amsUnit.displayName).toBe("AMS 1");
    expect(amsUnit.enabled).toBe(true);
    expect(htUnit.amsIndex).toBe(1);
    expect(htUnit.displayName).toBe("AMS HT");
  });

  it("is idempotent — running rack migration twice yields same result", async () => {
    wipeForRackTest();

    const { filament } = await seedVendorFilament();
    await db.insert(spools).values({ filamentId: filament.id, location: "rack:1-1" });
    await db.insert(settings).values({ key: "rack_rows", value: "3" });

    const first = migrateRackData(rawDb);
    const second = migrateRackData(rawDb);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const rackList = await db.select().from(racks);
    expect(rackList).toHaveLength(1);
  });

  it("is idempotent — running AMS unit migration twice yields same result", async () => {
    wipeForAmsTest();

    const [printer] = await db
      .insert(printers)
      .values({ name: "H2S-idempotent", model: "H2S" })
      .returning();
    await db.insert(amsSlots).values([
      { printerId: printer.id, slotType: "ams", amsIndex: 0, trayIndex: 0 },
    ]);

    const first = migrateAmsUnits(rawDb);
    const second = migrateAmsUnits(rawDb);

    expect(first.createdUnits).toBe(1);
    expect(second.createdUnits).toBe(0);

    const units = await db.select().from(printerAmsUnits);
    expect(units).toHaveLength(1);
  });
});
