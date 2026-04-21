/**
 * E2e test — /orders page renders with seeded order data.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const SHOP_ID = "e2e-shop-08";
const VENDOR_ID = "e2e-vendor-08";
const FILAMENT_ID = "e2e-filament-08";
const ORDER_ID = "e2e-order-08";
const ORDER_ITEM_ID = "e2e-order-item-08";

test.describe("orders page", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.shops).values({
        id: SHOP_ID,
        name: "E2E Shop 08",
        website: "https://example.com",
      }).onConflictDoNothing();

      await db.insert(schema.vendors).values({
        id: VENDOR_ID,
        name: "E2E Vendor 08",
      }).onConflictDoNothing();

      await db.insert(schema.filaments).values({
        id: FILAMENT_ID,
        vendorId: VENDOR_ID,
        name: "PLA Basic",
        material: "PLA",
        colorHex: "#00FF00",
      }).onConflictDoNothing();

      await db.insert(schema.orders).values({
        id: ORDER_ID,
        shopId: SHOP_ID,
        vendorId: VENDOR_ID,
        orderNumber: "E2E-ORD-001",
        orderDate: "2026-01-10",
        status: "ordered",
      }).onConflictDoNothing();

      await db.insert(schema.orderItems).values({
        id: ORDER_ITEM_ID,
        orderId: ORDER_ID,
        filamentId: FILAMENT_ID,
        quantity: 1,
        unitPrice: 24.99,
      }).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("orders page renders", async ({ page }) => {
    await page.goto("ingress/orders");
    await expect(page.getByTestId("page-orders")).toBeVisible();
  });

  test("orders page shows moved-from-admin sections (Monthly Budget + Shop Config)", async ({ page }) => {
    await page.goto("ingress/orders");
    await expect(page.getByTestId("page-orders")).toBeVisible({ timeout: 15_000 });
    // Budget settings card (previously on /admin, now in the left column)
    await expect(page.getByText("Monthly Filament Budget")).toBeVisible();
    // Add Order button in header
    await expect(page.getByTestId("btn-add-order")).toBeVisible();
  });

  test("diagnostics issue filter shows banner", async ({ page }) => {
    await page.goto("ingress/orders?issue=stuck");
    await expect(page.getByTestId("page-orders")).toBeVisible({ timeout: 15_000 });
    // Banner appears and has a Clear link back to /orders
    const banner = page.getByTestId("issue-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      /\/orders$/,
    );
  });
});
