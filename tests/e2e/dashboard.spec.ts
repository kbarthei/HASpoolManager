import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows all stat cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("stat-active-spools")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("stat-printer")).toBeVisible();
    await expect(page.getByTestId("stat-filament-costs")).toBeVisible();
    await expect(page.getByTestId("stat-low-stock")).toBeVisible();
  });

  test("shows AMS mini view", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ams-mini-view")).toBeVisible({ timeout: 10000 });
  });

  test("shows low stock list", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("low-stock-list")).toBeVisible({ timeout: 10000 });
  });

  test("shows recent prints", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("recent-prints")).toBeVisible({ timeout: 10000 });
  });
});
