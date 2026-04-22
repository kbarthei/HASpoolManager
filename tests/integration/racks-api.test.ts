import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupTestDb } from "@/tests/harness/sqlite-db";
import { makeGetRequest, makePostRequest, makePatchRequest, makeDeleteRequest, routeContext } from "@/tests/harness/request";
import { GET as listRacks, POST as createRack } from "@/app/api/v1/racks/route";
import { PATCH as patchRack, DELETE as archiveRack } from "@/app/api/v1/racks/[id]/route";
import { db } from "@/lib/db";
import { racks, spools, filaments, vendors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("racks API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    // wipe racks for a clean slate
    await db.delete(racks);
  });

  it("POST creates a new rack", async () => {
    const req = makePostRequest("/api/v1/racks", { name: "Lager", rows: 4, cols: 6 });
    const res = await createRack(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Lager");
    expect(body.rows).toBe(4);
    expect(body.cols).toBe(6);
    expect(body.archivedAt).toBeNull();
  });

  it("GET lists only active racks by default", async () => {
    const [r1] = await db.insert(racks).values({ name: "A", rows: 3, cols: 10, sortOrder: 0 }).returning();
    await db.insert(racks).values({ name: "B", rows: 2, cols: 4, sortOrder: 1, archivedAt: new Date() });

    const req = makeGetRequest("/api/v1/racks");
    const res = await listRacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(r1.id);
  });

  it("GET with ?includeArchived=1 lists all racks", async () => {
    await db.insert(racks).values([
      { name: "A", rows: 3, cols: 10, sortOrder: 0 },
      { name: "B", rows: 2, cols: 4, sortOrder: 1, archivedAt: new Date() },
    ]);

    const req = makeGetRequest("/api/v1/racks?includeArchived=1");
    const res = await listRacks(req);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("PATCH updates a rack", async () => {
    const [rack] = await db.insert(racks).values({ name: "A", rows: 3, cols: 10, sortOrder: 0 }).returning();
    const req = makePatchRequest(`/api/v1/racks/${rack.id}`, { name: "Renamed", rows: 5 });
    const res = await patchRack(req, routeContext({ id: rack.id }));
    expect(res.status).toBe(200);
    const updated = await db.query.racks.findFirst({ where: eq(racks.id, rack.id) });
    expect(updated!.name).toBe("Renamed");
    expect(updated!.rows).toBe(5);
  });

  it("DELETE archives rack and moves its spools to storage", async () => {
    // clean slate for spools too
    await db.delete(spools);
    const [rack] = await db.insert(racks).values({ name: "A", rows: 3, cols: 10, sortOrder: 0 }).returning();
    const [v] = await db.insert(vendors).values({ name: `V-${Date.now()}` }).returning();
    const [f] = await db.insert(filaments).values({ vendorId: v.id, name: "F", material: "PLA" }).returning();
    const [spool] = await db.insert(spools).values({ filamentId: f.id, location: `rack:${rack.id}:2-5` }).returning();

    const req = makeDeleteRequest(`/api/v1/racks/${rack.id}`);
    const res = await archiveRack(req, routeContext({ id: rack.id }));
    expect(res.status).toBe(200);

    const archived = await db.query.racks.findFirst({ where: eq(racks.id, rack.id) });
    expect(archived!.archivedAt).not.toBeNull();

    const relocated = await db.query.spools.findFirst({ where: eq(spools.id, spool.id) });
    expect(relocated!.location).toBe("storage");
  });

  it("POST requires auth", async () => {
    const req = makePostRequest("/api/v1/racks", { name: "X", rows: 1, cols: 1 }, false);
    const res = await createRack(req);
    expect(res.status).toBe(401);
  });

  it("POST rejects invalid input", async () => {
    const req = makePostRequest("/api/v1/racks", { name: "", rows: 0, cols: 999 });
    const res = await createRack(req);
    expect(res.status).toBe(400);
  });

  it("PATCH rejects unknown rack", async () => {
    const req = makePatchRequest("/api/v1/racks/nope-id", { name: "x" });
    const res = await patchRack(req, routeContext({ id: "nope-id" }));
    expect(res.status).toBe(404);
  });
});
