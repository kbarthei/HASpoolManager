import { defineConfig } from "@playwright/test";

/**
 * The stack (Next.js standalone + nginx container + ingress simulator) is
 * started in tests/e2e/global-setup.ts. baseURL is computed from the
 * ingress simulator's bound port and passed via the E2E_BASE_URL env var.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker — the stack is a shared singleton
  reporter: process.env.CI ? "list" : "html",
  timeout: 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080/api/hassio_ingress/e2etoken",
    trace: "on-first-retry",
    browserName: "chromium",
  },
});
