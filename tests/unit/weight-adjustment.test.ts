import { describe, it, expect } from "vitest";
import { validateWeight, getSpoolStatusForWeight } from "@/lib/validations";

// validateWeight and getSpoolStatusForWeight are pure functions extracted from
// the adjustSpoolWeight() server action in lib/actions.ts. They mirror the
// exact validation and status logic used in production.

describe("Weight adjustment validation — real production function", () => {
  it("accepts valid weight within range", () => {
    expect(validateWeight(500, 1000).valid).toBe(true);
    expect(validateWeight(0, 1000).valid).toBe(true);
    expect(validateWeight(1000, 1000).valid).toBe(true);
  });

  it("rejects negative weight", () => {
    const result = validateWeight(-10, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("negative");
  });

  it("rejects NaN", () => {
    expect(validateWeight(NaN, 1000).valid).toBe(false);
  });

  it("rejects weight significantly over initial", () => {
    const result = validateWeight(1500, 1000);
    expect(result.valid).toBe(false);
  });

  it("allows small overage (within 10%)", () => {
    expect(validateWeight(1050, 1000).valid).toBe(true);
  });

  it("zero weight is valid (empty spool)", () => {
    expect(validateWeight(0, 1000).valid).toBe(true);
  });
});

describe("Spool status after weight change — real production function", () => {
  it("active when weight > 0", () => {
    expect(getSpoolStatusForWeight(500)).toBe("active");
    expect(getSpoolStatusForWeight(1)).toBe("active");
  });

  it("empty when weight is 0", () => {
    expect(getSpoolStatusForWeight(0)).toBe("empty");
  });

  it("empty when weight is negative (edge case)", () => {
    expect(getSpoolStatusForWeight(-1)).toBe("empty");
  });
});

describe("Weight rounding — algorithm design", () => {
  // Math.round is used directly in adjustSpoolWeight() — no wrapper to extract.
  it("rounds to nearest integer", () => {
    expect(Math.round(500.4)).toBe(500);
    expect(Math.round(500.5)).toBe(501);
    expect(Math.round(500.9)).toBe(501);
  });

  it("handles floating point input", () => {
    expect(Math.round(123.456)).toBe(123);
  });
});
