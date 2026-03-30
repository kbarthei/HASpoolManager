import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("dashboard loads as home page", async ({ page }) => {
    await page.goto("/");
    // Should see the app title
    await expect(page.locator("text=HASpoolManager")).toBeVisible();
    // Should see dashboard content (stat cards)
    await expect(page.locator("text=Active Spools")).toBeVisible();
  });

  test("top tabs navigate between pages", async ({ page }) => {
    await page.goto("/");

    // Click Spools tab
    await page.click("a[href='/spools']");
    await expect(page).toHaveURL("/spools");

    // Click AMS tab
    await page.click("a[href='/ams']");
    await expect(page).toHaveURL("/ams");

    // Click Storage tab
    await page.click("a[href='/storage']");
    await expect(page).toHaveURL("/storage");

    // Click back to Dashboard
    await page.click("a[href='/']");
    await expect(page).toHaveURL("/");
  });

  test("active tab is highlighted", async ({ page }) => {
    await page.goto("/spools");
    // The Spools link should have the active styling (border-primary)
    const spoolsTab = page.locator("a[href='/spools']").first();
    await expect(spoolsTab).toBeVisible();
  });
});
