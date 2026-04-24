import { describe, it, expect } from "vitest";
import { lookupHmsMessage, normalizeCode, getCatalogMeta } from "@/lib/hms-code-catalog";

describe("hms-code-catalog", () => {
  describe("normalizeCode", () => {
    it("uppercases input", () => {
      expect(normalizeCode("0300_8004")).toBe("0300_8004");
      expect(normalizeCode("0300_800c")).toBe("0300_800C");
    });

    it("trims extra segments (accepts 4-segment codes)", () => {
      expect(normalizeCode("0300_8004_0002_0001")).toBe("0300_8004");
    });

    it("trims whitespace", () => {
      expect(normalizeCode("  0300_8004  ")).toBe("0300_8004");
    });
  });

  describe("lookupHmsMessage", () => {
    it("finds a known runout code", () => {
      const entry = lookupHmsMessage("0300_8004");
      expect(entry).not.toBeNull();
      expect(entry?.code).toBe("0300_8004");
      expect(entry?.message_en).toMatch(/filament ran out/i);
      expect(entry?.wiki_url).toContain("wiki.bambulab.com");
    });

    it("finds a user-cancel code", () => {
      const entry = lookupHmsMessage("0300_400C");
      expect(entry).not.toBeNull();
      expect(entry?.message_en).toMatch(/task was canceled/i);
    });

    it("accepts 4-segment HMS codes by normalizing", () => {
      const entry = lookupHmsMessage("0300_8004_0002_0001");
      expect(entry?.code).toBe("0300_8004");
    });

    it("is case-insensitive", () => {
      expect(lookupHmsMessage("0300_800c")).not.toBeNull();
      expect(lookupHmsMessage("0300_800C")).not.toBeNull();
    });

    it("returns null for unknown codes", () => {
      expect(lookupHmsMessage("FFFF_FFFF")).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(lookupHmsMessage("")).toBeNull();
      expect(lookupHmsMessage(null)).toBeNull();
      expect(lookupHmsMessage(undefined)).toBeNull();
    });
  });

  describe("getCatalogMeta", () => {
    it("exposes the catalog metadata", () => {
      const meta = getCatalogMeta();
      expect(meta.count).toBeGreaterThan(800);
      expect(meta.source).toContain("bambuddy");
      expect(meta.license).toContain("AGPL");
    });
  });
});
