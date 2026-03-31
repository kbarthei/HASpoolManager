import { test, expect } from "@playwright/test";

test.describe("Inventory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
  });

  test("shows printer section with slots", async ({ page }) => {
    await expect(page.getByTestId("printer-section")).toBeVisible({ timeout: 10000 });
  });

  test("shows rack section with grid", async ({ page }) => {
    await expect(page.getByTestId("rack-section")).toBeVisible({ timeout: 10000 });
  });

  test("shows surplus section", async ({ page }) => {
    await expect(page.getByTestId("surplus-section")).toBeVisible({ timeout: 10000 });
  });

  test("shows workbench section", async ({ page }) => {
    await expect(page.getByTestId("workbench-section")).toBeVisible({ timeout: 10000 });
  });
});
