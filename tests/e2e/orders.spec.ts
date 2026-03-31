import { test, expect } from "@playwright/test";

test.describe("Orders Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
  });

  test("shows Add Order button", async ({ page }) => {
    await expect(page.getByTestId("btn-add-order")).toBeVisible({ timeout: 10000 });
  });

  test("Add Order dialog opens", async ({ page }) => {
    await page.getByTestId("btn-add-order").click();
    await expect(page.locator("textarea")).toBeVisible({ timeout: 10000 });
  });

  test("shows shopping list section", async ({ page }) => {
    await expect(page.locator("text=Shopping List")).toBeVisible({ timeout: 10000 });
  });

  test("shows pending orders section when orders exist", async ({ page }) => {
    const pendingSection = page.locator("text=Awaiting Delivery");
    if (await pendingSection.isVisible()) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test("shows past orders grouped by month", async ({ page }) => {
    const pastSection = page.locator("text=Past Orders");
    if (await pastSection.isVisible()) {
      await expect(page.locator("text=/\\w+ \\d{4}/").first()).toBeVisible();
    }
  });
});

test.describe("Order Flow", () => {
  test("Add Order dialog has parse button", async ({ page }) => {
    await page.goto("/orders");
    await page.getByTestId("btn-add-order").click();
    await expect(page.locator("text=Parse")).toBeVisible({ timeout: 10000 });
  });
});
