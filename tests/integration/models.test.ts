/**
 * Integration tests for /api/v1/models — 3MF upload, list, detail, delete,
 * cover serving, plus link-model on a print.
 *
 * Uses the per-worker SQLite harness — no dev server, no HTTP. The route
 * handlers are imported and invoked directly with NextRequest objects.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest, makeDeleteRequest, makePostRequest, routeContext } from "../harness/request";
import { eq } from "drizzle-orm";

const fixture = (name: string) => readFileSync(resolve(__dirname, "../fixtures/3mf", name));

function authHeaders(): Record<string, string> {
  const token = process.env.API_SECRET_KEY ?? "test-api-key";
  return { authorization: `Bearer ${token}` };
}

function makeUploadRequest(path: string, file: Buffer, filename: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)]), filename);
  return new (require("next/server").NextRequest)(new URL(path, "http://test.local"), {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
}

describe("/api/v1/models", () => {
  let modelDir: string;

  beforeAll(async () => {
    process.env.MODEL_FILE_DIR = resolve(__dirname, "../tmp/models");
    modelDir = process.env.MODEL_FILE_DIR;
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
    try {
      const fs = require("fs");
      fs.rmSync(modelDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(async () => {
    // Clean tables between tests so deduplication doesn't carry rows over.
    const { db } = await import("@/lib/db");
    const { modelFiles, modelFileFilaments } = await import("@/lib/db/schema");
    await db.delete(modelFileFilaments);
    await db.delete(modelFiles);
  });

  describe("POST /api/v1/models", () => {
    it("uploads new-format 3MF, returns 201, persists row + filaments", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const res = await POST(
        makeUploadRequest("/api/v1/models", fixture("new-multi-object.3mf"), "kamerahalter_nord.3mf"),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; format: string; sha256: string; platerName: string | null; coverPath: string | null };
      expect(body.format).toBe("new");
      expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(body.platerName).toBe("Router Mount");
      expect(body.coverPath).toBeTruthy();

      const { db } = await import("@/lib/db");
      const { modelFileFilaments } = await import("@/lib/db/schema");
      const fils = await db.select().from(modelFileFilaments).where(eq(modelFileFilaments.modelFileId, body.id));
      expect(fils.length).toBeGreaterThanOrEqual(4);
      expect(fils.find((f) => f.filamentType === "ASA")).toBeDefined();
    });

    it("uploads old-format 3MF, captures prediction + weight + trayInfoIdx", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const res = await POST(
        makeUploadRequest("/api/v1/models", fixture("old-format.3mf"), "old.3mf"),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { format: string; totalPredictionSeconds: number | null; totalWeightGrams: number | null };
      expect(body.format).toBe("old");
      expect(body.totalPredictionSeconds).toBeGreaterThan(0);
      expect(body.totalWeightGrams).toBeGreaterThan(0);
    });

    it("dedupes on sha256: second upload returns existing row with deduped:true", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const buf = fixture("new-single-object.3mf");

      const r1 = await POST(makeUploadRequest("/api/v1/models", buf, "x.3mf"));
      expect(r1.status).toBe(201);
      const b1 = (await r1.json()) as { id: string };

      const r2 = await POST(makeUploadRequest("/api/v1/models", buf, "y.3mf"));
      expect(r2.status).toBe(200);
      const b2 = (await r2.json()) as { id: string; deduped: boolean };
      expect(b2.deduped).toBe(true);
      expect(b2.id).toBe(b1.id);
    });

    it("accepts uploads without Bearer token (browser path)", async () => {
      // Browser-called from /models drag-drop. Auth-tier convention:
      // optionalAuth + HA-ingress / LAN-only PWA gating is the boundary.
      const { POST } = await import("@/app/api/v1/models/route");
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(fixture("new-single-object.3mf"))]), "x.3mf");
      const { NextRequest } = await import("next/server");
      const req = new NextRequest(new URL("/api/v1/models", "http://test.local"), {
        method: "POST",
        body: form,
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it("rejects upload without file field", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const form = new FormData();
      const { NextRequest } = await import("next/server");
      const req = new NextRequest(new URL("/api/v1/models", "http://test.local"), {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/models", () => {
    it("lists uploaded models in reverse-chrono order", async () => {
      const { POST, GET } = await import("@/app/api/v1/models/route");
      await POST(makeUploadRequest("/api/v1/models", fixture("old-format.3mf"), "a.3mf"));
      await POST(makeUploadRequest("/api/v1/models", fixture("new-multi-object.3mf"), "b.3mf"));

      const res = await GET(makeGetRequest("/api/v1/models"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ filename: string }>;
      expect(body.length).toBe(2);
      // Reverse-chrono: most recent first → "b.3mf"
      expect(body[0].filename).toBe("b.3mf");
    });
  });

  describe("GET /api/v1/models/[id]", () => {
    it("returns model + filaments + compatibility (matched-by trayInfoIdx)", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const { GET } = await import("@/app/api/v1/models/[id]/route");
      const upload = await POST(makeUploadRequest("/api/v1/models", fixture("old-format.3mf"), "old.3mf"));
      const m = (await upload.json()) as { id: string };

      // Seed a spool that matches the GFL99 PLA #00FF00 filament from old-format.3mf
      const { makeVendor, makeFilament, makeSpool } = await import("../fixtures/seed");
      const vendorId = await makeVendor("MatchVendor");
      const filamentId = await makeFilament(vendorId, {
        name: "MatchPLA",
        material: "PLA",
        colorHex: "#00FF00",
        bambuIdx: "GFL99",
      });
      await makeSpool(filamentId, { remainingWeight: 800 });

      const res = await GET(makeGetRequest(`/api/v1/models/${m.id}`), routeContext({ id: m.id }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        filaments: Array<{ trayInfoIdx: string | null }>;
        compatibility: Array<{ matches: Array<{ matchedBy: string }> }>;
      };
      expect(body.filaments.length).toBeGreaterThan(0);
      expect(body.compatibility.length).toBeGreaterThan(0);
      const matches = body.compatibility[0].matches;
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchedBy).toBe("trayInfoIdx");
    });

    it("returns 404 for unknown id", async () => {
      const { GET } = await import("@/app/api/v1/models/[id]/route");
      const res = await GET(makeGetRequest("/api/v1/models/nonexistent"), routeContext({ id: "nonexistent" }));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/models/[id]", () => {
    it("deletes model + cascades filaments", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const { DELETE } = await import("@/app/api/v1/models/[id]/route");
      const upload = await POST(makeUploadRequest("/api/v1/models", fixture("old-format.3mf"), "del.3mf"));
      const m = (await upload.json()) as { id: string };

      const res = await DELETE(makeDeleteRequest(`/api/v1/models/${m.id}`), routeContext({ id: m.id }));
      expect(res.status).toBe(204);

      const { db } = await import("@/lib/db");
      const { modelFileFilaments } = await import("@/lib/db/schema");
      const remaining = await db.select().from(modelFileFilaments).where(eq(modelFileFilaments.modelFileId, m.id));
      expect(remaining.length).toBe(0);
    });
  });

  describe("GET /api/v1/models/[id]/cover", () => {
    it("returns image/png bytes", async () => {
      const { POST } = await import("@/app/api/v1/models/route");
      const { GET } = await import("@/app/api/v1/models/[id]/cover/route");
      const upload = await POST(makeUploadRequest("/api/v1/models", fixture("new-multi-object.3mf"), "cov.3mf"));
      const m = (await upload.json()) as { id: string };

      const res = await GET(makeGetRequest(`/api/v1/models/${m.id}/cover`), routeContext({ id: m.id }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const blob = await res.blob();
      expect(blob.size).toBeGreaterThan(2000);
    });
  });

  describe("POST /api/v1/prints/[id]/link-model", () => {
    it("links model_file_id to a print", async () => {
      const { POST: uploadModel } = await import("@/app/api/v1/models/route");
      const upload = await uploadModel(makeUploadRequest("/api/v1/models", fixture("new-multi-object.3mf"), "link.3mf"));
      const m = (await upload.json()) as { id: string };

      const { makePrinter } = await import("../fixtures/seed");
      const printerId = await makePrinter({ name: "LinkPrinter" });

      // Create a print row directly.
      const { db } = await import("@/lib/db");
      const { prints } = await import("@/lib/db/schema");
      const printId = crypto.randomUUID();
      await db.insert(prints).values({ id: printId, printerId, status: "running" });

      const { POST } = await import("@/app/api/v1/prints/[id]/link-model/route");
      const res = await POST(
        makePostRequest(`/api/v1/prints/${printId}/link-model`, { modelFileId: m.id }),
        routeContext({ id: printId }),
      );
      expect(res.status).toBe(200);

      const updated = await db.query.prints.findFirst({ where: eq(prints.id, printId) });
      expect(updated?.modelFileId).toBe(m.id);
    });
  });
});
