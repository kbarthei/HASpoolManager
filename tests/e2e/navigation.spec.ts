import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("navigates between tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-spools").click();
    await expect(page).toHaveURL("/spools");
    await page.getByTestId("nav-inventory").click();
    await expect(page).toHaveURL("/inventory");
    await page.getByTestId("nav-dashboard").click();
    await expect(page).toHaveURL("/");
  });

  test("navigates to orders page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-orders").click();
    await expect(page).toHaveURL("/orders");
  });

  test("navigates to prints page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-prints").click();
    await expect(page).toHaveURL("/prints");
  });

  test("active tab is visible on spools page", async ({ page }) => {
    await page.goto("/spools");
    await expect(page.getByTestId("nav-spools")).toBeVisible({ timeout: 10000 });
  });
});
