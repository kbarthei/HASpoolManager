/**
 * CRUD API integration tests — rewritten onto the per-worker SQLite harness.
 * Calls route handlers directly via NextRequest, no dev server needed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import {
  makeGetRequest,
  routeContext,
} from "../harness/request";

describe("CRUD API integration", () => {
  let vendorId: string;
  let filamentId: string;
  let spoolId: string;
  let tagUid: string;
  let printerId: string;

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

    vendorId = await makeVendor("CrudVendor");
    filamentId = await makeFilament(vendorId, {
      name: "CrudFilament",
      material: "PETG",
      colorHex: "112233",
    });
    spoolId = await makeSpool(filamentId, {
      remainingWeight: 800,
      initialWeight: 1000,
      purchasePrice: 19.99,
    });
    tagUid = `CRUDTAG_${Date.now()}`;
    await makeTagMapping(spoolId, tagUid);

    printerId = await makePrinter({ name: "CrudPrinter" });
    // 4 AMS slots + 1 HT slot so the list endpoint returns >=1
    for (let i = 0; i < 4; i++) {
      await makeAmsSlot(printerId, { slotType: "ams", amsIndex: 0, trayIndex: i });
    }
    await makeAmsSlot(printerId, { slotType: "ams_ht", amsIndex: 0, trayIndex: 0 });
  });

  afterAll(() => {
    teardownTestDb();
  });

  describe("Vendors", () => {
    it("GET /vendors lists seeded vendors", async () => {
      const { GET } = await import("@/app/api/v1/vendors/route");
      const res = await GET(makeGetRequest("/api/v1/vendors", true));
      expect(res.status).toBe(200);
      const data = (await res.json()) as Array<{ name: string }>;
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((v) => v.name === "CrudVendor")).toBe(true);
    });
  });

  describe("Spools", () => {
    it("GET /spools returns spools with filament + vendor", async () => {
      const { GET } = await import("@/app/api/v1/spools/route");
      const res = await GET(makeGetRequest("/api/v1/spools"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as Array<{
        id: string;
        filament: { vendor: { name: string } };
      }>;
      expect(data.length).toBeGreaterThanOrEqual(1);
      const mine = data.find((s) => s.id === spoolId);
      expect(mine).toBeDefined();
      expect(mine?.filament.vendor.name).toBe("CrudVendor");
    });

    it("GET /spools/:id returns spool detail", async () => {
      const { GET } = await import("@/app/api/v1/spools/[id]/route");
      const res = await GET(
        makeGetRequest(`/api/v1/spools/${spoolId}`),
        routeContext({ id: spoolId }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        id: string;
        remainingWeight: number;
      };
      expect(data.id).toBe(spoolId);
      expect(data.remainingWeight).toBe(800);
    });

    it("GET /spools/:id returns 404 for unknown id", async () => {
      const { GET } = await import("@/app/api/v1/spools/[id]/route");
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await GET(
        makeGetRequest(`/api/v1/spools/${fakeId}`),
        routeContext({ id: fakeId }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Tags", () => {
    it("GET /tags lists tag mappings", async () => {
      const { GET } = await import("@/app/api/v1/tags/route");
      const res = await GET(makeGetRequest("/api/v1/tags"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as Array<{ tagUid: string }>;
      expect(data.some((t) => t.tagUid === tagUid)).toBe(true);
    });

    it("GET /tags/:tag_uid looks up spool by tag", async () => {
      const { GET } = await import("@/app/api/v1/tags/[tag_uid]/route");
      const res = await GET(
        makeGetRequest(`/api/v1/tags/${tagUid}`),
        routeContext({ tag_uid: tagUid }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        tagUid: string;
        spool: { id: string };
      };
      expect(data.tagUid).toBe(tagUid);
      expect(data.spool.id).toBe(spoolId);
    });

    it("GET /tags/:tag_uid returns 404 for unknown tag", async () => {
      const { GET } = await import("@/app/api/v1/tags/[tag_uid]/route");
      const uid = "ZZZZZZZZZZZZZZZZ";
      const res = await GET(
        makeGetRequest(`/api/v1/tags/${uid}`),
        routeContext({ tag_uid: uid }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Printers", () => {
    it("GET /printers lists printers with amsSlots", async () => {
      const { GET } = await import("@/app/api/v1/printers/route");
      const res = await GET(makeGetRequest("/api/v1/printers"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as Array<{
        id: string;
        name: string;
        amsSlots: unknown[];
      }>;
      const mine = data.find((p) => p.id === printerId);
      expect(mine).toBeDefined();
      expect(mine?.name).toBe("CrudPrinter");
      expect(mine?.amsSlots.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Auth", () => {
    it("GET /vendors without bearer returns 401 (requireAuth)", async () => {
      const { GET } = await import("@/app/api/v1/vendors/route");
      const res = await GET(makeGetRequest("/api/v1/vendors", false));
      expect(res.status).toBe(401);
    });
  });
});
