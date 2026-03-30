import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows stat cards with data", async ({ page }) => {
    await expect(page.locator("text=Active Spools")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Printer")).toBeVisible();
    await expect(page.locator("text=Filament Costs")).toBeVisible();
    await expect(page.getByText("Low Stock").first()).toBeVisible();
  });

  test("shows AMS status section", async ({ page }) => {
    await expect(page.getByText("AMS Status")).toBeVisible({ timeout: 10000 });
  });

  test("shows recent prints section", async ({ page }) => {
    await expect(page.getByText("Recent Prints")).toBeVisible({ timeout: 10000 });
  });
});
