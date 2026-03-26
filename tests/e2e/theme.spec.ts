import { test, expect } from "@playwright/test";

test.describe("Theme", () => {
  test("page renders without errors", async ({ page }) => {
    await page.goto("/");
    // No JavaScript errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test("dark mode applies dark background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    // The html element should have the 'dark' class (applied by next-themes)
    await page.waitForTimeout(1000);
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");
  });

  test("light mode applies light background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForTimeout(1000);
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).not.toContain("dark");
  });
});
