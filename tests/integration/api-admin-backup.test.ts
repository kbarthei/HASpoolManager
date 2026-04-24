import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { setupTestDb, testDbPath } from "../harness/sqlite-db";
import { makeGetRequest, makePostRequest, routeContext } from "../harness/request";

let tempBackupDir: string;
let originalBackupDir: string | undefined;

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(() => {
  tempBackupDir = mkdtempSync(path.join(tmpdir(), "haspoolmanager-backup-"));
  originalBackupDir = process.env.BACKUP_DIR;
  process.env.BACKUP_DIR = tempBackupDir;
});

afterEach(() => {
  if (originalBackupDir === undefined) {
    delete process.env.BACKUP_DIR;
  } else {
    process.env.BACKUP_DIR = originalBackupDir;
  }
  rmSync(tempBackupDir, { recursive: true, force: true });
});

describe("POST/GET /api/v1/admin/backup", () => {
  it("GET returns empty list when no backups exist", async () => {
    const { GET } = await import("@/app/api/v1/admin/backup/route");
    const res = await GET(makeGetRequest("/api/v1/admin/backup"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backups).toEqual([]);
    expect(body.retentionDays).toBeGreaterThan(0);
  });

  it("POST creates a backup and GET lists it", async () => {
    const { POST, GET } = await import("@/app/api/v1/admin/backup/route");
    const postRes = await POST(makePostRequest("/api/v1/admin/backup", {}));
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.filename).toMatch(/^haspoolmanager-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.gz$/);
    expect(postBody.size).toBeGreaterThan(0);
    expect(existsSync(path.join(tempBackupDir, postBody.filename))).toBe(true);

    const getRes = await GET(makeGetRequest("/api/v1/admin/backup"));
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.backups).toHaveLength(1);
    expect(getBody.backups[0].filename).toBe(postBody.filename);
    expect(getBody.backups[0].size).toBe(postBody.size);
  });

  it("POST without auth is rejected", async () => {
    const { POST } = await import("@/app/api/v1/admin/backup/route");
    const res = await POST(makePostRequest("/api/v1/admin/backup", {}, false));
    expect(res.status).toBe(401);
  });

  it("gzipped backup is smaller than raw DB", async () => {
    const { POST } = await import("@/app/api/v1/admin/backup/route");
    const res = await POST(makePostRequest("/api/v1/admin/backup", {}));
    const body = await res.json();
    const filePath = path.join(tempBackupDir, body.filename);
    const gzSize = statSync(filePath).size;
    const rawSize = statSync(testDbPath()).size;
    expect(gzSize).toBeLessThan(rawSize);
  });
});

describe("GET /api/v1/admin/backup/[filename]", () => {
  it("downloads a backup file with gzip content-type", async () => {
    const backupModule = await import("@/app/api/v1/admin/backup/route");
    const postRes = await backupModule.POST(makePostRequest("/api/v1/admin/backup", {}));
    const { filename } = await postRes.json();

    const { GET } = await import("@/app/api/v1/admin/backup/[filename]/route");
    const res = await GET(makeGetRequest(`/api/v1/admin/backup/${filename}`), routeContext({ filename }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(res.headers.get("content-disposition")).toContain(filename);
  });

  it("rejects path traversal attempts", async () => {
    const { GET } = await import("@/app/api/v1/admin/backup/[filename]/route");
    const res = await GET(
      makeGetRequest("/api/v1/admin/backup/path-traversal"),
      routeContext({ filename: "../../etc/passwd" }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-backup filenames", async () => {
    const { GET } = await import("@/app/api/v1/admin/backup/[filename]/route");
    const res = await GET(
      makeGetRequest("/api/v1/admin/backup/random.txt"),
      routeContext({ filename: "random.txt" }),
    );
    expect(res.status).toBe(404);
  });
});
