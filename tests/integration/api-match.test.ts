import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000/api/v1";
const AUTH = { Authorization: `Bearer ${process.env.API_SECRET_KEY || "test-dev-key-2026"}` };

describe.skipIf(!process.env.DATABASE_URL)("Match API Integration Tests", () => {
  // These tests expect seed data to be present in the database

  describe("POST /api/v1/match", () => {
    it("returns 401 without auth", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when no match criteria provided", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("matches by RFID tag_uid (Tier 1a)", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ tag_uid: "B568B1A400000100" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match).not.toBeNull();
      expect(data.match.confidence).toBe(1.0);
      expect(data.match.match_method).toBe("rfid_exact");
      expect(data.match.material).toBe("ABS-GF");
    });

    it("returns result for unknown RFID tag", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({ tag_uid: "AAAAAAAAAAAAAAAA" }),
      });
      expect(res.status).toBe(200);
      await res.json();
    });

    it("skips RFID match for zero tag_uid", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
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
    });

    it("fuzzy matches by material + color", async () => {
      const res = await fetch(`${BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH },
        body: JSON.stringify({
          tray_type: "PLA",
          tray_color: "E6DDDBFF",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.match).not.toBeNull();
      expect(data.match.match_method).toBe("fuzzy");
    });
  });
});
