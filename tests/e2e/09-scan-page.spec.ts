/**
 * E2e test — /scan page renders.
 */

import { test, expect } from "@playwright/test";

test.describe("scan page", () => {
  test("scan page renders with scan text", async ({ page }) => {
    await page.goto("ingress/scan");
    await expect(page.getByTestId("page-scan")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scan a Spool" })).toBeVisible();
  });
});
