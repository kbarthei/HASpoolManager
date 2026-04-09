/**
 * Ingress asset loads spec — navigates to root and verifies no static
 * assets return 404. Catches broken basePath / sub_filter rewrites.
 */

import { test, expect } from "@playwright/test";

test.describe("ingress asset loads", () => {
  test("no 404 responses on static assets", async ({ page }) => {
    const failed: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      if (response.status() === 404) {
        failed.push({ url: response.url(), status: 404 });
      }
    });

    await page.goto("./");
    // Wait for hydration and lazy chunks to settle
    await page.waitForLoadState("networkidle");

    // Filter out known-harmless ABORTED RSC prefetches (Next.js cancels
    // speculative prefetch requests, which may show as 404 in some cases)
    const real404s = failed.filter(
      (r) =>
        !r.url.includes("_rsc") &&
        !r.url.includes(".rsc") &&
        !r.url.endsWith("favicon.ico"),
    );

    expect(
      real404s,
      `Got ${real404s.length} unexpected 404(s):\n${real404s.map((r) => r.url).join("\n")}`,
    ).toHaveLength(0);
  });
});
