/**
 * Integration tests for the FTP-related printer endpoints. We don't test
 * the actual FTPS handshake here (that needs a live Bambu printer); we test
 * the error paths and the access-code persistence.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest, makeGetRequest, routeContext } from "../harness/request";
import { eq } from "drizzle-orm";

describe("/api/v1/printers/[id]/test-ftp", () => {
  let printerId: string;

  beforeAll(async () => {
    await setupTestDb();
    const { makePrinter } = await import("../fixtures/seed");
    printerId = await makePrinter({ name: "FtpTestPrinter" });
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("returns 400 when printer has no IP address", async () => {
    const { POST } = await import("@/app/api/v1/printers/[id]/test-ftp/route");
    const res = await POST(
      makePostRequest(`/api/v1/printers/${printerId}/test-ftp`, { accessCode: "12345678" }),
      routeContext({ id: printerId }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/IP/i);
  });

  it("returns 400 when no access code is provided and none stored", async () => {
    const { db } = await import("@/lib/db");
    const { printers } = await import("@/lib/db/schema");
    await db.update(printers).set({ ipAddress: "192.0.2.1" }).where(eq(printers.id, printerId));

    const { POST } = await import("@/app/api/v1/printers/[id]/test-ftp/route");
    const res = await POST(
      makePostRequest(`/api/v1/printers/${printerId}/test-ftp`, {}),
      routeContext({ id: printerId }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/access code/i);
  });

  it("reports probe failure cleanly for unreachable IP", async () => {
    const { POST } = await import("@/app/api/v1/printers/[id]/test-ftp/route");
    // 192.0.2.x is RFC 5737 TEST-NET-1 → guaranteed unroutable
    const res = await POST(
      makePostRequest(`/api/v1/printers/${printerId}/test-ftp`, { accessCode: "12345678" }),
      routeContext({ id: printerId }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; step: string; error?: string };
    expect(body.ok).toBe(false);
    expect(body.step).toBe("probe");
    expect(body.error).toMatch(/not reachable/i);
  }, 5000);

  it("returns 401 without auth", async () => {
    const { POST } = await import("@/app/api/v1/printers/[id]/test-ftp/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(`/api/v1/printers/${printerId}/test-ftp`, "http://test.local"), {
      method: "POST",
      body: JSON.stringify({ accessCode: "12345678" }),
    });
    const res = await POST(req, routeContext({ id: printerId }));
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown printer", async () => {
    const { POST } = await import("@/app/api/v1/printers/[id]/test-ftp/route");
    const res = await POST(
      makePostRequest("/api/v1/printers/nonexistent/test-ftp", { accessCode: "12345678" }),
      routeContext({ id: "nonexistent" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/printers/[id] persists accessCode", () => {
  let printerId: string;

  beforeAll(async () => {
    await setupTestDb();
    const { makePrinter } = await import("../fixtures/seed");
    printerId = await makePrinter({ name: "AccessCodePrinter" });
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("PUT writes accessCode without clobbering other fields", async () => {
    const { db } = await import("@/lib/db");
    const { printers } = await import("@/lib/db/schema");

    // Set initial state
    await db.update(printers).set({ ipAddress: "10.0.0.5" }).where(eq(printers.id, printerId));

    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(`/api/v1/printers/${printerId}`, "http://test.local"), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.API_SECRET_KEY ?? "test-api-key"}`,
      },
      body: JSON.stringify({ accessCode: "98765432" }),
    });
    const { PUT } = await import("@/app/api/v1/printers/[id]/route");
    const res = await PUT(req, routeContext({ id: printerId }));
    expect(res.status).toBe(200);

    const updated = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
    expect(updated?.accessCode).toBe("98765432");
    // ipAddress untouched
    expect(updated?.ipAddress).toBe("10.0.0.5");
  });

  it("PUT can clear accessCode by setting null", async () => {
    const { db } = await import("@/lib/db");
    const { printers } = await import("@/lib/db/schema");
    await db.update(printers).set({ accessCode: "11111111" }).where(eq(printers.id, printerId));

    const { NextRequest } = await import("next/server");
    const req = new NextRequest(new URL(`/api/v1/printers/${printerId}`, "http://test.local"), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.API_SECRET_KEY ?? "test-api-key"}`,
      },
      body: JSON.stringify({ accessCode: null }),
    });
    const { PUT } = await import("@/app/api/v1/printers/[id]/route");
    const res = await PUT(req, routeContext({ id: printerId }));
    expect(res.status).toBe(200);
    const after = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
    expect(after?.accessCode).toBeNull();
  });
});

describe("printer-ftp-pull match logic", () => {
  it("pullByPrintName MD5 short-circuit hits existing model", async () => {
    await setupTestDb();
    const { db } = await import("@/lib/db");
    const { modelFiles, printers, prints } = await import("@/lib/db/schema");
    const { makePrinter } = await import("../fixtures/seed");

    const printerId = await makePrinter({ name: "MatchPrinter" });
    const printId = crypto.randomUUID();
    await db.insert(prints).values({ id: printId, printerId, status: "running" });

    const modelFileId = crypto.randomUUID();
    await db.insert(modelFiles).values({
      id: modelFileId,
      filename: "demo.gcode.3mf",
      sha256: "x".repeat(64),
      md5: "abc123abc123abc123abc123abc123ab",
      format: "old",
      plateCount: 1,
      totalWeightGrams: 250,
    });
    void printers; // schema reference for typecheck

    const { pullByPrintName } = await import("@/lib/printer-ftp-pull");
    await pullByPrintName(printerId, printId, "demo", "abc123abc123abc123abc123abc123ab");

    const updated = await db.query.prints.findFirst({ where: eq(prints.id, printId) });
    expect(updated?.modelFileId).toBe(modelFileId);
    expect(updated?.plannedWeightG).toBe(250);

    teardownTestDb();
  });
});
