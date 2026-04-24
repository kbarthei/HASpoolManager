import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest, routeContext } from "../harness/request";

let printerId: string;
let spoolId: string;
let runningPrintId: string;
let finishedPrintId: string;
let noPriceSpoolId: string;
let printNoCostableId: string;

beforeAll(async () => {
  await setupTestDb();
  const { makeVendor, makeFilament, makeSpool, makePrinter } = await import("../fixtures/seed");
  const { db } = await import("@/lib/db");
  const { prints, syncLog } = await import("@/lib/db/schema");

  const vendorId = await makeVendor("CostEstimateVendor");
  const filamentId = await makeFilament(vendorId, {
    name: "PLA Cost Test",
    material: "PLA",
    colorHex: "2B2B2D",
    bambuIdx: "GFA00",
  });
  spoolId = await makeSpool(filamentId, { purchasePrice: 20 }); // → 0.02 EUR/g at 1000g
  noPriceSpoolId = await makeSpool(filamentId); // no purchase_price
  printerId = await makePrinter({ name: "CostTestPrinter" });

  const [running] = await db
    .insert(prints)
    .values({
      printerId,
      name: "cost-estimate-running.gcode",
      status: "running",
      startedAt: new Date(),
      printWeight: 100,
      activeSpoolIds: JSON.stringify([spoolId]),
    })
    .returning();
  runningPrintId = running.id;

  const [finished] = await db
    .insert(prints)
    .values({
      printerId,
      name: "cost-estimate-finished.gcode",
      status: "finished",
      startedAt: new Date(Date.now() - 3600_000),
      finishedAt: new Date(),
      printWeight: 50,
      activeSpoolIds: JSON.stringify([spoolId]),
    })
    .returning();
  finishedPrintId = finished.id;

  const [noCostable] = await db
    .insert(prints)
    .values({
      printerId,
      name: "cost-estimate-nocost.gcode",
      status: "running",
      startedAt: new Date(),
      printWeight: 40,
      activeSpoolIds: JSON.stringify([noPriceSpoolId]),
    })
    .returning();
  printNoCostableId = noCostable.id;

  await db.insert(syncLog).values({
    printerId,
    responseJson: JSON.stringify({ request: { print_progress: "40" } }),
  });
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /api/v1/prints/[id]/cost-estimate", () => {
  it("estimates cost for running print using progress × weight × avg price/g", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/cost-estimate/route");
    const res = await GET(
      makeGetRequest(`/api/v1/prints/${runningPrintId}/cost-estimate`),
      routeContext({ id: runningPrintId }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.print_id).toBe(runningPrintId);
    expect(body.status).toBe("running");
    expect(body.progress_percent).toBe(40);
    expect(body.total_weight_g).toBe(100);
    expect(body.estimated_weight_used_g).toBe(40);
    // 40 g × (20 / 1000) EUR/g = 0.80 EUR
    expect(body.estimated_cost_eur).toBe(0.8);
    expect(body.currency).toBe("EUR");
    expect(body.spools).toHaveLength(1);
    expect(body.spools[0].cost_per_gram).toBe(0.02);
  });

  it("treats finished print as 100% progress", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/cost-estimate/route");
    const res = await GET(
      makeGetRequest(`/api/v1/prints/${finishedPrintId}/cost-estimate`),
      routeContext({ id: finishedPrintId }),
    );
    const body = await res.json();
    expect(body.progress_percent).toBe(100);
    // 50 g × 0.02 EUR/g = 1.00 EUR
    expect(body.estimated_cost_eur).toBe(1);
  });

  it("returns null cost + warning when active spools have no purchase price", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/cost-estimate/route");
    const res = await GET(
      makeGetRequest(`/api/v1/prints/${printNoCostableId}/cost-estimate`),
      routeContext({ id: printNoCostableId }),
    );
    const body = await res.json();
    expect(body.estimated_cost_eur).toBeNull();
    expect(body.warnings.some((w: string) => w.includes("no purchase price"))).toBe(true);
  });

  it("returns 404 for unknown print id", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/cost-estimate/route");
    const res = await GET(
      makeGetRequest("/api/v1/prints/unknown/cost-estimate"),
      routeContext({ id: "00000000-0000-0000-0000-000000000000" }),
    );
    expect(res.status).toBe(404);
  });
});
