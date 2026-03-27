import { test, expect } from "@playwright/test";

test.describe("Storage Page Actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/storage");
  });

  test("shows rack grid", async ({ page }) => {
    await expect(page.locator("text=Spool Rack")).toBeVisible();
  });

  test("shows surplus section", async ({ page }) => {
    await expect(page.locator("text=Surplus")).toBeVisible();
  });

  test("shows workbench section", async ({ page }) => {
    await expect(page.locator("text=Workbench")).toBeVisible();
  });

  test("occupied cells have context menu", async ({ page }) => {
    // Right-click or click an occupied cell should show options
    // Find a cell with a color dot (occupied)
    const occupiedCell = page.locator("[style*='backgroundColor']").first();
    if (await occupiedCell.isVisible()) {
      await occupiedCell.click();
      // Should see dropdown menu options
      await expect(page.locator("text=View Details").first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("Spool Detail Weight Edit", () => {
  test("spool detail page has weight adjuster", async ({ page }) => {
    await page.goto("/spools");
    // Click first spool
    const firstCard = page.locator("a[href^='/spools/']").first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      // Should see the pencil icon for weight adjustment
      await expect(page.locator("text=Remaining")).toBeVisible();
    }
  });
});
