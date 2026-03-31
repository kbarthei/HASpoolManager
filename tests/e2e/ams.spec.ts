import { test, expect } from "@playwright/test";

test.describe("Inventory — Printer Slots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
  });

  test("shows printer section", async ({ page }) => {
    await expect(page.getByText("Printer").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows AMS slots", async ({ page }) => {
    await expect(page.getByText(/AMS · \d+ Slot/).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows AMS HT section", async ({ page }) => {
    await expect(page.getByText(/AMS HT/).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows External section", async ({ page }) => {
    await expect(page.getByText("External").first()).toBeVisible({ timeout: 10000 });
  });
});
