import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { NextRequest } from "next/server";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest, routeContext } from "../harness/request";

let printerId: string;
let printId: string;
let tempPhotoDir: string;
let originalPhotoDir: string | undefined;

beforeAll(async () => {
  await setupTestDb();
  const { makePrinter } = await import("../fixtures/seed");
  const { db } = await import("@/lib/db");
  const { prints } = await import("@/lib/db/schema");

  printerId = await makePrinter({ name: "PhotoTestPrinter" });
  const [row] = await db
    .insert(prints)
    .values({
      printerId,
      name: "photo-test.gcode",
      status: "finished",
      startedAt: new Date(),
      finishedAt: new Date(),
    })
    .returning();
  printId = row.id;
});

afterAll(() => {
  teardownTestDb();
});

beforeEach(async () => {
  tempPhotoDir = mkdtempSync(path.join(tmpdir(), "haspoolmanager-photos-"));
  originalPhotoDir = process.env.PHOTO_DIR;
  process.env.PHOTO_DIR = tempPhotoDir;
  // Reset photo_urls on the test print so each test starts clean
  const { db } = await import("@/lib/db");
  const { prints } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(prints).set({ photoUrls: null }).where(eq(prints.id, printId));
});

afterEach(() => {
  if (originalPhotoDir === undefined) delete process.env.PHOTO_DIR;
  else process.env.PHOTO_DIR = originalPhotoDir;
  rmSync(tempPhotoDir, { recursive: true, force: true });
});

function makeMultipartRequest(
  pathUrl: string,
  fileBytes: Buffer,
  mime: string,
  auth = true,
): NextRequest {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(fileBytes)], { type: mime });
  form.append("photo", blob, `test-photo.${mime === "image/png" ? "png" : "jpg"}`);
  return new NextRequest(new URL(pathUrl, "http://test.local"), {
    method: "POST",
    headers: auth ? { authorization: `Bearer ${process.env.API_SECRET_KEY ?? "test-api-key"}` } : {},
    body: form,
  });
}

function fakeJpeg(size = 512): Buffer {
  // Valid JPEG SOI header so mime-sniffer would agree, padded to size.
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  return Buffer.concat([header, Buffer.alloc(size - header.length)]);
}

describe("POST /api/v1/prints/[id]/photos", () => {
  it("uploads a JPEG user photo", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const req = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg");
    const res = await POST(req, routeContext({ id: printId }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.photo.kind).toBe("user");
    expect(body.photo.path.startsWith(`${printId}/user-`)).toBe(true);
    expect(existsSync(path.join(tempPhotoDir, body.photo.path))).toBe(true);
  });

  it("rejects oversized photos", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const tooBig = fakeJpeg(6 * 1024 * 1024);
    const req = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, tooBig, "image/jpeg");
    const res = await POST(req, routeContext({ id: printId }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("too large");
  });

  it("rejects unsupported mime types", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const req = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/gif");
    const res = await POST(req, routeContext({ id: printId }));
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const req = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg", false);
    const res = await POST(req, routeContext({ id: printId }));
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown print id", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const req = makeMultipartRequest("/api/v1/prints/unknown/photos", fakeJpeg(), "image/jpeg");
    const res = await POST(req, routeContext({ id: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(404);
  });

  it("enforces 5-user-photo limit", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    for (let i = 0; i < 5; i++) {
      const req = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg");
      const res = await POST(req, routeContext({ id: printId }));
      expect(res.status).toBe(201);
    }
    const req6 = makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg");
    const res6 = await POST(req6, routeContext({ id: printId }));
    expect(res6.status).toBe(400);
    const body = await res6.json();
    expect(body.error).toContain("limit");
  });
});

describe("GET /api/v1/prints/[id]/photos", () => {
  it("lists all stored photos for a print", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    await POST(
      makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg"),
      routeContext({ id: printId }),
    );
    const { GET } = await import("@/app/api/v1/prints/[id]/photos/route");
    const res = await GET(makeGetRequest(`/api/v1/prints/${printId}/photos`), routeContext({ id: printId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photos.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET/DELETE /api/v1/prints/[id]/photos/[filename]", () => {
  it("serves an uploaded photo with correct mime", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const uploadRes = await POST(
      makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg"),
      routeContext({ id: printId }),
    );
    const { photo } = await uploadRes.json();
    const filename = photo.path.split("/").pop() as string;

    const { GET } = await import("@/app/api/v1/prints/[id]/photos/[filename]/route");
    const res = await GET(
      makeGetRequest(`/api/v1/prints/${printId}/photos/${filename}`),
      routeContext({ id: printId, filename }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("deletes a photo by filename", async () => {
    const { POST } = await import("@/app/api/v1/prints/[id]/photos/route");
    const upload = await POST(
      makeMultipartRequest(`/api/v1/prints/${printId}/photos`, fakeJpeg(), "image/jpeg"),
      routeContext({ id: printId }),
    );
    const { photo } = await upload.json();
    const filename = photo.path.split("/").pop() as string;

    const { DELETE } = await import("@/app/api/v1/prints/[id]/photos/[filename]/route");
    const delReq = new NextRequest(
      new URL(`/api/v1/prints/${printId}/photos/${filename}`, "http://test.local"),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${process.env.API_SECRET_KEY ?? "test-api-key"}` },
      },
    );
    const delRes = await DELETE(delReq, routeContext({ id: printId, filename }));
    expect(delRes.status).toBe(200);
    expect(existsSync(path.join(tempPhotoDir, printId, filename))).toBe(false);
  });

  it("rejects path traversal in filename", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/photos/[filename]/route");
    const res = await GET(
      makeGetRequest(`/api/v1/prints/${printId}/photos/escape`),
      routeContext({ id: printId, filename: "../../etc/passwd" }),
    );
    expect(res.status).toBe(404);
  });
});
