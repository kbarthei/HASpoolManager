/**
 * E2e test — dark mode toggle and persistence.
 */

import { test, expect } from "@playwright/test";

test.describe("dark mode", () => {
  test("page defaults to system theme and has theme class on html", async ({ page }) => {
    await page.goto("ingress/");
    // html element should have a class attribute (light or dark, set by next-themes)
    const html = page.locator("html");
    await expect(html).toHaveAttribute("class", /./);
  });

  test("dark mode applies dark background", async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("ingress/");
    await page.waitForTimeout(500);

    const html = page.locator("html");
    const classList = await html.getAttribute("class");
    expect(classList).toContain("dark");
  });

  test("light mode applies light background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("ingress/");
    await page.waitForTimeout(500);

    const html = page.locator("html");
    const classList = await html.getAttribute("class");
    expect(classList).not.toContain("dark");
  });
});
