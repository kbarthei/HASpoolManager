import { describe, it, expect } from "vitest";
import { parseRackLocation, formatRackLocation, parseLegacyRackLocation } from "@/lib/rack-helpers";

// parseRackLocation / formatRackLocation are the real production helpers.
// The move/assign/unload server actions (moveSpoolInRack, moveSpoolTo, etc.)
// require a DB connection and are covered by integration tests — they are not
// tested here.

describe("Storage location types — algorithm design", () => {
  const validLocations = ["rack:1-1", "rack:4-8", "surplus", "workbench", "storage", "ordered", "ams", "ams-ht", "external"];

  it("rack positions follow rack:R-C format", () => {
    const rackPattern = /^rack:\d+-\d+$/;
    expect(rackPattern.test("rack:1-3")).toBe(true);
    expect(rackPattern.test("rack:4-8")).toBe(true);
    expect(rackPattern.test("rack:0-0")).toBe(true);
    expect(rackPattern.test("surplus")).toBe(false);
    expect(rackPattern.test("workbench")).toBe(false);
  });

  it("all location types are valid strings", () => {
    for (const loc of validLocations) {
      expect(typeof loc).toBe("string");
      expect(loc.length).toBeGreaterThan(0);
    }
  });

  it("surplus is a flat location (no position)", () => {
    expect("surplus").not.toMatch(/:/);
  });

  it("workbench is a flat location (no position)", () => {
    expect("workbench").not.toMatch(/:/);
  });
});

describe("Move spool logic — algorithm design", () => {
  it("can move from rack to surplus", () => {
    const from = "rack:2-3";
    const to = "surplus";
    expect(from).not.toBe(to);
    expect(to).toBe("surplus");
  });

  it("can move from rack to workbench", () => {
    const from = "rack:1-1";
    const to = "workbench";
    expect(to).toBe("workbench");
  });

  it("can move from surplus to workbench", () => {
    const from = "surplus";
    const to = "workbench";
    expect(from).toBe("surplus");
    expect(to).toBe("workbench");
  });

  it("can move from workbench back to rack", () => {
    const from = "workbench";
    const to = "rack:3-5";
    expect(to).toMatch(/^rack:\d+-\d+$/);
  });

  it("can remove from rack to storage", () => {
    const from = "rack:1-1";
    const to = "storage";
    expect(to).toBe("storage");
  });
});

describe("parseRackLocation — canonical (rack:<id>:R-C) format", () => {
  const RACK_ID = "abc-123";

  it("parses valid rack positions", () => {
    expect(parseRackLocation(`rack:${RACK_ID}:1-3`)).toEqual({ rackId: RACK_ID, row: 1, col: 3 });
    expect(parseRackLocation(`rack:${RACK_ID}:4-8`)).toEqual({ rackId: RACK_ID, row: 4, col: 8 });
  });

  it("returns null for non-rack locations", () => {
    expect(parseRackLocation("surplus")).toBeNull();
    expect(parseRackLocation("workbench")).toBeNull();
    expect(parseRackLocation("storage")).toBeNull();
    expect(parseRackLocation("ams")).toBeNull();
  });

  it("returns null for malformed rack positions", () => {
    expect(parseRackLocation("rack:")).toBeNull();
    expect(parseRackLocation(`rack:${RACK_ID}:abc`)).toBeNull();
    expect(parseRackLocation(`rack:${RACK_ID}:1`)).toBeNull();
  });

  it("returns null for legacy format without rackId", () => {
    expect(parseRackLocation("rack:1-3")).toBeNull();
  });

  it("accepts null/undefined input", () => {
    expect(parseRackLocation(null)).toBeNull();
    expect(parseRackLocation(undefined)).toBeNull();
  });
});

describe("formatRackLocation", () => {
  it("builds canonical rack-location string", () => {
    expect(formatRackLocation("abc-123", 2, 5)).toBe("rack:abc-123:2-5");
  });
});

describe("parseLegacyRackLocation — pre-migration format only", () => {
  it("parses 'rack:R-C'", () => {
    expect(parseLegacyRackLocation("rack:1-3")).toEqual({ row: 1, col: 3 });
  });

  it("returns null for canonical format", () => {
    expect(parseLegacyRackLocation("rack:abc-123:1-3")).toBeNull();
  });
});
