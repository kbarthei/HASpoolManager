import { test, expect } from "@playwright/test";

test.describe("Spools Inventory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/spools");
  });

  test("shows spool cards in grid view", async ({ page }) => {
    // Should show multiple spool cards
    // Look for known filament names from seed data
    await expect(page.locator("text=HF Dark Gray").first()).toBeVisible();
  });

  test("can switch to list view", async ({ page }) => {
    // Find and click the list view toggle button
    const toggleButtons = page.locator("button").filter({ has: page.locator("svg") });
    await toggleButtons.last().click();
    // After switching, should see a table or different layout
  });

  test("spool card links to detail page", async ({ page }) => {
    // Click on a spool card
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.click();
    // Should navigate to spool detail
    await expect(page).toHaveURL(/\/spools\/[a-f0-9-]+/);
  });
});

test.describe("Spool Detail", () => {
  test("shows spool information", async ({ page }) => {
    // Go to spools list first
    await page.goto("/spools");
    // Click first spool
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.click();

    // Should show detail page with spool info
    await expect(page.locator("text=Remaining")).toBeVisible();
    await expect(page.locator("text=Used")).toBeVisible();
    await expect(page.locator("text=Cost/g")).toBeVisible();
    await expect(page.locator("text=Location")).toBeVisible();
  });

  test("shows usage history", async ({ page }) => {
    await page.goto("/spools");
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.click();

    await expect(page.locator("text=Usage History")).toBeVisible();
  });
});
