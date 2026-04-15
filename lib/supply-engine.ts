/**
 * Supply Engine — consumption tracking, trend detection, reorder analysis.
 *
 * Pure functions (no DB access) for testability.
 * DB operations in supply-engine-db.ts.
 */

// ── Consumption Rate ────────────────────────────────────────────────────────

export interface DailyConsumption {
  date: string; // YYYY-MM-DD
  weightGrams: number;
  printCount: number;
}

export interface ConsumptionRate {
  /** Exponential moving average of daily consumption (grams/day) */
  avgGramsPerDay: number;
  /** Trend direction based on linear regression over weekly data */
  trend: "rising" | "falling" | "stable";
  /** Slope of trend: grams/day change per week (positive = rising) */
  trendSlope: number;
  /** Weekly consumption totals (oldest first) */
  weeklyConsumption: number[];
  /** Confidence 0-1 based on data completeness */
  confidence: number;
}

/**
 * Calculate consumption rate from daily stats using EMA + linear regression.
 *
 * @param stats Daily consumption entries, oldest first
 * @param windowDays Number of days to consider (default 56 = 8 weeks)
 */
export function calculateConsumptionRate(
  stats: DailyConsumption[],
  windowDays = 56
): ConsumptionRate {
  if (stats.length === 0) {
    return { avgGramsPerDay: 0, trend: "stable", trendSlope: 0, weeklyConsumption: [], confidence: 0 };
  }

  // Ensure sorted oldest-first
  const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date));

  // Limit to window
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const windowed = sorted.filter((s) => s.date >= cutoff);

  if (windowed.length === 0) {
    return { avgGramsPerDay: 0, trend: "stable", trendSlope: 0, weeklyConsumption: [], confidence: 0 };
  }

  // EMA (Exponential Moving Average) with alpha = 0.1
  const alpha = 0.1;
  let ema = windowed[0].weightGrams;
  for (let i = 1; i < windowed.length; i++) {
    ema = alpha * windowed[i].weightGrams + (1 - alpha) * ema;
  }

  // Weekly aggregation for trend analysis
  const weeklyConsumption: number[] = [];
  const numWeeks = Math.min(8, Math.ceil(windowed.length / 7));
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = windowed.length - (numWeeks - w) * 7;
    const weekEnd = weekStart + 7;
    let weekTotal = 0;
    for (let d = Math.max(0, weekStart); d < Math.min(windowed.length, weekEnd); d++) {
      weekTotal += windowed[d].weightGrams;
    }
    weeklyConsumption.push(Math.round(weekTotal * 10) / 10);
  }

  // Linear regression on weekly data for trend
  const { slope, trend } = linearTrend(weeklyConsumption);

  // Confidence: based on number of data points relative to window
  const daysWithData = windowed.filter((s) => s.weightGrams > 0).length;
  const confidence = Math.min(1, daysWithData / Math.min(windowDays, 30));

  return {
    avgGramsPerDay: Math.round(ema * 100) / 100,
    trend,
    trendSlope: Math.round(slope * 100) / 100,
    weeklyConsumption,
    confidence,
  };
}

/**
 * Linear regression on an array of values. Returns slope and trend direction.
 * Slope is in units-per-index (e.g., grams-per-week if input is weekly data).
 */
function linearTrend(values: number[]): { slope: number; trend: "rising" | "falling" | "stable" } {
  const n = values.length;
  if (n < 2) return { slope: 0, trend: "stable" };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Threshold: slope > 5g/week = rising, < -5g/week = falling
  const trend = slope > 5 ? "rising" : slope < -5 ? "falling" : "stable";

  return { slope, trend };
}

// ── Days Until Empty ────────────────────────────────────────────────────────

/**
 * Calculate estimated days until stockout, adjusted for consumption trend.
 *
 * @param remainingGrams Total remaining filament across all spools
 * @param avgGramsPerDay Average daily consumption
 * @param trend Consumption trend
 * @param trendSlope Grams/day change per week
 */
export function daysUntilEmpty(
  remainingGrams: number,
  avgGramsPerDay: number,
  trend: "rising" | "falling" | "stable" = "stable",
  trendSlope = 0
): number {
  if (avgGramsPerDay <= 0) return Infinity;
  if (remainingGrams <= 0) return 0;

  // Simple estimate without trend
  const simpleDays = remainingGrams / avgGramsPerDay;

  // Adjust for trend: if consumption is rising, we'll run out sooner
  if (trend === "rising" && trendSlope > 0) {
    // Conservative: reduce estimate by 20-30% depending on slope magnitude
    const adjustFactor = Math.max(0.5, 1 - (trendSlope / avgGramsPerDay) * 0.3);
    return Math.round(simpleDays * adjustFactor);
  }
  if (trend === "falling" && trendSlope < 0) {
    // Optimistic: increase estimate by 10-20%
    const adjustFactor = Math.min(1.5, 1 + (Math.abs(trendSlope) / avgGramsPerDay) * 0.2);
    return Math.round(simpleDays * adjustFactor);
  }

  return Math.round(simpleDays);
}

