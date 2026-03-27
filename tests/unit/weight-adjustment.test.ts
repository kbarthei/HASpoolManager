import { describe, it, expect } from "vitest";

describe("Weight adjustment validation", () => {
  function validateWeight(newWeight: number, initialWeight: number): { valid: boolean; error?: string } {
    if (isNaN(newWeight)) return { valid: false, error: "Invalid number" };
    if (newWeight < 0) return { valid: false, error: "Weight cannot be negative" };
    if (newWeight > initialWeight * 1.1) return { valid: false, error: "Weight exceeds initial weight" };
    return { valid: true };
  }

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

describe("Spool status after weight change", () => {
  function getStatusForWeight(weight: number): string {
    return weight <= 0 ? "empty" : "active";
  }

  it("active when weight > 0", () => {
    expect(getStatusForWeight(500)).toBe("active");
    expect(getStatusForWeight(1)).toBe("active");
  });

  it("empty when weight is 0", () => {
    expect(getStatusForWeight(0)).toBe("empty");
  });

  it("empty when weight is negative (edge case)", () => {
    expect(getStatusForWeight(-1)).toBe("empty");
  });
});

describe("Weight rounding", () => {
  it("rounds to nearest integer", () => {
    expect(Math.round(500.4)).toBe(500);
    expect(Math.round(500.5)).toBe(501);
    expect(Math.round(500.9)).toBe(501);
  });

  it("handles floating point input", () => {
    expect(Math.round(123.456)).toBe(123);
  });
});
