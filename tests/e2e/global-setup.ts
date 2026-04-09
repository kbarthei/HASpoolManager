/**
 * Playwright global setup — starts the full addon stack once per run.
 *
 * We store the baseUrl and a handle to teardown in a JSON file so the
 * teardown script can find it, since Playwright's globalSetup and
 * globalTeardown run in separate Node processes.
 *
 * The stack itself (Next.js standalone + nginx container + ingress
 * simulator) is started here and kept alive until teardown. Because they
 * live in the same Node process as globalSetup, we keep a reference on a
 * module-level global so teardown can reach back in.
 */

import fs from "node:fs";
import path from "node:path";
import { startAddonStack, type AddonStack } from "../harness/addon-stack";

const HANDLE_FILE = path.resolve(__dirname, "../tmp/e2e-stack.json");

// Stored on a process global so teardown (which runs in the same Node
// process as setup in current Playwright versions) can reach the handle.
declare global {
  // eslint-disable-next-line no-var
  var __HASPOOL_E2E_STACK__: AddonStack | undefined;
}

export default async function globalSetup() {
  const stack = await startAddonStack();
  globalThis.__HASPOOL_E2E_STACK__ = stack;

  fs.mkdirSync(path.dirname(HANDLE_FILE), { recursive: true });
  fs.writeFileSync(
    HANDLE_FILE,
    JSON.stringify({ baseUrl: stack.baseUrl, dbPath: stack.dbPath, apiKey: stack.apiKey }),
  );

  // Expose for playwright.config.ts to read via env var
  process.env.E2E_BASE_URL = stack.baseUrl;
  process.env.E2E_DB_PATH = stack.dbPath;
  process.env.E2E_API_KEY = stack.apiKey;
}
