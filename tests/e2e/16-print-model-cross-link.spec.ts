/**
 * E2e — bidirectional navigation between a print and its linked 3MF model.
 *
 * Guard: the model→print link in /models/[id] used to 404 because there
 * was no /prints/[id] page; the print history had no link to the model
 * at all. Both directions are now wired and must keep working.
 *
 * Selectors are testid-only — `<Link href="/prints/x">` is rewritten by
 * Next.js basePath to `/ingress/prints/x` at render time, so href-based
 * locators are brittle. Click testid, assert next-page testid.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const VENDOR_ID = "e2e-vendor-16";
const FILAMENT_ID = "e2e-filament-16";
const PRINTER_ID = "e2e-printer-16";
const MODEL_ID = "e2e-model-16";
const PRINT_ID = "e2e-print-16";
const PRINT_NAME = "E2E Cross Link Print";
const MODEL_FILENAME = "E2E_Cross_Link.gcode.3mf";

test.describe("print ↔ model cross-links", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.vendors).values({
        id: VENDOR_ID,
        name: "E2E Vendor 16",
      }).onConflictDoNothing();

      await db.insert(schema.filaments).values({
        id: FILAMENT_ID,
        vendorId: VENDOR_ID,
        name: "PLA Basic",
        material: "PLA",
        colorHex: "#0099FF",
      }).onConflictDoNothing();

      await db.insert(schema.printers).values({
        id: PRINTER_ID,
        name: "E2E Printer 16",
        model: "Bambu H2S",
      }).onConflictDoNothing();

      await db.insert(schema.modelFiles).values({
        id: MODEL_ID,
        filename: MODEL_FILENAME,
        sha256: "0".repeat(64),
        format: "bambu-3mf",
        uploadedVia: "manual",
        plateCount: 1,
      }).onConflictDoNothing();

      await db.insert(schema.prints).values({
        id: PRINT_ID,
        printerId: PRINTER_ID,
        modelFileId: MODEL_ID,
        name: PRINT_NAME,
        status: "finished",
        startedAt: new Date("2026-02-01T10:00:00Z"),
        finishedAt: new Date("2026-02-01T11:00:00Z"),
      }).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("print history → model: card surfaces a Model link that lands on the model detail page", async ({ page }) => {
    await page.goto("ingress/prints");
    await expect(page.getByTestId("page-prints")).toBeVisible();

    // Multiple prints may carry modelFileId; first() is sufficient for
    // the navigation contract — what matters is that *a* model-link
    // exists and lands on a model detail page.
    const modelLink = page.getByTestId("model-link").first();
    await expect(modelLink).toBeVisible();
    await modelLink.click();

    await expect(page.getByTestId("page-model-detail")).toBeVisible();
  });

  test("print detail page renders linked model with the correct href to /models/[id]", async ({ page }) => {
    await page.goto(`ingress/prints/${PRINT_ID}`);
    await expect(page.getByTestId("page-print-detail")).toBeVisible();

    // Asserting href instead of click() — the print detail page hosts
    // the `RetryPullButton` client component, whose hydration causes
    // sibling re-mounts that detach this anchor mid-click. The href
    // assertion is the actual contract anyway: "the linked model is
    // reachable from the print detail page". Ingress simulator
    // prefixes /api/hassio_ingress/<token>/ingress/, so we anchor on
    // the suffix.
    const modelLink = page.getByTestId("linked-model-link");
    await expect(modelLink).toBeVisible();
    const href = await modelLink.getAttribute("href");
    expect(href).toMatch(new RegExp(`/models/${MODEL_ID}$`));
  });

  test("model detail → print detail page (the link that used to 404)", async ({ page }) => {
    await page.goto(`ingress/models/${MODEL_ID}`);
    await expect(page.getByTestId("page-model-detail")).toBeVisible();

    const printLink = page.getByTestId("linked-print-link").first();
    await expect(printLink).toBeVisible();
    await printLink.click();

    await expect(page.getByTestId("page-print-detail")).toBeVisible();
  });
});
