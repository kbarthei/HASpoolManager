/**
 * E2e — /admin/diagnostics page renders the live detectors and links back
 * to /admin via the breadcrumb. Covers the shipped diagnostics dashboard.
 */

import { test, expect } from "@playwright/test";

test.describe("diagnostics dashboard", () => {
  test("renders sections and issue cards", async ({ page }) => {
    await page.goto("ingress/admin/diagnostics");
    await expect(page.getByTestId("page-diagnostics")).toBeVisible({ timeout: 15_000 });

    // Section headers — disambiguate from the bottom-nav links by role.
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Spools", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prints", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sync", exact: true })).toBeVisible();

    // Cards — the 8 live detectors all render their count badge even at zero
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
      await expect(page.getByTestId(id)).toBeVisible();
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
