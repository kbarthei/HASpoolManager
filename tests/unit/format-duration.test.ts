import { describe, it, expect } from "vitest";
import { formatRemainingMinutes } from "@/lib/format-duration";

describe("formatRemainingMinutes", () => {
  it.each([null, undefined, 0, -5, NaN, Infinity])("returns dash for %p", (v) => {
    expect(formatRemainingMinutes(v as number | null | undefined)).toBe("—");
  });

  it("formats sub-hour values as Xmin", () => {
    expect(formatRemainingMinutes(1)).toBe("1min");
    expect(formatRemainingMinutes(45)).toBe("45min");
    expect(formatRemainingMinutes(59)).toBe("59min");
  });

  it("formats hour values as Xh YYmin with zero-padded minutes", () => {
    expect(formatRemainingMinutes(60)).toBe("1h 00min");
    expect(formatRemainingMinutes(125)).toBe("2h 05min");
    expect(formatRemainingMinutes(1268)).toBe("21h 08min");
  });

  it("rounds fractional minutes (the Bambu hours→minutes conversion drops sub-minute precision)", () => {
    expect(formatRemainingMinutes(21.4)).toBe("21min");
    expect(formatRemainingMinutes(21.6)).toBe("22min");
    expect(formatRemainingMinutes(1267.6)).toBe("21h 08min");
  });
});
