import { describe, it, expect } from "vitest";
import { budgetPeriodFor } from "@/lib/budget";

describe("budgetPeriodFor", () => {
  it("returns calendar-month window when startDay=1", () => {
    const now = new Date(Date.UTC(2026, 3, 17)); // 17 Apr 2026 UTC
    const { start, end } = budgetPeriodFor(now, 1);
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(end.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("rolls period on chosen startDay mid-month — current period", () => {
    const now = new Date(Date.UTC(2026, 3, 17)); // 17 Apr
    const { start, end } = budgetPeriodFor(now, 15);
    // 17 >= 15 → period started 15 Apr, ends 15 May
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-15");
    expect(end.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("rolls back a month when today is before the startDay", () => {
    const now = new Date(Date.UTC(2026, 3, 10)); // 10 Apr
    const { start, end } = budgetPeriodFor(now, 15);
    // 10 < 15 → period started 15 Mar, ends 15 Apr
    expect(start.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(end.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("clamps startDay to 1-28", () => {
    const now = new Date(Date.UTC(2026, 3, 17)); // 17 Apr
    // startDay=0 → clamped to 1 → period covers Apr 1 – May 1
    expect(budgetPeriodFor(now, 0).start.toISOString().slice(0, 10)).toBe("2026-04-01");
    // startDay=31 → clamped to 28 → since 17 < 28, period rolls back to 28 Mar
    expect(budgetPeriodFor(now, 31).start.toISOString().slice(0, 10)).toBe("2026-03-28");
  });
});
