import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows stat cards with data", async ({ page }) => {
    await expect(page.locator("text=Active Spools")).toBeVisible();
    await expect(page.locator("text=Printer")).toBeVisible();
    await expect(page.locator("text=This Month")).toBeVisible();
    await expect(page.locator("text=Low Stock")).toBeVisible();
  });

  test("shows AMS status section", async ({ page }) => {
    await expect(page.locator("text=AMS Status")).toBeVisible();
  });

  test("shows low stock section", async ({ page }) => {
    await expect(page.locator("text=Low Stock").first()).toBeVisible();
  });

  test("shows recent prints section", async ({ page }) => {
    await expect(page.locator("text=Recent Prints")).toBeVisible();
  });
});
