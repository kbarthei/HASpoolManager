/**
 * E2e test — key pages render correctly at mobile viewport (375×667, iPhone SE).
 * Checks: no horizontal scroll, key elements visible, bottom nav present.
 */

import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const PAGES = [
  // Dashboard uses "./" (relative) because the ingress simulator's baseURL
  // already includes the session prefix; "ingress/..." is only needed for
  // sub-pages whose path doesn't start at the root. See 01-smoke.spec.ts.
  { name: "dashboard", path: "./", testId: "page-dashboard" },
  { name: "inventory", path: "ingress/inventory", testId: "page-inventory" },
  { name: "orders", path: "ingress/orders", testId: "page-orders" },
  { name: "prints", path: "ingress/prints", testId: "page-prints" },
  { name: "history", path: "ingress/history", testId: "page-history" },
];

test.describe("mobile viewport", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  for (const { name, path, testId } of PAGES) {
    test(`${name} page renders at 375×667 without horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 10000 });

      // Check no horizontal scrollbar (body width should not exceed viewport)
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 1); // +1 for rounding

      // Bottom nav should be visible on mobile
      const bottomNav = page.locator("nav");
      const navCount = await bottomNav.count();
      expect(navCount).toBeGreaterThan(0);
    });
  }
});
