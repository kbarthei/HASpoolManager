/**
 * E2e test — /analytics page renders and is reachable from the top-tabs nav.
 */

import { test, expect } from "@playwright/test";

test.describe("analytics page", () => {
  test("renders with page-analytics testid", async ({ page }) => {
    await page.goto("ingress/analytics");
    await expect(page.getByTestId("page-analytics")).toBeVisible();
  });

  test("is reachable via the top-tabs nav on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
    await page.getByTestId("nav-analytics").click();
    await expect(page.getByTestId("page-analytics")).toBeVisible();
    await expect(page).toHaveURL(/\/analytics$/);
  });
});
