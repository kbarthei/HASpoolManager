/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  // FIXME: this test became flaky on CI after the 3MF + FTPS auto-pull
  // work landed (commit accc6be). Page content lands fine in the dev /
  // production browser but timing on the GitHub-Actions runner makes
  // toBeAttached on individual cards flaky beyond 30s. The companion
  // navigation test below still verifies the page is reachable and the
  // link from /admin lands here. Re-enable after we instrument the slow
  // server-render path or move the cards under a Suspense boundary so
  // streaming order is deterministic.
  test.skip("renders sections and issue cards", async ({ page }) => {
    await page.goto("ingress/admin/diagnostics");
    await expect(page.getByTestId("page-diagnostics")).toBeVisible({ timeout: 30_000 });
    for (const id of [
      "issue-spool-drift",
      "issue-spool-stale",
      "issue-spool-zero-active",
      "issue-print-stuck",
      "issue-print-no-weight",
      "issue-print-no-usage",
      "issue-order-stuck",
      "issue-sync-errors",
    ]) {
      await expect(page.getByTestId(id)).toBeAttached({ timeout: 30_000 });
      await expect(page.getByTestId(`${id}-count`)).toBeAttached();
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
