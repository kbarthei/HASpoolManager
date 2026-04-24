import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest } from "../harness/request";

let printerId: string;
let filamentId: string;
let vendorId: string;

beforeAll(async () => {
  await setupTestDb();
  const { makeVendor, makeFilament, makeSpool, makePrinter } = await import("../fixtures/seed");
  vendorId = await makeVendor("ExportTestVendor");
  filamentId = await makeFilament(vendorId, {
    name: "PLA Export Test",
    material: "PLA",
    colorHex: "00AAFF",
    bambuIdx: "GFA99",
  });
  await makeSpool(filamentId, { purchasePrice: 19.99 });
  printerId = await makePrinter({ name: "Export Test Printer" });

  const { db } = await import("@/lib/db");
  const { prints, orders, orderItems } = await import("@/lib/db/schema");
  await db.insert(prints).values({
    printerId,
    name: "export-test.gcode",
    status: "finished",
    startedAt: new Date("2026-04-20T10:00:00Z"),
    finishedAt: new Date("2026-04-20T11:30:00Z"),
    durationSeconds: 5400,
    printWeight: 45.2,
    filamentCost: 0.9,
    energyCost: 0.15,
    totalCost: 1.05,
  });

  const [order] = await db.insert(orders).values({
    vendorId,
    orderNumber: "TEST-ORDER-001",
    orderDate: "2026-04-15",
    status: "ordered",
    totalCost: 59.97,
    shippingCost: 4.99,
    currency: "EUR",
  }).returning();
  await db.insert(orderItems).values([
    { orderId: order.id, filamentId, quantity: 3, unitPrice: 18.33 },
  ]);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /api/v1/export/prints", () => {
  it("returns CSV with header and one row", async () => {
    const { GET } = await import("@/app/api/v1/export/prints/route");
    const res = await GET(makeGetRequest("/api/v1/export/prints"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("haspoolmanager-prints-");
    const csv = await res.text();
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "id,name,printer_name,status,started_at,finished_at,duration_seconds,print_weight_g,filament_cost,energy_cost,total_cost,gcode_file",
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(csv).toContain("export-test.gcode");
    expect(csv).toContain("Export Test Printer");
    expect(csv).toContain("45.2");
  });

  it("respects from/to filter", async () => {
    const { GET } = await import("@/app/api/v1/export/prints/route");
    const res = await GET(makeGetRequest("/api/v1/export/prints?from=2030-01-01"));
    const csv = await res.text();
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBe(1);
  });
});

describe("GET /api/v1/export/spools", () => {
  it("returns CSV with filament + vendor joined", async () => {
    const { GET } = await import("@/app/api/v1/export/spools/route");
    const res = await GET(makeGetRequest("/api/v1/export/spools"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("PLA Export Test");
    expect(csv).toContain("ExportTestVendor");
    expect(csv).toContain("GFA99");
    expect(csv).toContain("19.99");
  });
});

describe("GET /api/v1/export/orders", () => {
  it("returns CSV with vendor and item_count", async () => {
    const { GET } = await import("@/app/api/v1/export/orders/route");
    const res = await GET(makeGetRequest("/api/v1/export/orders"));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("TEST-ORDER-001");
    expect(csv).toContain("ExportTestVendor");
    expect(csv).toMatch(/TEST-ORDER-001,ExportTestVendor,ordered,1,/);
  });
});
