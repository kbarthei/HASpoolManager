/**
 * Spools list spec — seeds two spools into the e2e DB and verifies
 * the /spools page renders them.
 */

import { test, expect } from "@playwright/test";
import { openE2eDb } from "./fixtures";
import * as schema from "@/lib/db/schema";

let vendorId: string;
let filamentId: string;
const spoolIds: string[] = [];

test.beforeAll(async () => {
  const { db, close } = openE2eDb();
  try {
    // Seed vendor
    const [v] = db
      .insert(schema.vendors)
      .values({ name: `E2eVendor_${Date.now()}` })
      .returning({ id: schema.vendors.id })
      .all();
    vendorId = v.id;

    // Seed filament
    const [f] = db
      .insert(schema.filaments)
      .values({
        vendorId,
        name: `E2eFilament_${Date.now()}`,
        material: "PLA",
        colorHex: "#00FF00",
      })
      .returning({ id: schema.filaments.id })
      .all();
    filamentId = f.id;

    // Seed two spools
    for (let i = 0; i < 2; i++) {
      const [s] = db
        .insert(schema.spools)
        .values({
          filamentId,
          initialWeight: 1000,
          remainingWeight: 800 - i * 200,
          location: "storage",
          status: "active",
        })
        .returning({ id: schema.spools.id })
        .all();
      spoolIds.push(s.id);
    }
  } finally {
    close();
  }
});

test.afterAll(async () => {
  const { db, close } = openE2eDb();
  try {
    const { inArray, eq } = await import("drizzle-orm");
    // Clean up in reverse order
    if (spoolIds.length) {
      db.delete(schema.spools)
        .where(inArray(schema.spools.id, spoolIds))
        .run();
    }
    if (filamentId) {
      db.delete(schema.filaments)
        .where(eq(schema.filaments.id, filamentId))
        .run();
    }
    if (vendorId) {
      db.delete(schema.vendors)
        .where(eq(schema.vendors.id, vendorId))
        .run();
    }
  } finally {
    close();
  }
});

test.describe("spools list", () => {
  test("renders seeded spools on /spools page", async ({ page }) => {
    await page.goto("ingress/spools");
    await expect(page.getByTestId("page-spools")).toBeVisible({ timeout: 15_000 });

    // Each spool card is a link to /spools/<uuid>. Match links whose href
    // contains "/spools/" followed by a UUID-like segment (not the nav link).
    const spoolCards = page.locator('a[href*="/spools/"][href*="-"]');
    await expect(spoolCards.first()).toBeVisible({ timeout: 10_000 });
    const count = await spoolCards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
