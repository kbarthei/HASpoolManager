/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  test("renders sections and issue cards", async ({ page }) => {
    await page.goto("ingress/admin/diagnostics");

    // Use a generous timeout on the page-load anchor — CI builds with many
    // routes can take a while to render the first paint when this is the
    // first request to /admin/diagnostics in the run.
    await expect(page.getByTestId("page-diagnostics")).toBeVisible({ timeout: 30_000 });

    // The 8 live detectors are the contract of this page — assert their
    // testid anchors directly. Dropped the section-heading-text assertions
    // because they're brittle against translation changes and rendering
    // races on slow CI runners (the testids are the stable contract).
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
      await expect(page.getByTestId(id)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(`${id}-count`)).toBeVisible();
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
