import { describe, it, expect } from "vitest";
import { sqlNowMinusHours } from "@/lib/db/sql-helpers";

// sqlNowMinusHours uses sql.raw() to interpolate the hour count, which
// bypasses Drizzle's parameter binding. The integer-coercion guard is the
// only thing preventing injection if a user-controlled value ever reaches
// this helper. These tests pin that guard.
describe("sqlNowMinusHours", () => {
  function rendered(hours: number): string {
    // Drizzle SQL chunks expose their raw pieces via .queryChunks; the
    // simplest robust assertion is to stringify and look for the injected
    // integer. We build the SQL and inspect its serialised form.
    const chunk = sqlNowMinusHours(hours);
    return JSON.stringify(chunk);
  }

  it("interpolates a plain positive integer", () => {
    expect(rendered(72)).toContain("72");
  });

  it("floors a fractional value to an integer", () => {
    const s = rendered(1.9);
    expect(s).toContain("1");
    expect(s).not.toContain("1.9");
  });

  it("clamps negatives to zero", () => {
    expect(rendered(-5)).toContain("0");
  });

  it("never emits a SQL-injection payload even if coerced from a hostile number-like", () => {
    // Number("1; DROP TABLE x") is NaN → floor(NaN) is NaN → Number.isFinite
    // is false → throws. We assert it throws rather than emitting anything.
    // (Callers are all typed `number`, but defense-in-depth.)
    expect(() => sqlNowMinusHours(Number("1; DROP TABLE x") as number)).toThrow();
  });

  it("throws on NaN", () => {
    expect(() => sqlNowMinusHours(NaN)).toThrow();
  });
});
