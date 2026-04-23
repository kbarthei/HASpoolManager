/**
 * E2e — inventory page renders multiple AMS units and multiple racks.
 * Seeds two AMS units (one disabled) + two active racks; verifies
 * data-driven rendering.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const PRINTER_ID = "e2e-printer-multi";
const RACK_MAIN_ID = "e2e-rack-main";
const RACK_LAGER_ID = "e2e-rack-lager";
const UNIT_AMS1_ID = "e2e-unit-ams1";
const UNIT_AMS2_ID = "e2e-unit-ams2";
const UNIT_HT_ID = "e2e-unit-ht";

test.describe("inventory multi-AMS + multi-rack", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.printers).values({
        id: PRINTER_ID,
        name: "MultiAMS H2S",
        model: "Bambu H2S",
      }).onConflictDoNothing();

      await db.insert(schema.printerAmsUnits).values([
        {
          id: UNIT_AMS1_ID,
          printerId: PRINTER_ID,
          amsIndex: 0,
          slotType: "ams",
          haDeviceId: "dev-ams-1",
          displayName: "AMS Werkstatt",
          enabled: true,
        },
        {
          id: UNIT_AMS2_ID,
          printerId: PRINTER_ID,
          amsIndex: 2,
          slotType: "ams",
          haDeviceId: "dev-ams-2",
          displayName: "AMS Disabled",
          enabled: false,
        },
        {
          id: UNIT_HT_ID,
          printerId: PRINTER_ID,
          amsIndex: 1,
          slotType: "ams_ht",
          haDeviceId: "dev-ht",
          displayName: "AMS HT",
          enabled: true,
        },
      ]).onConflictDoNothing();

      // amsSlots for the enabled units so the printer-section renders
      const slotRows = [
        { id: "e2e-mslot-ams1-0", printerId: PRINTER_ID, slotType: "ams", amsIndex: 0, trayIndex: 0, isEmpty: true },
        { id: "e2e-mslot-ams1-1", printerId: PRINTER_ID, slotType: "ams", amsIndex: 0, trayIndex: 1, isEmpty: true },
        { id: "e2e-mslot-ams1-2", printerId: PRINTER_ID, slotType: "ams", amsIndex: 0, trayIndex: 2, isEmpty: true },
        { id: "e2e-mslot-ams1-3", printerId: PRINTER_ID, slotType: "ams", amsIndex: 0, trayIndex: 3, isEmpty: true },
        { id: "e2e-mslot-ht", printerId: PRINTER_ID, slotType: "ams_ht", amsIndex: 1, trayIndex: 0, isEmpty: true },
      ];
      await db.insert(schema.amsSlots).values(slotRows).onConflictDoNothing();

      await db.insert(schema.racks).values([
        { id: RACK_MAIN_ID, name: "Main", rows: 3, cols: 10, sortOrder: 0 },
        { id: RACK_LAGER_ID, name: "Lager Keller", rows: 2, cols: 4, sortOrder: 1 },
      ]).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("renders enabled AMS unit by displayName, hides disabled unit", async ({ page }) => {
    await page.goto(`ingress/inventory?printer=${PRINTER_ID}`);
    await expect(page.getByTestId("page-inventory")).toBeVisible({ timeout: 15_000 });

    // Enabled AMS unit shows its custom name
    await expect(page.getByText("AMS Werkstatt")).toBeVisible();

    // Disabled unit's displayName is NOT in the printer section
    await expect(page.getByText("AMS Disabled")).toHaveCount(0);
  });

  test("renders both active rack sections by name", async ({ page }) => {
    await page.goto(`ingress/inventory?printer=${PRINTER_ID}`);
    await expect(page.getByTestId("page-inventory")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId(`rack-section-${RACK_MAIN_ID}`)).toBeVisible();
    await expect(page.getByTestId(`rack-section-${RACK_LAGER_ID}`)).toBeVisible();
  });
});
