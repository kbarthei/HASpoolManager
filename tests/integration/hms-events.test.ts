/**
 * POST/GET /api/v1/events/hms — HMS error event tracking.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest, makeGetRequest } from "../harness/request";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

let testPrinterId: string;
let testSpoolId: string;
let testFilamentId: string;

async function postHms(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/events/hms/route");
  const req = makePostRequest("/api/v1/events/hms", body);
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function getHms(params = "") {
  const { GET } = await import("@/app/api/v1/events/hms/route");
  const req = makeGetRequest(`/api/v1/events/hms${params ? `?${params}` : ""}`);
  const res = await GET(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("HMS events integration", () => {
  beforeAll(async () => {
    await setupTestDb();
    const { makeVendor, makeFilament, makeSpool, makePrinter, makeAmsSlot } = await import("../fixtures/seed");

    testPrinterId = await makePrinter({ name: "H2S-HMS" });

    const vendorId = await makeVendor("TestVendor");
    testFilamentId = await makeFilament(vendorId, {
      name: "PLA Test",
      material: "PLA",
      colorHex: "FF0000",
    });
    testSpoolId = await makeSpool(testFilamentId);

    // Put spool in AMS slot 2 (tray_index = 1)
    await makeAmsSlot(testPrinterId, {
      slotType: "ams",
      amsIndex: 0,
      trayIndex: 1,
      spoolId: testSpoolId,
    });
  });

  afterAll(() => teardownTestDb());

  it("H1: stores HMS events", async () => {
    const { status, body } = await postHms({
      printer_id: testPrinterId,
      events: [
        {
          code: "0700_2000_0002_0001",
          message: "AMS1 Slot2 filament has run out",
          severity: "common",
          wiki_url: "https://wiki.bambulab.com/en/h2/troubleshooting/hmscode/0700_2000_0002_0001",
        },
      ],
    });

    expect(status).toBe(200);
    expect(body.stored).toBe(1);
  });

  it("H2: resolves spool/filament from AMS slot", async () => {
    const { db } = await import("@/lib/db");
    const { hmsEvents } = await import("@/lib/db/schema");
    const { desc } = await import("drizzle-orm");

    const latest = await db.query.hmsEvents.findFirst({
      orderBy: [desc(hmsEvents.createdAt)],
    });

    expect(latest).toBeDefined();
    expect(latest!.module).toBe("ams");
    expect(latest!.slotKey).toBe("slot_2");
    expect(latest!.spoolId).toBe(testSpoolId);
    expect(latest!.filamentId).toBe(testFilamentId);
  });

  it("H3: deduplicates events within 60 seconds", async () => {
    const { status, body } = await postHms({
      printer_id: testPrinterId,
      events: [
        {
          code: "0700_2000_0002_0001",
          message: "AMS1 Slot2 filament has run out",
          severity: "common",
        },
      ],
    });

    expect(status).toBe(200);
    expect(body.stored).toBe(0); // deduplicated
  });

  it("H4: stores non-AMS errors without spool correlation", async () => {
    const { status, body } = await postHms({
      printer_id: testPrinterId,
      events: [
        {
          code: "0300_0100_0001_0007",
          message: "Heatbed temperature abnormal",
          severity: "serious",
        },
      ],
    });

    expect(status).toBe(200);
    expect(body.stored).toBe(1);

    const { db } = await import("@/lib/db");
    const { hmsEvents } = await import("@/lib/db/schema");
    const { desc } = await import("drizzle-orm");

    const latest = await db.query.hmsEvents.findFirst({
      orderBy: [desc(hmsEvents.createdAt)],
    });
    expect(latest!.module).toBe("mc");
    expect(latest!.spoolId).toBeNull();
    expect(latest!.filamentId).toBeNull();
  });

  it("H5: GET returns stored events with relations", async () => {
    const { status, body } = await getHms("limit=10");
    expect(status).toBe(200);

    const data = body.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(2);

    // Most recent first
    const first = data[0];
    expect(first.hmsCode).toBe("0300_0100_0001_0007");
  });

  it("H6: rejects missing printer_id", async () => {
    const { status } = await postHms({ events: [{ code: "0700_2000_0002_0001" }] });
    expect(status).toBe(400);
  });

  it("H7: stores multiple events in one request", async () => {
    const { status, body } = await postHms({
      printer_id: testPrinterId,
      events: [
        { code: "0700_7000_0002_0003", message: "Nozzle clog", severity: "serious" },
        { code: "0C00_1000_0001_0001", message: "Camera error", severity: "info" },
      ],
    });

    expect(status).toBe(200);
    expect(body.stored).toBe(2);
  });
});
