import { test, expect } from "@playwright/test";

test.describe("Shopping List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
  });

  test("shows shopping list section", async ({ page }) => {
    await expect(page.locator("text=Shopping List")).toBeVisible();
  });

  test("shows add filament button", async ({ page }) => {
    await expect(page.locator("text=Add Filament")).toBeVisible();
  });

  test("add filament dialog opens", async ({ page }) => {
    await page.click("text=Add Filament");
    // Should show a searchable list of filaments
    await expect(page.locator("input[placeholder*='Search']").first()).toBeVisible({ timeout: 5000 });
  });
});
