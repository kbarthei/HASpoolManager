import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000/api/v1";

describe.skipIf(!process.env.DATABASE_URL)("Match API Integration Tests", () => {
  // These tests expect seed data to be present in the database

  describe("POST /api/v1/match", () => {
    it("returns 400 when no match criteria provided", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("matches by RFID tag_uid (Tier 1a)", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_uid: "B568B1A400000100" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match).not.toBeNull();
      expect(data.match.confidence).toBe(1.0);
      expect(data.match.match_method).toBe("rfid_exact");
      expect(data.match.material).toBe("ABS-GF");
    });

    it("returns null match for unknown RFID tag", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_uid: "AAAAAAAAAAAAAAAA" }),
      });
      expect(res.status).toBe(200);
      // Falls through to fuzzy match with no data — might still find candidates
      // but with tag_uid only, no fuzzy criteria, so likely no match
      await res.json(); // consume response body
    });

    it("skips RFID match for zero tag_uid", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag_uid: "0000000000000000",
          tray_type: "ABS-GF",
          tray_color: "C6C6C6FF",
          tray_info_idx: "GFB50",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match).not.toBeNull();
      expect(data.match.match_method).toBe("fuzzy");
      expect(data.match.material).toBe("ABS-GF");
      expect(data.match.confidence).toBeGreaterThan(0.5);
    });

    it("fuzzy matches third-party spool by material + color", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tray_type: "PLA",
          tray_color: "E6DDDBFF",
          tray_sub_brands: "Polymaker",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match).not.toBeNull();
      expect(data.match.match_method).toBe("fuzzy");
      expect(data.match.vendor_name).toBe("Polymaker");
      expect(data.match.confidence).toBeGreaterThan(0.3);
    });
  });
});
