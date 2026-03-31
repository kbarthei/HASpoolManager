import { test, expect } from "@playwright/test";

test.describe("Shopping List", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
  });

  test("shows shopping list section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible({ timeout: 10000 });
  });

  test("shows add filament button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Add Filament" })).toBeVisible({ timeout: 10000 });
  });

  test("add filament dialog opens", async ({ page }) => {
    await page.getByRole("button", { name: "Add Filament" }).click();
    await expect(page.locator("input[placeholder*='Search']").first()).toBeVisible({ timeout: 10000 });
  });
});
