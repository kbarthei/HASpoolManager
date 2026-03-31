import { test, expect } from "@playwright/test";

test.describe("Storage Rack", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
  });

  test("shows rack title and dimensions", async ({ page }) => {
    await expect(page.getByText("Spool Rack")).toBeVisible({ timeout: 10000 });
    // Dimensions are configurable — just check the format exists
    await expect(page.getByText(/\d+ × \d+/).first()).toBeVisible();
  });

  test("shows grid with row and column headers", async ({ page }) => {
    await expect(page.getByText("R1").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("S1").first()).toBeVisible();
  });

  test("shows cells in grid", async ({ page }) => {
    // Grid should have cells — either occupied (with spool info) or empty (with +)
    await expect(page.getByText("+").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows surplus section", async ({ page }) => {
    await expect(page.getByText("Surplus").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows workbench section", async ({ page }) => {
    await expect(page.getByText("Workbench").first()).toBeVisible({ timeout: 10000 });
  });
});
