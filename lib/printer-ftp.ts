/**
 * FTPS client for Bambu Lab printers (P1S/X1C/A1/H2 series).
 *
 * Bambu's networking plugin is closed-source, but the protocol has been
 * fully reverse-engineered by ClusterM/open-bambu-networking and
 * BambuTools/bambulabs_api. The wire-level details:
 *
 *   - **Implicit FTPS** on TCP port 990 (TLS from byte 0, NOT explicit AUTH-TLS)
 *   - Username `bblp`, password = printer Access Code (8-digit, from LCD)
 *   - Self-signed cert → `rejectUnauthorized: false`
 *   - Bambu firmware does NOT implement MLSD; only LIST works
 *   - Cache directory: `cache/<filename>.gcode.3mf`
 *   - File transfer: streaming RETR
 *
 * `basic-ftp` 5.x supports implicit TLS via `secure: "implicit"` since 5.0
 * but the typing requires the workaround below — pre-connect a TLS socket
 * and inject it. This pattern is documented across multiple Bambu projects.
 */

import * as net from "net";
import { Client as FtpClient } from "basic-ftp";
import { Writable } from "stream";

export interface FtpConfig {
  host: string;
  accessCode: string;
  port?: number; // default 990
  connectTimeoutMs?: number; // default 5000
  ioTimeoutMs?: number; // default 60000
}

export interface CacheEntry {
  name: string;
  /** Directory the file lives in on the printer's FTPS server. P1S/X1C/A1 use
   *  `cache/`; H2S keeps them in `/` (root). Empty string == root. */
  dir: string;
  size: number;
  modifiedAt?: Date;
}

const DEFAULT_PORT = 990;
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_IO_TIMEOUT_MS = 60_000;

/**
 * Probe whether the FTPS port is reachable. Returns true if a TCP handshake
 * completes within the timeout. Does NOT do TLS — used as a pre-flight check
 * to fail fast when the printer is offline / different LAN / firewalled.
 */
export async function probeReachable(host: string, port = DEFAULT_PORT, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

/**
 * Run an authenticated session against the printer's FTPS server. The session
 * runs in a try/finally so the connection is always closed, even on errors
 * mid-list / mid-download.
 */
export async function withFtpSession<T>(
  config: FtpConfig,
  fn: (client: FtpClient) => Promise<T>,
): Promise<T> {
  const port = config.port ?? DEFAULT_PORT;
  const ioTimeoutMs = config.ioTimeoutMs ?? DEFAULT_IO_TIMEOUT_MS;

  const client = new FtpClient(ioTimeoutMs);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.host,
      port,
      user: "bblp",
      password: config.accessCode,
      // "implicit" = TLS from byte 0 (port 990 default). Bambu firmware
      // does not implement explicit AUTH-TLS, only implicit.
      secure: "implicit",
      // Bambu uses a self-signed cert; chain validation always fails.
      secureOptions: { rejectUnauthorized: false },
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

/**
 * List `.3mf` files on the printer. Searches both `cache/` (P1S/X1C/A1
 * convention) and `/` (H2S convention) so the caller doesn't need to know
 * which firmware family we're talking to.
 *
 * Each entry carries its `dir` so subsequent `downloadCacheFile()` calls
 * know which path to RETR from.
 */
export async function listCache3mfs(config: FtpConfig): Promise<CacheEntry[]> {
  return withFtpSession(config, async (client) => {
    const out: CacheEntry[] = [];
    for (const dir of ["cache", ""]) {
      try {
        const list = await client.list(dir || ".");
        for (const f of list) {
          if (!f.isFile) continue;
          if (!f.name.toLowerCase().endsWith(".3mf")) continue;
          out.push({ name: f.name, dir, size: f.size, modifiedAt: f.modifiedAt });
        }
      } catch {
        // Directory doesn't exist or no permission — try the next one.
      }
    }
    // Sort newest first when mtime is available; fall back to name.
    out.sort((a, b) => {
      const aT = a.modifiedAt?.getTime() ?? 0;
      const bT = b.modifiedAt?.getTime() ?? 0;
      if (aT !== bT) return bT - aT;
      return a.name.localeCompare(b.name);
    });
    return out;
  });
}

/**
 * Download a single 3MF into a memory Buffer. Pass the same `dir` that
 * `listCache3mfs` returned for this entry — empty string means root.
 *
 * Risk: 3MFs can be 100+ MB. Caller should validate the entry's `size`
 * before calling — silently buffering large files on a memory-constrained
 * HA host is bad citizen behavior.
 */
export async function downloadCacheFile(
  config: FtpConfig,
  filename: string,
  options: { dir?: string; maxBytes?: number } = {},
): Promise<Buffer> {
  if (!isSafeFilename(filename)) {
    throw new Error(`Refusing unsafe filename: ${filename}`);
  }
  const dir = options.dir ?? "cache";
  const maxBytes = options.maxBytes ?? 200 * 1024 * 1024;
  const remotePath = dir ? `${dir}/${filename}` : filename;

  return withFtpSession(config, async (client) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const collector = new Writable({
      write(chunk, _enc, cb) {
        const buf = Buffer.from(chunk);
        totalBytes += buf.byteLength;
        if (totalBytes > maxBytes) {
          cb(new Error(`File exceeds maxBytes (${maxBytes}B) — aborting download`));
          return;
        }
        chunks.push(buf);
        cb();
      },
    });
    await client.downloadTo(collector, remotePath);
    return Buffer.concat(chunks);
  });
}

/**
 * Test the credentials end-to-end: probe → TLS handshake → login → list.
 * Used by the "Test connection" button on the admin printer card. Returns a
 * structured success/failure shape so the UI can render an actionable message.
 */
export interface FtpTestResult {
  ok: boolean;
  step: "probe" | "tls" | "login" | "list" | "done";
  error?: string;
  fileCount?: number;
}

export async function testFtpConnection(config: FtpConfig): Promise<FtpTestResult> {
  const port = config.port ?? DEFAULT_PORT;
  const reachable = await probeReachable(config.host, port, 3000);
  if (!reachable) {
    return {
      ok: false,
      step: "probe",
      error: `Port ${port} not reachable on ${config.host}. Printer offline or different LAN.`,
    };
  }

  try {
    // Try `cache/` (P1S/X1C/A1) AND root (`/`, H2S). Sum the .3mf counts
    // from both so the user sees total reachable files regardless of
    // which firmware family this printer runs.
    const result = await withFtpSession(config, async (client) => {
      let count = 0;
      for (const dir of ["cache", "."]) {
        try {
          const list = await client.list(dir);
          count += list.filter((f) => f.isFile && f.name.endsWith(".3mf")).length;
        } catch {
          // dir missing — that's fine, try the next
        }
      }
      return count;
    });
    return { ok: true, step: "done", fileCount: result };
  } catch (err) {
    const msg = (err as Error).message;
    if (/login|530|incorrect|denied/i.test(msg)) {
      return { ok: false, step: "login", error: "Wrong access code. Check Drucker-LCD → Settings → WLAN → Access Code." };
    }
    if (/tls|cert|secure/i.test(msg)) {
      return { ok: false, step: "tls", error: msg };
    }
    return { ok: false, step: "list", error: msg };
  }
}

function isSafeFilename(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..") && name.length > 0 && name.length < 256;
}
