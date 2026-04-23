/**
 * E2e — admin RacksCard CRUD flows.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

const SEED_RACK_ID = "e2e-rack-admin";

test.describe("admin RacksCard", () => {
  test.beforeAll(async () => {
    const { db, close } = openE2eDb();
    try {
      await db.insert(schema.racks).values({
        id: SEED_RACK_ID,
        name: "Seeded Admin Rack",
        rows: 3,
        cols: 10,
        sortOrder: 0,
      }).onConflictDoNothing();
    } finally {
      close();
    }
  });

  test("renders the seeded rack with its name + dimensions", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId("racks-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`rack-row-${SEED_RACK_ID}`)).toBeVisible();
    await expect(page.getByText("Seeded Admin Rack")).toBeVisible();
  });

  test("'Add Rack' button opens the new-rack dialog", async ({ page }) => {
    await page.goto("ingress/admin");
    await expect(page.getByTestId("racks-card")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("add-rack-btn").click();
    await expect(page.getByTestId("new-rack-name")).toBeVisible();
    await expect(page.getByTestId("confirm-create-rack")).toBeVisible();
  });
});
