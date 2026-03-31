import { test, expect } from "@playwright/test";

test.describe("Theme", () => {
  test("page renders without JavaScript errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 10000 });
    expect(errors).toHaveLength(0);
  });

  test("dark mode applies dark class", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 10000 });
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");
  });

  test("light mode does not apply dark class", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.getByTestId("dashboard-stats")).toBeVisible({ timeout: 10000 });
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).not.toContain("dark");
  });
});
