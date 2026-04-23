/**
 * E2e — admin AmsUnitsCard renders and exposes toggle/rename controls.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const PRINTER_ID = "e2e-printer-amsadmin";
const UNIT_ID = "e2e-unit-amsadmin-1";

test.describe("admin AmsUnitsCard", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.printers).values({
        id: PRINTER_ID,
        name: "AmsAdmin H2S",
        model: "Bambu H2S",
      }).onConflictDoNothing();
      await db.insert(schema.printerAmsUnits).values({
        id: UNIT_ID,
        printerId: PRINTER_ID,
        amsIndex: 0,
        slotType: "ams",
        haDeviceId: "dev-ams-admin",
        displayName: "AMS Studio",
        enabled: true,
      }).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("renders the seeded AMS unit row", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId(`ams-units-card-${PRINTER_ID}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`ams-unit-row-${UNIT_ID}`)).toBeVisible();
    await expect(page.getByText("AMS Studio")).toBeVisible();
  });

  test("toggle switch is present and reports enabled state", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId(`ams-units-card-${PRINTER_ID}`)).toBeVisible({ timeout: 15_000 });
    const toggle = page.getByTestId(`toggle-ams-${UNIT_ID}`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
