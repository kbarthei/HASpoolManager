/**
 * Admin config spec — verifies the /admin page renders key sections.
 */

import { test, expect } from "@playwright/test";

test.describe("admin config", () => {
  test("admin page shows expected sections", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId("page-admin")).toBeVisible({ timeout: 15_000 });

    // DB provider
    await expect(page.getByText("SQLite")).toBeVisible();

    // HA integration section
    await expect(page.getByText("Home Assistant Integration")).toBeVisible();

    // AI integration section
    await expect(page.getByText("AI Integration")).toBeVisible();
  });
});
