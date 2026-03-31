import { test, expect } from "@playwright/test";

test.describe("Spools Inventory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/spools");
  });

  test("shows add spool button", async ({ page }) => {
    await expect(page.getByTestId("btn-add-spool")).toBeVisible({ timeout: 10000 });
  });

  test("shows spool cards in grid view", async ({ page }) => {
    // Spool cards link to detail pages
    await expect(page.locator("a[href^='/spools/']").first()).toBeVisible({ timeout: 10000 });
  });

  test("spool card links to detail page", async ({ page }) => {
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.waitFor({ timeout: 10000 });
    await firstCard.click();
    await expect(page).toHaveURL(/\/spools\/[a-f0-9-]+/);
  });
});

test.describe("Spool Detail", () => {
  test("shows spool information", async ({ page }) => {
    await page.goto("/spools");
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.waitFor({ timeout: 10000 });
    await firstCard.click();
    await expect(page.locator("text=Remaining")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Used")).toBeVisible();
    await expect(page.locator("text=Location")).toBeVisible();
  });

  test("shows usage history", async ({ page }) => {
    await page.goto("/spools");
    const firstCard = page.locator("a[href^='/spools/']").first();
    await firstCard.waitFor({ timeout: 10000 });
    await firstCard.click();
    await expect(page.locator("text=Usage History")).toBeVisible({ timeout: 10000 });
  });
});
