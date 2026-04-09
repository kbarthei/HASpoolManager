/**
 * E2e test — every page loads without hydration errors.
 *
 * Catches React hydration mismatches (#418) and other fatal console errors
 * across all routes.
 */

import { test, expect } from "@playwright/test";

const PAGES = [
  { name: "dashboard", path: "./" },
  { name: "spools", path: "ingress/spools" },
  { name: "inventory", path: "ingress/inventory" },
  { name: "orders", path: "ingress/orders" },
  { name: "prints", path: "ingress/prints" },
  { name: "history", path: "ingress/history" },
  { name: "admin", path: "ingress/admin" },
  { name: "scan", path: "ingress/scan" },
];

test.describe("hydration clean", () => {
  for (const { name, path } of PAGES) {
    test(`${name} page has zero hydration errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.goto(path);

      // Wait for hydration to settle
      await page.waitForTimeout(1000);

      // Filter out noise: favicon 404s, aborted requests
      const fatal = consoleErrors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.toLowerCase().includes("aborted") &&
          !e.includes("ERR_ABORTED"),
      );

      // Assert no fatal console errors
      expect(
        fatal,
        `unexpected console errors on /${name}:\n${fatal.join("\n")}`,
      ).toHaveLength(0);

      // Explicitly check no hydration errors
      const hydrationErrors = consoleErrors.filter(
        (e) => e.includes("Hydration") || e.includes("#418"),
      );
      expect(
        hydrationErrors,
        `hydration errors on /${name}:\n${hydrationErrors.join("\n")}`,
      ).toHaveLength(0);
    });
  }
});
