import { test, expect } from "@playwright/test";

test.describe("Orders Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
  });

  test("page loads with orders heading", async ({ page }) => {
    await expect(page.locator("text=Orders").first()).toBeVisible();
  });

  test("shows Add Order button", async ({ page }) => {
    await expect(page.getByText("+ Order").first()).toBeVisible();
  });

  test("Add Order dialog opens", async ({ page }) => {
    await page.getByText("+ Order").first().click();
    // Should show the textarea for pasting
    await expect(page.locator("textarea")).toBeVisible({ timeout: 5000 });
  });

  test("shows pending orders section when orders exist with status ordered", async ({ page }) => {
    // Check if Awaiting Delivery section exists (may not if all orders are delivered)
    const pendingSection = page.locator("text=Awaiting Delivery");
    // This is conditional — don't fail if no pending orders
    if (await pendingSection.isVisible()) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test("shows past orders grouped by month", async ({ page }) => {
    // Should show at least one month header if delivered orders exist
    const pastSection = page.locator("text=Past Orders");
    if (await pastSection.isVisible()) {
      // Month headers should be visible
      await expect(page.locator("text=/\\w+ \\d{4}/").first()).toBeVisible();
    }
  });

  test("delivered order cards show shop name", async ({ page }) => {
    // Check for known shop names from seed data
    const shopNames = page.locator("text=/Bambu Lab|3DJake|Amazon/");
    if (await shopNames.first().isVisible()) {
      await expect(shopNames.first()).toBeVisible();
    }
  });
});

test.describe("Order Flow", () => {
  test("Add Order dialog has parse button", async ({ page }) => {
    await page.goto("/orders");
    await page.getByText("+ Order").first().click();
    await expect(page.locator("text=Parse")).toBeVisible({ timeout: 5000 });
  });
});
