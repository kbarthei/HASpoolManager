/**
 * E2e smoke test — proves the whole stack (Next.js standalone + nginx
 * container with real nginx.conf + ingress simulator) works end-to-end.
 *
 * If this passes, it means:
 *   - next build worked with HA_ADDON=true (basePath=/ingress)
 *   - nginx.conf's sub_filter rewrites inject the HA session prefix
 *   - Next.js hydrates cleanly behind the ingress prefix
 *   - The ingress simulator correctly strips the session prefix
 *   - SQLite connects inside the standalone server
 */

import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("home page renders with stat cards and no hydration errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("./");
    await expect(page).toHaveTitle(/HASpoolManager|Spool|Filament/i);

    // Dashboard stat cards grid
    await expect(page.getByTestId("dashboard-stats")).toBeVisible();

    // At least one stat card inside it
    await expect(page.getByTestId("stat-active-spools")).toBeVisible();

    // Filter out noise we don't care about — 404s for optional resources, etc.
    const fatal = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.toLowerCase().includes("aborted") &&
        !e.includes("ERR_ABORTED"),
    );
    expect(fatal, `unexpected console errors:\n${fatal.join("\n")}`).toHaveLength(0);
  });

  test("health endpoint is reachable through nginx + ingress", async ({ request }) => {
    const res = await request.get("api/v1/health");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
  });
});
