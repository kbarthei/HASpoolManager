/**
 * E2e test — /prints and /history pages render with seeded data.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const VENDOR_ID = "e2e-vendor-06";
const FILAMENT_ID = "e2e-filament-06";
const SPOOL_ID = "e2e-spool-06";
const PRINTER_ID = "e2e-printer-06";
const PRINT_ID = "e2e-print-06";
const PRINT_NAME = "E2E Benchy Test";

test.describe("prints & history pages", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      // Seed in dependency order
      await db.insert(schema.vendors).values({
        id: VENDOR_ID,
        name: "E2E Vendor 06",
      }).onConflictDoNothing();

      await db.insert(schema.filaments).values({
        id: FILAMENT_ID,
        vendorId: VENDOR_ID,
        name: "PLA Basic",
        material: "PLA",
        colorHex: "#FF0000",
      }).onConflictDoNothing();

      await db.insert(schema.spools).values({
        id: SPOOL_ID,
        filamentId: FILAMENT_ID,
        status: "active",
      }).onConflictDoNothing();

      await db.insert(schema.printers).values({
        id: PRINTER_ID,
        name: "E2E Printer",
        model: "Bambu H2S",
      }).onConflictDoNothing();

      await db.insert(schema.prints).values({
        id: PRINT_ID,
        printerId: PRINTER_ID,
        name: PRINT_NAME,
        status: "finished",
        startedAt: new Date("2026-01-15T10:00:00Z"),
        finishedAt: new Date("2026-01-15T12:00:00Z"),
      }).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("prints page renders with print name visible", async ({ page }) => {
    await page.goto("ingress/prints");
    await expect(page.getByTestId("page-prints")).toBeVisible();
    await expect(page.getByText(PRINT_NAME)).toBeVisible();
  });

  test("history page renders", async ({ page }) => {
    await page.goto("ingress/history");
    await expect(page.getByTestId("page-history")).toBeVisible();
  });
});
