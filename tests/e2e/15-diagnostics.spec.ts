/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  test("renders sections and issue cards", async ({ page }) => {
    // Root-cause: under React 19 + Next.js 16 streaming, the wrapper div
    // hits the DOM synchronously but the issue-card children arrive via
    // RSC payload chunks (<script>self.__next_f.push(...)</script>) that
    // require client-side hydration to materialise as DOM elements.
    //
    // Background pollers (sync-worker watchdog REST sensors, react-query)
    // mean `networkidle` deadlocks. Instead, wait directly on the cards'
    // DOM presence via the locator's auto-wait — Playwright will poll the
    // DOM until the element appears, bypassing the streaming gap entirely.
    await page.goto("ingress/admin/diagnostics");
    await expect(page.getByTestId("page-diagnostics")).toBeVisible({ timeout: 30_000 });

    // The first card is the canary — once it lands in DOM, all cards are
    // hydrated together (same RSC chunk). 30s soaks up CI cold-start.
    await page.locator('[data-testid="issue-spool-drift"]').waitFor({ timeout: 30_000 });
    const ids = [
      "issue-spool-drift",
      "issue-spool-stale",
      "issue-spool-zero-active",
      "issue-print-stuck",
      "issue-print-no-weight",
      "issue-print-no-usage",
      "issue-order-stuck",
      "issue-sync-errors",
    ];
    try {
      for (const id of ids) {
        await expect(page.getByTestId(id)).toBeAttached({ timeout: 15_000 });
        await expect(page.getByTestId(`${id}-count`)).toBeAttached();
      }
    } catch (err) {
      // Surface CI-only failures: dump testid presence counts + a 4KB snippet
      // around any missing testid so we can see what the page actually rendered.
      // eslint-disable-next-line no-console
      console.error("[15-diagnostics] failure — dumping page state");
      const html = await page.content();
      // eslint-disable-next-line no-console
      console.error(`[15-diagnostics] body length: ${html.length}`);
      for (const id of ids) {
        const cardHits = (html.match(new RegExp(`data-testid="${id}"`, "g")) || []).length;
        const countHits = (html.match(new RegExp(`data-testid="${id}-count"`, "g")) || []).length;
        // eslint-disable-next-line no-console
        console.error(`[15-diagnostics] ${id}: card=${cardHits} count=${countHits}`);
      }
      // Find the first missing testid and dump its expected location context.
      for (const id of ids) {
        const idx = html.indexOf(`data-testid="${id}"`);
        if (idx === -1) {
          // eslint-disable-next-line no-console
          console.error(`[15-diagnostics] FIRST MISSING: ${id}. HTML around end of stream:`);
          // eslint-disable-next-line no-console
          console.error(html.slice(Math.max(0, html.length - 2000)));
          break;
        }
      }
      throw err;
    }
  });

  test("admin links to diagnostics", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId("page-admin")).toBeVisible({ timeout: 15_000 });

    const link = page.getByTestId("admin-diagnostics-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /\/admin\/diagnostics$/);
  });
});
