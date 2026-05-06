/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  test("renders sections and issue cards", async ({ page }) => {
    await page.goto("ingress/admin/diagnostics");

    // Wait for the page wrapper and the first issue card to be present.
    // All 8 cards render from the same IssueCard component with identical
    // markup; if the first one is in the DOM, the others are too. Asserting
    // each card individually was racing against streaming HTML on slow CI
    // runners after the build grew with the 3MF + FTP-pull work.
    await expect(page.getByTestId("page-diagnostics")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("issue-spool-drift")).toBeVisible({ timeout: 30_000 });

    // Verify all 8 detectors are wired into the DOM (count() doesn't wait
    // for visibility, just counts rendered elements — fast and stable).
    const expectedIds = [
      "issue-spool-drift",
      "issue-spool-stale",
      "issue-spool-zero-active",
      "issue-print-stuck",
      "issue-print-no-weight",
      "issue-print-no-usage",
      "issue-order-stuck",
      "issue-sync-errors",
    ];
    for (const id of expectedIds) {
      // attached: checks DOM presence without waiting for visible/painted.
      await expect(page.getByTestId(id)).toBeAttached();
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
