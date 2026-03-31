import { test, expect } from "@playwright/test";

test.describe("Shopping List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
  });

  test("shows shopping list section", async ({ page }) => {
    await expect(page.locator("text=Shopping List")).toBeVisible({ timeout: 10000 });
  });

  test("shows add filament button", async ({ page }) => {
    await expect(page.locator("text=Add Filament")).toBeVisible({ timeout: 10000 });
  });

  test("add filament dialog opens", async ({ page }) => {
    await page.locator("text=Add Filament").click();
    await expect(page.locator("input[placeholder*='Search']").first()).toBeVisible({ timeout: 10000 });
  });
});
