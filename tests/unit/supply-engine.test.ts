import { describe, it, expect } from "vitest";
import {
  calculateConsumptionRate,
  daysUntilEmpty,
  calculateReorderPoint,
  classifyFilament,
  stddev,
  determineUrgency,
  recommendOrderQty,
  type DailyConsumption,
} from "@/lib/supply-engine";

// ── calculateConsumptionRate ────────────────────────────────────────────────

describe("calculateConsumptionRate()", () => {
  it("returns zero for empty stats", () => {
    const result = calculateConsumptionRate([]);
    expect(result.avgGramsPerDay).toBe(0);
    expect(result.trend).toBe("stable");
    expect(result.confidence).toBe(0);
  });

  it("calculates EMA from daily data", () => {
    const stats: DailyConsumption[] = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      weightGrams: 50,
      printCount: 1,
    }));
    const result = calculateConsumptionRate(stats, 30);
    expect(result.avgGramsPerDay).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("detects rising trend", () => {
    const stats: DailyConsumption[] = [];
    // Week 1: 10g/day, Week 2: 20g/day, Week 3: 40g/day, Week 4: 80g/day
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        const day = w * 7 + d + 1;
        stats.push({
          date: `2026-03-${String(day).padStart(2, "0")}`,
          weightGrams: 10 * Math.pow(2, w),
          printCount: 1,
        });
      }
    }
    const result = calculateConsumptionRate(stats, 30);
    expect(result.trend).toBe("rising");
    expect(result.trendSlope).toBeGreaterThan(0);
  });

  it("detects falling trend", () => {
    const stats: DailyConsumption[] = [];
    // Week 1: 80g/day, Week 2: 40g/day, Week 3: 20g/day, Week 4: 10g/day
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 7; d++) {
        const day = w * 7 + d + 1;
        stats.push({
          date: `2026-03-${String(day).padStart(2, "0")}`,
          weightGrams: 80 / Math.pow(2, w),
          printCount: 1,
        });
      }
    }
    const result = calculateConsumptionRate(stats, 30);
    expect(result.trend).toBe("falling");
    expect(result.trendSlope).toBeLessThan(0);
  });

  it("detects stable consumption", () => {
    // Use dates relative to now to ensure within window
    const now = new Date();
    const stats: DailyConsumption[] = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (27 - i));
      return { date: d.toISOString().slice(0, 10), weightGrams: 30, printCount: 1 };
    });
    const result = calculateConsumptionRate(stats, 30);
    expect(result.trend).toBe("stable");
  });
});

// ── daysUntilEmpty ──────────────────────────────────────────────────────────

describe("daysUntilEmpty()", () => {
  it("returns Infinity when no consumption", () => {
    expect(daysUntilEmpty(1000, 0)).toBe(Infinity);
  });

  it("returns 0 when empty", () => {
    expect(daysUntilEmpty(0, 50)).toBe(0);
  });

  it("calculates simple days", () => {
    expect(daysUntilEmpty(500, 50, "stable")).toBe(10);
  });

  it("shortens estimate for rising trend", () => {
    const days = daysUntilEmpty(500, 50, "rising", 10);
    expect(days).toBeLessThan(10);
  });

  it("lengthens estimate for falling trend", () => {
    const days = daysUntilEmpty(500, 50, "falling", -20);
    expect(days).toBeGreaterThan(10);
  });
});

// ── calculateReorderPoint ───────────────────────────────────────────────────

describe("calculateReorderPoint()", () => {
  it("calculates basic reorder point", () => {
    // 50g/day, stddev 10, lead time 4 days, 95% service
    const rop = calculateReorderPoint(50, 10, 4, 0.95);
    // Expected: 50*4 + 1.65*10*√4 = 200 + 33 = 233
    expect(rop).toBeGreaterThan(200);
    expect(rop).toBeLessThan(250);
  });

  it("returns 0 for zero consumption", () => {
    expect(calculateReorderPoint(0, 0, 4)).toBe(0);
  });

  it("increases with longer lead time", () => {
    const rop4 = calculateReorderPoint(50, 10, 4);
    const rop8 = calculateReorderPoint(50, 10, 8);
    expect(rop8).toBeGreaterThan(rop4);
  });
});

// ── stddev ───────────────────────────────────────────────────────────────────

describe("stddev()", () => {
  it("returns 0 for single value", () => {
    expect(stddev([42])).toBe(0);
  });

  it("returns 0 for identical values", () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });

  it("calculates correctly", () => {
    const sd = stddev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2.14, 1);
  });
});

// ── classifyFilament ────────────────────────────────────────────────────────

describe("classifyFilament()", () => {
  it("returns occasional for no data", () => {
    expect(classifyFilament([])).toBe("occasional");
  });

  it("classifies core filament (high daily, every week)", () => {
    const stats: DailyConsumption[] = Array.from({ length: 28 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, "0")}`,
      weightGrams: 50,
      printCount: 2,
    }));
    expect(classifyFilament(stats)).toBe("core");
  });

  it("classifies occasional filament (low usage)", () => {
    const stats: DailyConsumption[] = [
      { date: "2026-03-01", weightGrams: 5, printCount: 1 },
      { date: "2026-03-15", weightGrams: 3, printCount: 1 },
    ];
    expect(classifyFilament(stats)).toBe("occasional");
  });
});

// ── determineUrgency ────────────────────────────────────────────────────────

describe("determineUrgency()", () => {
  it("critical when <= 7 days", () => {
    expect(determineUrgency(5, false)).toBe("critical");
  });

  it("critical when <= 3 days with rule", () => {
    expect(determineUrgency(3, true)).toBe("critical");
  });

  it("warning when 8-21 days", () => {
    expect(determineUrgency(14, false)).toBe("warning");
  });

  it("ok when > 21 days", () => {
    expect(determineUrgency(30, false)).toBe("ok");
  });
});

// ── recommendOrderQty ───────────────────────────────────────────────────────

describe("recommendOrderQty()", () => {
  it("orders at least 1", () => {
    expect(recommendOrderQty(2, 2, 5, 10)).toBe(1);
  });

  it("fills deficit to min spools", () => {
    expect(recommendOrderQty(0, 2, 5, 10)).toBe(2);
  });

  it("caps at max stock", () => {
    expect(recommendOrderQty(4, 2, 5, 100)).toBe(1);
  });
});