// ── Reorder Point ───────────────────────────────────────────────────────────

/**
 * Calculate the reorder point: minimum stock level before ordering.
 *
 * ROP = (avgDaily × leadTime) + safetyStock
 * safetyStock = Z × σ × √leadTime
 *
 * @param avgGramsPerDay Average daily consumption
 * @param stddevDaily Standard deviation of daily consumption
 * @param leadTimeDays Expected delivery time in days
 * @param serviceLevel Probability of not running out (0.95 = 95%)
 */
export function calculateReorderPoint(
  avgGramsPerDay: number,
  stddevDaily: number,
  leadTimeDays: number,
  serviceLevel = 0.95
): number {
  // Z-score lookup for common service levels
  const zScores: Record<number, number> = {
    0.90: 1.28,
    0.95: 1.65,
    0.99: 2.33,
  };
  const z = zScores[serviceLevel] ?? 1.65;

  const safetyStock = z * stddevDaily * Math.sqrt(leadTimeDays);
  const rop = avgGramsPerDay * leadTimeDays + safetyStock;

  return Math.round(rop);
}

/**
 * Calculate standard deviation from daily consumption values.
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ── Filament Classification ─────────────────────────────────────────────────

export type FilamentCategory = "core" | "regular" | "project" | "occasional";

/**
 * Classify a filament's usage pattern based on consumption history.
 *
 * core:       >30g/day avg, used every week
 * regular:    >10g/day avg, used at least every 2 weeks
 * project:    sporadic but intense usage (high variance)
 * occasional: low, infrequent usage
 */
export function classifyFilament(stats: DailyConsumption[]): FilamentCategory {
  if (stats.length === 0) return "occasional";

  const rate = calculateConsumptionRate(stats);

  if (rate.avgGramsPerDay <= 0 && rate.confidence === 0) return "occasional";

  // Check usage frequency: how many of the last 4 weeks had any usage?
  const recentWeeks = rate.weeklyConsumption.slice(-4);
  const activeWeeks = recentWeeks.filter((w) => w > 0).length;

  // Core: high daily avg + used every week
  if (rate.avgGramsPerDay >= 30 && activeWeeks >= 3) return "core";

  // Regular: moderate daily avg + used frequently
  if (rate.avgGramsPerDay >= 10 && activeWeeks >= 2) return "regular";

  // Project: sporadic intense usage (high variance relative to mean)
  if (rate.weeklyConsumption.length >= 2) {
    const weeklyStddev = stddev(rate.weeklyConsumption);
    const weeklyMean = rate.weeklyConsumption.reduce((s, v) => s + v, 0) / rate.weeklyConsumption.length;
    if (weeklyMean > 0 && weeklyStddev / weeklyMean > 1.0) return "project";
  }

  // Default: occasional
  return rate.avgGramsPerDay >= 5 ? "regular" : "occasional";
}

// ── Supply Analysis ─────────────────────────────────────────────────────────

export interface SupplyStatus {
  filamentId: string;
  currentStock: { totalGrams: number; spoolCount: number };
  consumption: ConsumptionRate;
  category: FilamentCategory;
  daysRemaining: number;
  reorderPoint: number;
  needsReorder: boolean;
  urgency: "critical" | "warning" | "ok";
  recommendedQty: number;
}

/**
 * Determine urgency level based on days remaining.
 */
export function determineUrgency(
  daysRemaining: number,
  hasRule: boolean
): "critical" | "warning" | "ok" {
  if (daysRemaining <= 7 || (hasRule && daysRemaining <= 3)) return "critical";
  if (daysRemaining <= 21) return "warning";
  return "ok";
}

/**
 * Calculate how many spools to recommend ordering.
 */
export function recommendOrderQty(
  currentSpools: number,
  minSpools: number,
  maxSpools: number,
  avgGramsPerDay: number,
  filamentNetWeight = 1000
): number {
  // At minimum, bring stock up to minSpools
  const deficit = Math.max(0, minSpools - currentSpools);

  // If high consumption, order extra
  if (avgGramsPerDay > 30) {
    const extraForBuffer = Math.ceil((avgGramsPerDay * 30) / filamentNetWeight); // 30 days buffer
    return Math.min(Math.max(deficit + 1, extraForBuffer), maxSpools - currentSpools);
  }

  return Math.max(deficit, 1);
}
