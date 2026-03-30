import { test, expect } from "@playwright/test";

test.describe("AMS Status", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
  });

  test("shows AMS section with slots", async ({ page }) => {
    await expect(page.locator("text=AMS Slots").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows AMS HT section", async ({ page }) => {
    await expect(page.locator("text=AMS HT").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows External section", async ({ page }) => {
    await expect(page.locator("text=EXTERNAL").first()).toBeVisible({ timeout: 10000 });
  });

  test("empty slots show Load button", async ({ page }) => {
    await expect(page.locator("text=Load").first()).toBeVisible({ timeout: 10000 });
  });
});
