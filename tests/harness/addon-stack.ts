/**
 * End-to-end test harness: builds the HA addon artifact, then starts a
 * realistic stack on the host so Playwright can exercise the whole ingress
 * path.
 *
 *   Playwright browser
 *         │
 *         ▼
 *   Ingress simulator (Node.js)          http://127.0.0.1:<ingressPort>
 *         │  (strips session prefix, sets X-Ingress-Path)
 *         ▼
 *   nginx alpine container               http://127.0.0.1:3000
 *         │  (host.docker.internal via --network host;
 *         │   real nginx.conf from ha-addon/haspoolmanager/)
 *         ▼
 *   Next.js standalone server            http://127.0.0.1:3001
 *         │  (HA_ADDON=true, basePath=/ingress, SQLITE_PATH=tests/tmp/e2e.db)
 *         ▼
 *   SQLite file                          tests/tmp/e2e.db
 *
 * The SQLite file is the one Playwright fixtures seed against (via
 * better-sqlite3 directly), so tests and the server share data through the
 * file system.
 */

import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import net from "node:net";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/db/schema";
import {
  startIngressSimulator,
  type IngressSimulator,
} from "./ingress-simulator";

const REPO_ROOT = path.resolve(__dirname, "../..");
const ADDON_DIR = path.join(REPO_ROOT, "ha-addon", "haspoolmanager");
const STAGING_APP = "/tmp/haspool-addon-build/haspoolmanager/app";
const MIGRATIONS_DIR = path.join(REPO_ROOT, "lib", "db", "migrations");
const TMP_DIR = path.join(REPO_ROOT, "tests", "tmp");
const E2E_DB_PATH = path.join(TMP_DIR, "e2e.db");
const NGINX_CONTAINER_NAME = "haspoolmanager-e2e-nginx";
const API_KEY = "e2e-test-api-key";

const NEXT_PORT = 3002;
const NGINX_PORT = 3000;

export type AddonStack = {
  /** Full URL including the ingress session prefix, ready for Playwright baseURL */
  baseUrl: string;
  /** Path to the test DB file — fixtures open this with better-sqlite3 */
  dbPath: string;
  /** Bearer token that passes the server's requireAuth() checks */
  apiKey: string;
  /** Stops everything and cleans up. Safe to call multiple times. */
  teardown: () => Promise<void>;
};

function waitForPort(host: string, port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.createConnection(port, host);
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

function ensureDockerAvailable(): void {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "Docker is not available. Start OrbStack / Docker Desktop before running e2e tests.",
    );
  }
}

function ensureAddonBuilt(): void {
  const tarballPath = path.join(path.dirname(STAGING_APP), "app.tar.gz");

  if (!fs.existsSync(path.join(STAGING_APP, "server.js"))) {
    if (!fs.existsSync(tarballPath)) {
      console.log("[e2e] building HA addon artifact (first run)…");
      execFileSync("bash", [path.join("ha-addon", "build-addon.sh")], {
        cwd: REPO_ROOT,
        stdio: "inherit",
      });
    }
    // build-addon.sh packs app/ into app.tar.gz and removes app/ to keep the
    // outer tarball small (a HA-side BuildKit workaround). For e2e we need
    // the unpacked app/ so node can run server.js — so we extract it here.
    if (fs.existsSync(tarballPath)) {
      console.log("[e2e] extracting app.tar.gz into staging…");
      fs.mkdirSync(STAGING_APP, { recursive: true });
      execFileSync("tar", ["-xzf", tarballPath, "-C", STAGING_APP], {
        stdio: "inherit",
      });
    }
  } else {
    console.log("[e2e] reusing cached addon staging at", STAGING_APP);
  }
  if (!fs.existsSync(path.join(STAGING_APP, "server.js"))) {
    throw new Error("addon staging missing server.js after build");
  }
}

function createFreshTestDb(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = E2E_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const sqlite = new Database(E2E_DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  sqlite.close();
}

function stopExistingNginxContainer(): void {
  try {
    execFileSync("docker", ["rm", "-f", NGINX_CONTAINER_NAME], { stdio: "ignore" });
  } catch {
    /* container not running — fine */
  }
}

function startNginxContainer(): void {
  stopExistingNginxContainer();
  const confPath = path.join(ADDON_DIR, "nginx.conf");
  if (!fs.existsSync(confPath)) throw new Error(`nginx.conf missing at ${confPath}`);

  // --network host lets nginx reach the Next.js server on 127.0.0.1:3001
  // (matches production where they're co-located inside the addon container).
  // The nginx.conf expects /run/nginx/ to exist for the pid file, so we
  // create it before exec'ing nginx.
  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    NGINX_CONTAINER_NAME,
    "--network",
    "host",
    "-v",
    `${confPath}:/etc/nginx/nginx.conf:ro`,
    "nginx:alpine",
    "sh",
    "-c",
    "mkdir -p /run/nginx && exec nginx -g 'daemon off;'",
  ];
  execFileSync("docker", args, { stdio: "ignore" });
}

export async function startAddonStack(): Promise<AddonStack> {
  ensureDockerAvailable();
  ensureAddonBuilt();
  createFreshTestDb();

  // ── 1. Next.js standalone ────────────────────────────────────────────────
  console.log("[e2e] spawning Next.js standalone on :" + NEXT_PORT);
  const nextProc: ChildProcess = spawn("node", ["server.js"], {
    cwd: STAGING_APP,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HA_ADDON: "true",
      PORT: String(NEXT_PORT),
      HOSTNAME: "127.0.0.1",
      SQLITE_PATH: E2E_DB_PATH,
      API_SECRET_KEY: API_KEY,
      // Make sure nothing from the user's .env.local leaks into the server.
      // Keep ANTHROPIC_API_KEY if present so AI features don't crash loudly.
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextProc.stdout?.on("data", (b) => process.stderr.write("[next] " + b));
  nextProc.stderr?.on("data", (b) => process.stderr.write("[next] " + b));
  nextProc.on("exit", (code) => {
    if (code !== null && code !== 0) console.error(`[e2e] next exited ${code}`);
  });

  await waitForPort("127.0.0.1", NEXT_PORT, 20000);

  // ── 2. nginx container ───────────────────────────────────────────────────
  console.log("[e2e] starting nginx container on :" + NGINX_PORT);
  startNginxContainer();
  await waitForPort("127.0.0.1", NGINX_PORT, 10000);

  // ── 3. Ingress simulator ─────────────────────────────────────────────────
  console.log("[e2e] starting ingress simulator");
  const ingress: IngressSimulator = await startIngressSimulator({
    upstreamHost: "127.0.0.1",
    upstreamPort: NGINX_PORT,
  });
  console.log("[e2e] baseUrl =", ingress.baseUrl);

  let torn = false;
  return {
    baseUrl: ingress.baseUrl,
    dbPath: E2E_DB_PATH,
    apiKey: API_KEY,
    async teardown() {
      if (torn) return;
      torn = true;
      await ingress.close().catch(() => {});
      stopExistingNginxContainer();
      if (!nextProc.killed) {
        nextProc.kill("SIGTERM");
        // Give the process a moment, then SIGKILL if it didn't exit
        await new Promise((r) => setTimeout(r, 500));
        if (!nextProc.killed) nextProc.kill("SIGKILL");
      }
    },
  };
}
