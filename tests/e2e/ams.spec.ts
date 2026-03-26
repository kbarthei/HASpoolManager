import { test, expect } from "@playwright/test";

test.describe("AMS Status", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ams");
  });

  test("shows AMS section with slots", async ({ page }) => {
    await expect(page.locator("text=AMS")).toBeVisible();
    // Should show loaded slot info — ABS-GF Gray is in AMS
    await expect(page.locator("text=ABS-GF").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows AMS HT section", async ({ page }) => {
    await expect(page.locator("text=AMS HT")).toBeVisible();
  });

  test("shows External section", async ({ page }) => {
    await expect(page.locator("text=External")).toBeVisible();
  });

  test("empty slots show Load button", async ({ page }) => {
    await expect(page.locator("text=Load").first()).toBeVisible();
  });
});
