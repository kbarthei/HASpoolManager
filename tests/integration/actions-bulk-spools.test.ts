import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

let filamentId: string;

beforeAll(async () => {
  await setupTestDb();
  const { makeVendor, makeFilament } = await import("../fixtures/seed");
  const vendorId = await makeVendor("BulkTestVendor");
  filamentId = await makeFilament(vendorId, {
    name: "PLA Bulk Test",
    material: "PLA",
    colorHex: "2B2B2D",
    bambuIdx: "GFA00",
  });
});

afterAll(() => {
  teardownTestDb();
});

describe("createSpoolsFromFilament — bulk add", () => {
  it("creates a single spool by default (count omitted)", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId);
    expect(result).toHaveLength(1);
    expect(result[0].filamentId).toBe(filamentId);
    expect(result[0].initialWeight).toBe(1000);
    expect(result[0].remainingWeight).toBe(1000);
    expect(result[0].location).toBe("workbench");
    expect(result[0].lotNumber).toBeNull();
  });

  it("creates N spools when count > 1", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, { count: 10 });
    expect(result).toHaveLength(10);
    const ids = new Set(result.map((r) => r.id));
    expect(ids.size).toBe(10);
    for (const s of result) {
      expect(s.filamentId).toBe(filamentId);
      expect(s.initialWeight).toBe(1000);
    }
  });

  it("applies lot-number suffix sequence when count > 1", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, {
      count: 3,
      lotNumber: "B2026Q2",
    });
    expect(result.map((r) => r.lotNumber)).toEqual([
      "B2026Q2-001",
      "B2026Q2-002",
      "B2026Q2-003",
    ]);
  });

  it("uses lot-number as-is when count == 1", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const [spool] = await createSpoolsFromFilament(filamentId, {
      count: 1,
      lotNumber: "ONE-OFF",
    });
    expect(spool.lotNumber).toBe("ONE-OFF");
  });

  it("caps count at 100", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, { count: 999 });
    expect(result).toHaveLength(100);
  });

  it("clamps count below 1 to 1", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, { count: 0 });
    expect(result).toHaveLength(1);
  });

  it("respects custom initialWeight for all generated spools", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, {
      count: 4,
      initialWeight: 250,
    });
    expect(result).toHaveLength(4);
    for (const s of result) {
      expect(s.initialWeight).toBe(250);
      expect(s.remainingWeight).toBe(250);
    }
  });

  it("pads suffix to 3 digits (e.g. 001, 010, 100)", async () => {
    const { createSpoolsFromFilament } = await import("@/lib/actions");
    const result = await createSpoolsFromFilament(filamentId, {
      count: 11,
      lotNumber: "PAD",
    });
    expect(result[0].lotNumber).toBe("PAD-001");
    expect(result[9].lotNumber).toBe("PAD-010");
    expect(result[10].lotNumber).toBe("PAD-011");
  });
});
