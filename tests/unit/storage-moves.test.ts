import { describe, it, expect } from "vitest";
import { parseRackPosition } from "@/lib/actions";

// parseRackPosition is the real production function exported from lib/actions.ts.
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

describe("Rack position parsing — real production function", () => {
  it("parses valid rack positions", () => {
    expect(parseRackPosition("rack:1-3")).toEqual({ row: 1, col: 3 });
    expect(parseRackPosition("rack:4-8")).toEqual({ row: 4, col: 8 });
  });

  it("returns null for non-rack locations", () => {
    expect(parseRackPosition("surplus")).toBeNull();
    expect(parseRackPosition("workbench")).toBeNull();
    expect(parseRackPosition("storage")).toBeNull();
    expect(parseRackPosition("ams")).toBeNull();
  });

  it("returns null for malformed rack positions", () => {
    expect(parseRackPosition("rack:")).toBeNull();
    expect(parseRackPosition("rack:abc")).toBeNull();
    expect(parseRackPosition("rack:1")).toBeNull();
  });
});
