import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupTestDb } from "@/tests/harness/sqlite-db";
import { makeGetRequest, makePatchRequest, makePostRequest, routeContext } from "@/tests/harness/request";
import { GET as listUnits } from "@/app/api/v1/printers/[id]/ams-units/route";
import { PATCH as patchUnit } from "@/app/api/v1/printers/[id]/ams-units/[unitId]/route";
import { POST as discoverUnits } from "@/app/api/v1/printers/[id]/ams-units/discover/route";
import { db } from "@/lib/db";
import { printers, printerAmsUnits, amsSlots, spools, filaments, vendors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("printer AMS units API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await db.delete(amsSlots);
    await db.delete(printerAmsUnits);
    await db.delete(printers);
  });

  it("GET lists units for a printer, sorted by slotType then amsIndex", async () => {
    const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
    await db.insert(printerAmsUnits).values([
      { printerId: p.id, amsIndex: 1, slotType: "ams_ht", haDeviceId: "d2", displayName: "AMS HT", enabled: true },
      { printerId: p.id, amsIndex: 0, slotType: "ams", haDeviceId: "d1", displayName: "AMS 1", enabled: true },
    ]);

    const req = makeGetRequest(`/api/v1/printers/${p.id}/ams-units`);
    const res = await listUnits(req, routeContext({ id: p.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].slotType).toBe("ams"); // ams < ams_ht lexicographically
    expect(body[1].slotType).toBe("ams_ht");
  });

  it("PATCH renames an AMS unit", async () => {
    const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
    const [unit] = await db
      .insert(printerAmsUnits)
      .values({ printerId: p.id, amsIndex: 0, slotType: "ams", haDeviceId: "d1", displayName: "AMS 1", enabled: true })
      .returning();

    const req = makePatchRequest(`/api/v1/printers/${p.id}/ams-units/${unit.id}`, { displayName: "AMS Werkstatt" });
    const res = await patchUnit(req, routeContext({ id: p.id, unitId: unit.id }));
    expect(res.status).toBe(200);
    const updated = await db.query.printerAmsUnits.findFirst({ where: eq(printerAmsUnits.id, unit.id) });
    expect(updated!.displayName).toBe("AMS Werkstatt");
  });

  it("PATCH disabling an AMS moves loaded spools to storage and clears slot spool refs", async () => {
    const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
    const [unit] = await db
      .insert(printerAmsUnits)
      .values({ printerId: p.id, amsIndex: 0, slotType: "ams", haDeviceId: "d1", displayName: "AMS 1", enabled: true })
      .returning();
    const [v] = await db.insert(vendors).values({ name: `V-${Date.now()}` }).returning();
    const [f] = await db.insert(filaments).values({ vendorId: v.id, name: "F", material: "PLA" }).returning();
    const [spool] = await db.insert(spools).values({ filamentId: f.id, location: "ams" }).returning();
    await db
      .insert(amsSlots)
      .values({ printerId: p.id, slotType: "ams", amsIndex: 0, trayIndex: 0, spoolId: spool.id, isEmpty: false });

    const req = makePatchRequest(`/api/v1/printers/${p.id}/ams-units/${unit.id}`, { enabled: false });
    const res = await patchUnit(req, routeContext({ id: p.id, unitId: unit.id }));
    expect(res.status).toBe(200);

    const updated = await db.query.printerAmsUnits.findFirst({ where: eq(printerAmsUnits.id, unit.id) });
    expect(updated!.enabled).toBe(false);

    const movedSpool = await db.query.spools.findFirst({ where: eq(spools.id, spool.id) });
    expect(movedSpool!.location).toBe("storage");

    const slot = await db.query.amsSlots.findFirst({ where: eq(amsSlots.printerId, p.id) });
    expect(slot!.spoolId).toBeNull();
    expect(slot!.isEmpty).toBe(true);
  });

  it("PATCH rejects unknown unit", async () => {
    const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
    const req = makePatchRequest(`/api/v1/printers/${p.id}/ams-units/nope`, { displayName: "x" });
    const res = await patchUnit(req, routeContext({ id: p.id, unitId: "nope" }));
    expect(res.status).toBe(404);
  });

  it("PATCH accepts requests without a Bearer header (browser AmsUnitsCard path)", async () => {
    const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
    const [unit] = await db
      .insert(printerAmsUnits)
      .values({ printerId: p.id, amsIndex: 0, slotType: "ams", haDeviceId: "d1", displayName: "AMS 1", enabled: true })
      .returning();
    const req = makePatchRequest(`/api/v1/printers/${p.id}/ams-units/${unit.id}`, { displayName: "x" }, false);
    const res = await patchUnit(req, routeContext({ id: p.id, unitId: unit.id }));
    expect(res.status).toBe(200);
  });

  describe("POST /discover (sync-worker upsert)", () => {
    it("creates one unit per discovered AMS device, classifies HT by model", async () => {
      const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();

      const req = makePostRequest(`/api/v1/printers/${p.id}/ams-units/discover`, {
        devices: [
          { id: "ha-dev-ams-1", model: "AMS", name: "H2S_AMS_1" },
          { id: "ha-dev-ht-1", model: "AMS HT", name: "H2S_AMS_HT" },
        ],
      });
      const res = await discoverUnits(req, routeContext({ id: p.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toBe(2);
      expect(body.refreshed).toBe(0);

      const units = await db
        .select()
        .from(printerAmsUnits)
        .where(eq(printerAmsUnits.printerId, p.id));
      expect(units).toHaveLength(2);
      const amsUnit = units.find((u) => u.slotType === "ams")!;
      const htUnit = units.find((u) => u.slotType === "ams_ht")!;
      expect(amsUnit.amsIndex).toBe(0);
      expect(amsUnit.haDeviceId).toBe("ha-dev-ams-1");
      expect(htUnit.amsIndex).toBe(1);
      expect(htUnit.haDeviceId).toBe("ha-dev-ht-1");
    });

    it("re-discovery refreshes, does not overwrite user-edited displayName/enabled", async () => {
      const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
      // Simulate existing customized unit
      await db.insert(printerAmsUnits).values({
        printerId: p.id,
        amsIndex: 0,
        slotType: "ams",
        haDeviceId: "ha-dev-ams-1",
        displayName: "Werkstatt AMS",
        enabled: false,
      });

      const req = makePostRequest(`/api/v1/printers/${p.id}/ams-units/discover`, {
        devices: [{ id: "ha-dev-ams-1", model: "AMS", name: "H2S_AMS_1" }],
      });
      const res = await discoverUnits(req, routeContext({ id: p.id }));
      const body = await res.json();
      expect(body.created).toBe(0);
      expect(body.refreshed).toBe(1);

      const units = await db
        .select()
        .from(printerAmsUnits)
        .where(eq(printerAmsUnits.printerId, p.id));
      expect(units).toHaveLength(1);
      expect(units[0].displayName).toBe("Werkstatt AMS");
      expect(units[0].enabled).toBe(false);
    });

    it("requires auth", async () => {
      const [p] = await db.insert(printers).values({ name: "H2S", model: "H2S" }).returning();
      const req = makePostRequest(
        `/api/v1/printers/${p.id}/ams-units/discover`,
        { devices: [] },
        false,
      );
      const res = await discoverUnits(req, routeContext({ id: p.id }));
      expect(res.status).toBe(401);
    });
  });
});
