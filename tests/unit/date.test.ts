import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
} from "@/lib/date";

// All formatters use Europe/Berlin (UTC+1 in winter, UTC+2 in summer) and de-DE locale.
// Reference times are chosen in winter (UTC+1) to keep offset predictable.
//   2026-01-15T10:00:00Z → 11:00 Berlin
//   2026-03-31T12:00:00Z → 14:00 Berlin (summer time CEST, UTC+2)

describe("formatDateTime", () => {
  it("returns — for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("formats a winter UTC string with UTC+1 offset", () => {
    // 10:00 UTC = 11:00 Berlin (CET, UTC+1)
    const result = formatDateTime("2026-01-15T10:00:00Z");
    expect(result).toBe("15.01.2026, 11:00");
  });

  it("formats a summer UTC string with UTC+2 offset", () => {
    // 12:00 UTC = 14:00 Berlin (CEST, UTC+2)
    const result = formatDateTime("2026-03-31T12:00:00Z");
    expect(result).toBe("31.03.2026, 14:00");
  });

  it("accepts a Date object and returns expected string", () => {
    const d = new Date("2026-01-15T10:00:00Z");
    const result = formatDateTime(d);
    expect(result).toBe("15.01.2026, 11:00");
  });

  it("uses two-digit day and month", () => {
    const result = formatDateTime("2026-01-05T10:00:00Z");
    expect(result).toMatch(/^05\.01\.2026/);
  });
});

describe("formatDate", () => {
  it("returns — for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats date as DD.MM.YYYY", () => {
    const result = formatDate("2026-01-15T10:00:00Z");
    expect(result).toBe("15.01.2026");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-06-20T12:00:00Z");
    const result = formatDate(d);
    expect(result).toBe("20.06.2026");
  });

  it("does not include time", () => {
    const result = formatDate("2026-01-15T10:00:00Z");
    expect(result).not.toContain(":");
  });
});

describe("formatTime", () => {
  it("returns — for null", () => {
    expect(formatTime(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatTime(undefined)).toBe("—");
  });

  it("formats time as HH:MM in Berlin timezone", () => {
    // 10:00 UTC = 11:00 Berlin (CET)
    const result = formatTime("2026-01-15T10:00:00Z");
    expect(result).toBe("11:00");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-01-15T10:30:00Z");
    const result = formatTime(d);
    expect(result).toBe("11:30");
  });

  it("does not include date portion", () => {
    const result = formatTime("2026-01-15T10:00:00Z");
    expect(result).not.toContain("2026");
    expect(result).not.toContain(".");
  });
});

describe("formatDateLong", () => {
  it("returns — for null", () => {
    expect(formatDateLong(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDateLong(undefined)).toBe("—");
  });

  it("formats with full German month name", () => {
    const result = formatDateLong("2026-03-15T10:00:00Z");
    expect(result).toContain("März");
    expect(result).toContain("2026");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-01-15T10:00:00Z");
    const result = formatDateLong(d);
    expect(result).toContain("Januar");
    expect(result).toContain("2026");
  });

  it("does not include time", () => {
    const result = formatDateLong("2026-01-15T10:00:00Z");
    expect(result).not.toContain(":");
  });
});

describe("formatDateShort", () => {
  it("returns — for null", () => {
    expect(formatDateShort(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDateShort(undefined)).toBe("—");
  });

  it("includes abbreviated month and time", () => {
    // 10:00 UTC = 11:00 Berlin (CET, winter)
    const result = formatDateShort("2026-01-15T10:00:00Z");
    expect(result).toContain("15");
    expect(result).toContain("11:00");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-06-20T10:00:00Z");
    const result = formatDateShort(d);
    // June in Berlin summer = UTC+2, so 12:00 Berlin
    expect(result).toContain("20");
  });
});

describe("formatMonthYear", () => {
  it("returns — for null", () => {
    expect(formatMonthYear(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatMonthYear(undefined)).toBe("—");
  });

  it("formats as German month and year", () => {
    const result = formatMonthYear("2026-03-15T10:00:00Z");
    expect(result).toContain("März");
    expect(result).toContain("2026");
  });

  it("does not include day", () => {
    const result = formatMonthYear("2026-03-15T10:00:00Z");
    expect(result).not.toMatch(/\b15\b/);
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-12-01T10:00:00Z");
    const result = formatMonthYear(d);
    expect(result).toContain("Dezember");
    expect(result).toContain("2026");
  });

  it("returns different values for different months", () => {
    const jan = formatMonthYear("2026-01-01T10:00:00Z");
    const dec = formatMonthYear("2026-12-01T10:00:00Z");
    expect(jan).not.toBe(dec);
  });
});
