/**
 * E2e test — /inventory page renders with seeded data.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const VENDOR_ID = "e2e-vendor-10";
const FILAMENT_ID = "e2e-filament-10";
const SPOOL_ID = "e2e-spool-10";
const PRINTER_ID = "e2e-printer-10";

test.describe("inventory page", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.vendors).values({
        id: VENDOR_ID,
        name: "E2E Vendor 10",
      }).onConflictDoNothing();

      await db.insert(schema.filaments).values({
        id: FILAMENT_ID,
        vendorId: VENDOR_ID,
        name: "PETG Strong",
        material: "PETG",
        colorHex: "#0000FF",
      }).onConflictDoNothing();

      await db.insert(schema.spools).values({
        id: SPOOL_ID,
        filamentId: FILAMENT_ID,
        status: "active",
      }).onConflictDoNothing();

      await db.insert(schema.printers).values({
        id: PRINTER_ID,
        name: "E2E Printer 10",
        model: "Bambu H2S",
        amsCount: 1,
      }).onConflictDoNothing();

      // Create AMS slots for the printer
      await db.insert(schema.amsSlots).values([
        {
          id: "e2e-slot-10-0",
          printerId: PRINTER_ID,
          slotType: "ams",
          amsIndex: 0,
          trayIndex: 0,
          isEmpty: true,
        },
        {
          id: "e2e-slot-10-1",
          printerId: PRINTER_ID,
          slotType: "ams",
          amsIndex: 0,
          trayIndex: 1,
          isEmpty: true,
        },
        {
          id: "e2e-slot-10-2",
          printerId: PRINTER_ID,
          slotType: "ams",
          amsIndex: 0,
          trayIndex: 2,
          isEmpty: true,
        },
        {
          id: "e2e-slot-10-3",
          printerId: PRINTER_ID,
          slotType: "ams",
          amsIndex: 0,
          trayIndex: 3,
          isEmpty: true,
        },
      ]).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("inventory page renders", async ({ page }) => {
    await page.goto("ingress/inventory");
    await expect(page.getByTestId("page-inventory")).toBeVisible();
  });
});
