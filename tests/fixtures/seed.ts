/**
 * Test fixtures: factory functions for seeding test data.
 * All factories return the created record's ID.
 * Always call cleanup() in afterAll to remove test data.
 */

import { db } from "@/lib/db";
import {
  vendors,
  filaments,
  spools,
  tagMappings,
  prints,
  printUsage,
} from "@/lib/db/schema";
import { eq, inArray, sql, like } from "drizzle-orm";

// ── Vendors ──────────────────────────────────────────────────────────────────

export async function makeVendor(name = `TestVendor_${Date.now()}`): Promise<string> {
  const [row] = await db
    .insert(vendors)
    .values({ name })
    .returning({ id: vendors.id });
  return row.id;
}

// ── Filaments ─────────────────────────────────────────────────────────────────

export async function makeFilament(
  vendorId: string,
  overrides: {
    name?: string;
    material?: string;
    colorHex?: string;
    bambuIdx?: string;
  } = {}
): Promise<string> {
  const ts = Date.now();
  const [row] = await db
    .insert(filaments)
    .values({
      vendorId,
      name: overrides.name ?? `TestFilament_${ts}`,
      material: overrides.material ?? "PLA",
      colorHex: overrides.colorHex ?? "FFFFFF",
      bambuIdx: overrides.bambuIdx ?? null,
      spoolWeight: 1000,
    })
    .returning({ id: filaments.id });
  return row.id;
}

// ── Spools ────────────────────────────────────────────────────────────────────

export async function makeSpool(
  filamentId: string,
  overrides: {
    location?: string;
    remainingWeight?: number;
    initialWeight?: number;
    status?: string;
    purchasePrice?: number;
  } = {}
): Promise<string> {
  const [row] = await db
    .insert(spools)
    .values({
      filamentId,
      initialWeight: overrides.initialWeight ?? 1000,
      remainingWeight: overrides.remainingWeight ?? 1000,
      location: overrides.location ?? "storage",
      status: overrides.status ?? "active",
      purchasePrice: overrides.purchasePrice ?? null,
    })
    .returning({ id: spools.id });
  return row.id;
}

// ── Tag Mappings ──────────────────────────────────────────────────────────────

export async function makeTagMapping(spoolId: string, tagUid: string): Promise<string> {
  const [row] = await db
    .insert(tagMappings)
    .values({ tagUid, spoolId, source: "bambu" })
    .returning({ id: tagMappings.id });
  return row.id;
}

// ── Stale test data cleanup (call at START of tests) ──────────────────────────

/**
 * Clean up any leftover test data from previous crashed runs.
 * Call this in beforeAll to ensure a clean state.
 */
export async function cleanupStaleTestData(): Promise<void> {
  // Delete test prints (by name or event ID pattern)
  const stalePrints = await db
    .select({ id: prints.id })
    .from(prints)
    .where(sql`${prints.name} LIKE 'test-%' OR ${prints.name} = 'Integration Test Print' OR ${prints.haEventId} LIKE 'test_%' OR ${prints.haEventId} LIKE 'sync_%_test-%'`);

  if (stalePrints.length > 0) {
    const ids = stalePrints.map((p) => p.id);
    await db.delete(printUsage).where(inArray(printUsage.printId, ids)).catch(() => {});
    await db.delete(prints).where(inArray(prints.id, ids)).catch(() => {});
  }

  // Delete test vendors/filaments/spools (by name pattern)
  const staleVendors = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(like(vendors.name, "TestVendor_%"));
  if (staleVendors.length > 0) {
    const vids = staleVendors.map((v) => v.id);
    // Find filaments for these vendors
    const staleFils = await db.select({ id: filaments.id }).from(filaments).where(inArray(filaments.vendorId, vids));
    if (staleFils.length > 0) {
      const fids = staleFils.map((f) => f.id);
      const staleSpools = await db.select({ id: spools.id }).from(spools).where(inArray(spools.filamentId, fids));
      if (staleSpools.length > 0) {
        const sids = staleSpools.map((s) => s.id);
        await db.delete(tagMappings).where(inArray(tagMappings.spoolId, sids)).catch(() => {});
        await db.delete(spools).where(inArray(spools.id, sids)).catch(() => {});
      }
      await db.delete(filaments).where(inArray(filaments.id, fids)).catch(() => {});
    }
    await db.delete(vendors).where(inArray(vendors.id, vids)).catch(() => {});
  }

  // Delete auto-created spools from integration test E3/E4 runs.
  // These are created under "Bambu Lab" / "Unknown" vendors with test-specific material names
  // and persist across runs, causing fuzzy-match false positives in subsequent test runs.
  const staleTestFilaments = await db
    .select({ id: filaments.id })
    .from(filaments)
    .where(sql`${filaments.material} LIKE 'TPU_TEST_E3%' OR ${filaments.material} LIKE 'DRAFT_E4_%'`);
  if (staleTestFilaments.length > 0) {
    const fids = staleTestFilaments.map((f) => f.id);
    const staleSpools = await db.select({ id: spools.id }).from(spools).where(inArray(spools.filamentId, fids));
    if (staleSpools.length > 0) {
      const sids = staleSpools.map((s) => s.id);
      await db.delete(tagMappings).where(inArray(tagMappings.spoolId, sids)).catch(() => {});
      await db.delete(spools).where(inArray(spools.id, sids)).catch(() => {});
    }
    await db.delete(filaments).where(inArray(filaments.id, fids)).catch(() => {});
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export async function cleanup(ids: {
  vendors?: string[];
  filaments?: string[];
  spools?: string[];
  prints?: string[];
  tagMappings?: string[];
}): Promise<void> {
  // Order matters: delete child records before parents

  if (ids.prints?.length) {
    // printUsage cascades on print delete, but delete explicitly to be safe
    await db
      .delete(printUsage)
      .where(inArray(printUsage.printId, ids.prints))
      .catch(() => {});
    await db.delete(prints).where(inArray(prints.id, ids.prints)).catch(() => {});
  }

  if (ids.tagMappings?.length) {
    await db
      .delete(tagMappings)
      .where(inArray(tagMappings.id, ids.tagMappings))
      .catch(() => {});
  }

  if (ids.spools?.length) {
    // Remove tag_mappings that reference these spools (cascade should handle it,
    // but be explicit so the test doesn't fail if cascade isn't configured)
    await db
      .delete(tagMappings)
      .where(inArray(tagMappings.spoolId, ids.spools))
      .catch(() => {});
    await db.delete(spools).where(inArray(spools.id, ids.spools)).catch(() => {});
  }

  if (ids.filaments?.length) {
    await db
      .delete(filaments)
      .where(inArray(filaments.id, ids.filaments))
      .catch(() => {});
  }

  if (ids.vendors?.length) {
    await db
      .delete(vendors)
      .where(inArray(vendors.id, ids.vendors))
      .catch(() => {});
  }
}
