/**
 * End-to-end test of the FTP-pull pipeline against an in-process mock Bambu
 * printer. Spins up `ftp-srv` with implicit TLS + a self-signed cert, drops
 * fixtures into its cache/ directory, then exercises the full
 * `pullByPrintName` → parse → DB-insert → link-to-print path.
 *
 * No external network needed — the mock binds to 127.0.0.1 on a random port.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";

import FtpSrv from "ftp-srv";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/3mf");
const ACCESS_CODE = "12345678";

let ftpServer: { listen: () => Promise<unknown>; close: () => Promise<unknown>; on: (event: string, cb: (...args: unknown[]) => void) => void } | null = null;
let ftpPort = 0;
let mockRoot = "";

async function startMock(): Promise<void> {
  mockRoot = mkdtempSync(path.join(tmpdir(), "haspoolmanager-ftp-test-"));
  const cache = path.join(mockRoot, "cache");
  mkdirSync(cache, { recursive: true });

  const fixtures = ["old-format.3mf", "new-multi-object.3mf", "new-single-object.3mf"];
  for (const f of fixtures) {
    copyFileSync(path.join(FIXTURE_DIR, f), path.join(cache, f.replace(/\.3mf$/, ".gcode.3mf")));
  }

  const certDir = path.join(mockRoot, "tls");
  mkdirSync(certDir, { recursive: true });
  const keyPath = path.join(certDir, "key.pem");
  const certPath = path.join(certDir, "cert.pem");
  if (!existsSync(certPath)) {
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath, "-days", "1", "-nodes", "-subj", "/CN=mock"],
      { stdio: "ignore" },
    );
  }

  ftpPort = 9000 + Math.floor(Math.random() * 999);
  const tls = { key: readFileSync(keyPath), cert: readFileSync(certPath) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ftpServer = new (FtpSrv as any)({
    url: `ftps://0.0.0.0:${ftpPort}`,
    tls,
    pasv_url: "127.0.0.1",
    anonymous: false,
  });

  ftpServer!.on(
    "login",
    (
      ...args: unknown[]
    ) => {
      const [{ username, password }, resolve, reject] = args as [
        { username: string; password: string },
        (cfg: { root: string }) => void,
        (err: Error) => void,
      ];
      if (username !== "bblp" || password !== ACCESS_CODE) {
        reject(new Error("530 incorrect"));
        return;
      }
      resolve({ root: mockRoot });
    },
  );

  await ftpServer!.listen();
}

async function stopMock(): Promise<void> {
  if (ftpServer) {
    await ftpServer.close();
    ftpServer = null;
  }
}

describe("printer FTP pull (live mock)", () => {
  let printerId: string;

  beforeAll(async () => {
    process.env.MODEL_FILE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "haspoolmanager-models-")));
    await setupTestDb();
    await startMock();
  }, 30_000);

  afterAll(async () => {
    await stopMock();
    teardownTestDb();
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { modelFiles, modelFileFilaments, prints, printers, syncLog } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");
    // Toggle foreign keys off for cleanup — multiple tables reference
    // printers (amsSlots, printerAmsUnits, hmsEvents, syncLog) and the
    // ftp-pull pipeline now writes diagnostic rows that linger across tests.
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    await db.delete(modelFileFilaments);
    await db.delete(modelFiles);
    await db.delete(prints);
    await db.delete(syncLog);
    await db.delete(printers);
    await db.run(sql`PRAGMA foreign_keys = ON`);

    const { makePrinter } = await import("../fixtures/seed");
    printerId = await makePrinter({ name: "MockPrinter" });
    await db
      .update(printers)
      .set({ ipAddress: "127.0.0.1", accessCode: ACCESS_CODE })
      .where(eq(printers.id, printerId));
  });

  it("testFtpConnection succeeds with valid credentials", async () => {
    const { testFtpConnection } = await import("@/lib/printer-ftp");
    const result = await testFtpConnection({ host: "127.0.0.1", port: ftpPort, accessCode: ACCESS_CODE });
    expect(result.ok).toBe(true);
    expect(result.step).toBe("done");
    expect(result.fileCount).toBe(3);
  });

  it("testFtpConnection reports login error with wrong code", async () => {
    const { testFtpConnection } = await import("@/lib/printer-ftp");
    const result = await testFtpConnection({ host: "127.0.0.1", port: ftpPort, accessCode: "99999999" });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("login");
  });

  it("listCache3mfs returns three files sorted by mtime desc", async () => {
    const { listCache3mfs } = await import("@/lib/printer-ftp");
    const list = await listCache3mfs({ host: "127.0.0.1", port: ftpPort, accessCode: ACCESS_CODE });
    expect(list).toHaveLength(3);
    expect(list[0].name).toMatch(/\.gcode\.3mf$/);
  });

  it("downloadCacheFile fetches a 3MF intact", async () => {
    const { downloadCacheFile } = await import("@/lib/printer-ftp");
    const buffer = await downloadCacheFile(
      { host: "127.0.0.1", port: ftpPort, accessCode: ACCESS_CODE },
      "old-format.gcode.3mf",
    );
    expect(buffer.byteLength).toBeGreaterThan(500_000);
    // ZIP magic bytes — confirms it's a valid 3MF
    expect(buffer.slice(0, 4).toString("hex")).toBe("504b0304");
  });

  it("pullByPrintName falls back to newest cache file when print_name has no token signal", async () => {
    // Reproduces the live-bug case: Bambu Studio sends the slicer-process
    // preset (e.g. "0.2mm layer, 2 walls, 15% infill") as MQTT print_name
    // when the user prints without a saved project. Token-overlap then
    // scores 0 against every cached filename. The fallback should pull
    // the newest file (mtime within 5 min) and link it to the print.
    const prevPort = process.env.PRINTER_FTP_PORT_OVERRIDE;
    process.env.PRINTER_FTP_PORT_OVERRIDE = String(ftpPort);
    try {
      const { db } = await import("@/lib/db");
      const { prints, syncLog } = await import("@/lib/db/schema");
      const printId = crypto.randomUUID();
      await db.insert(prints).values({ id: printId, printerId, status: "running" });

      const { pullByPrintName } = await import("@/lib/printer-ftp-pull");
      await pullByPrintName(printerId, printId, "0.2mm layer, 2 walls, 15% infill", null);

      const updated = await db.query.prints.findFirst({ where: eq(prints.id, printId) });
      expect(updated?.modelFileId).toBeTruthy();

      // sync_log should contain the structured fallback-newest event
      const events = await db.query.syncLog.findMany({
        where: eq(syncLog.printTransition, "ftp-pull"),
      });
      const eventNames = events
        .map((e) => (e.responseJson ? JSON.parse(e.responseJson).event : null))
        .filter(Boolean);
      expect(eventNames).toContain("fallback-newest");
      expect(eventNames).toContain("post-pull");
    } finally {
      if (prevPort === undefined) delete process.env.PRINTER_FTP_PORT_OVERRIDE;
      else process.env.PRINTER_FTP_PORT_OVERRIDE = prevPort;
    }
  });

  it("pullByPrintName performs full pipeline: list → download → parse → DB insert → link to print", async () => {
    // pullByPrintName builds an FtpConfig using printer.ipAddress + port 990.
    // We override the port via the env variable PRINTER_FTP_PORT_OVERRIDE, which
    // the helper reads when present (test-only knob, off in prod).
    const prevPort = process.env.PRINTER_FTP_PORT_OVERRIDE;
    process.env.PRINTER_FTP_PORT_OVERRIDE = String(ftpPort);
    try {
      const { db } = await import("@/lib/db");
      const { prints, modelFiles } = await import("@/lib/db/schema");
      const printId = crypto.randomUUID();
      await db.insert(prints).values({ id: printId, printerId, status: "running" });

      const { pullByPrintName } = await import("@/lib/printer-ftp-pull");
      // print_name "old-format" → matches old-format.gcode.3mf in the cache
      await pullByPrintName(printerId, printId, "old-format", null);

      const updated = await db.query.prints.findFirst({ where: eq(prints.id, printId) });
      expect(updated?.modelFileId).toBeTruthy();
      expect(updated?.plannedWeightG).toBeGreaterThan(0); // old-format has weight (Full mode)

      const persisted = await db.query.modelFiles.findFirst({ where: eq(modelFiles.id, updated!.modelFileId!) });
      expect(persisted?.format).toBe("old");
      expect(persisted?.uploadedVia).toBe("ftp");
      expect(persisted?.md5).toMatch(/^[0-9a-f]{32}$/);
      expect(persisted?.totalPredictionSeconds).toBeGreaterThan(0);
    } finally {
      if (prevPort === undefined) delete process.env.PRINTER_FTP_PORT_OVERRIDE;
      else process.env.PRINTER_FTP_PORT_OVERRIDE = prevPort;
    }
  });
});
