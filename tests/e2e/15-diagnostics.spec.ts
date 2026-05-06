/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  test("renders sections and issue cards", async ({ page }) => {
    // Each detector now runs under Promise.allSettled with per-detector
    // timing logging in lib/diagnostics.ts:getAllDiagnostics. A single
    // slow/failing detector falls back to count=0 instead of cascading
    // a render failure across the page. CI wall time should be sub-second.
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
      await expect(page.getByTestId(id)).toBeAttached({ timeout: 15_000 });
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
