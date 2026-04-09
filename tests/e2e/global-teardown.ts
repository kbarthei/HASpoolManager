import fs from "node:fs";
import path from "node:path";
import type { AddonStack } from "../harness/addon-stack";

const HANDLE_FILE = path.resolve(__dirname, "../tmp/e2e-stack.json");

declare global {
  // eslint-disable-next-line no-var
  var __HASPOOL_E2E_STACK__: AddonStack | undefined;
}

export default async function globalTeardown() {
  const stack = globalThis.__HASPOOL_E2E_STACK__;
  if (stack) {
    await stack.teardown();
  }
  if (fs.existsSync(HANDLE_FILE)) fs.unlinkSync(HANDLE_FILE);
}
