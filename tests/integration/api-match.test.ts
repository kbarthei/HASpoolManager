/**
 * POST /api/v1/match — rewritten onto the harness.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

describe("POST /api/v1/match", () => {
  const TAG_UID = "MATCHTAG_ABS_001";

  beforeAll(async () => {
    await setupTestDb();
    const { makeVendor, makeFilament, makeSpool, makeTagMapping } =
      await import("../fixtures/seed");

    // Seed an ABS-GF spool with a known RFID tag for tier-1 exact matching
    const vendorId = await makeVendor("MatchVendor");
    const filamentId = await makeFilament(vendorId, {
      name: "ABS-GF Gray",
      material: "ABS-GF",
      colorHex: "C6C6C6",
    });
    const spoolId = await makeSpool(filamentId);
    await makeTagMapping(spoolId, TAG_UID);

    // Seed a PLA spool for fuzzy colour matching
    const pVendor = await makeVendor("MatchVendor2");
    const plaFil = await makeFilament(pVendor, {
      name: "PLA Bone",
      material: "PLA",
      colorHex: "E6DDDB",
    });
    await makeSpool(plaFil);
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(makePostRequest("/api/v1/match", {}, false));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no criteria provided", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(makePostRequest("/api/v1/match", {}));
    expect(res.status).toBe(400);
  });

  it("matches by RFID tag_uid (tier 1, exact)", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(
      makePostRequest("/api/v1/match", { tag_uid: TAG_UID }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      match: { confidence: number; match_method: string; material: string } | null;
    };
    expect(data.match).not.toBeNull();
    expect(data.match!.confidence).toBe(1.0);
    expect(data.match!.match_method).toBe("rfid_exact");
    expect(data.match!.material).toBe("ABS-GF");
  });

  it("returns a result for an unknown RFID (falls through)", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(
      makePostRequest("/api/v1/match", { tag_uid: "AAAAAAAAAAAAAAAA" }),
    );
    expect(res.status).toBe(200);
    await res.json();
  });

  it("skips RFID match for zero tag_uid, falls back to fuzzy", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(
      makePostRequest("/api/v1/match", {
        tag_uid: "0000000000000000",
        tray_type: "ABS-GF",
        tray_color: "C6C6C6FF",
        tray_info_idx: "GFB50",
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      match: { match_method: string } | null;
    };
    expect(data.match).not.toBeNull();
    expect(data.match!.match_method).toBe("fuzzy");
  });

  it("fuzzy matches by material + colour", async () => {
    const { POST } = await import("@/app/api/v1/match/route");
    const res = await POST(
      makePostRequest("/api/v1/match", {
        tray_type: "PLA",
        tray_color: "E6DDDBFF",
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      match: { match_method: string } | null;
    };
    expect(data.match).not.toBeNull();
    expect(data.match!.match_method).toBe("fuzzy");
  });
});
