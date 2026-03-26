import { test, expect } from "@playwright/test";

test.describe("Storage Rack", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/storage");
  });

  test("shows rack title and dimensions", async ({ page }) => {
    await expect(page.locator("text=Spool Rack")).toBeVisible();
    await expect(page.locator("text=4 × 8")).toBeVisible();
  });

  test("shows grid with row and column headers", async ({ page }) => {
    await expect(page.locator("text=R1")).toBeVisible();
    await expect(page.locator("text=S1")).toBeVisible();
  });

  test("shows occupied cells with filament info", async ({ page }) => {
    // Grid should have visible colored dots (spool cells)
    // At least some cells should be occupied
    const cells = page.locator("[style*='backgroundColor']");
    await expect(cells.first()).toBeVisible({ timeout: 10000 });
  });

  test("shows empty cells with + icon", async ({ page }) => {
    // Some cells should be empty (row 4 has empty slots)
    await expect(page.locator("text=+").first()).toBeVisible();
  });
});
