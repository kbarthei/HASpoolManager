/**
 * Navigation spec — verifies every real page is reachable through the
 * ingress prefix and renders the expected data-testid marker.
 */

import { test, expect } from "@playwright/test";

const pages = [
  { path: "ingress/spools", testId: "page-spools" },
  { path: "ingress/inventory", testId: "page-inventory" },
  { path: "ingress/orders", testId: "page-orders" },
  { path: "ingress/prints", testId: "page-prints" },
  { path: "ingress/history", testId: "page-history" },
  { path: "ingress/admin", testId: "page-admin" },
  { path: "ingress/scan", testId: "page-scan" },
] as const;

test.describe("navigation", () => {
  for (const { path, testId } of pages) {
    test(`${testId} renders at /${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15_000 });
      // URL should still contain the ingress prefix (no redirect stripped it)
      expect(page.url()).toContain("ingress");
    });
  }
});
