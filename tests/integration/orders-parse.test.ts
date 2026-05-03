/**
 * POST /api/v1/orders/parse — auth contract + match logic.
 *
 * The route is called from the browser AddOrderDialog without a Bearer
 * token, so it must be `optionalAuth` (not `requireAuth`). Drift between
 * the auth tier in code vs the documented contract caused a prod outage:
 * "Add Order" returned 401 "Missing Authorization header" for every paste.
 *
 * We mock the AI SDK to a fixed response so no Anthropic credits are
 * burned and the test is deterministic.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makePostRequest } from "../harness/request";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// Deterministic AI response — the route extracts JSON from `text`.
// We toggle behaviour per-test by mutating this `.aiResponse` ref.
const aiState: { aiResponse: string } = { aiResponse: "" };

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: aiState.aiResponse })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: () => ({}),
}));

const ESUN_RESPONSE = JSON.stringify({
  shop: "eSUN Official Store",
  orderNumber: "306-8035056-1237952",
  orderDate: "2026-05-03",
  items: [
    {
      name: "eSUN ASA+ Cold White",
      vendor: "eSUN",
      material: "ASA",
      colorName: "Cold White",
      colorHex: "F5F5F5",
      weight: 1000,
      quantity: 2,
      price: 23.5,
      currency: "EUR",
      url: null,
    },
  ],
});

async function callParse(body: unknown, withAuth: boolean) {
  const { POST } = await import("@/app/api/v1/orders/parse/route");
  const req = makePostRequest("/api/v1/orders/parse", body, withAuth);
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("orders/parse integration", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  describe("auth contract", () => {
    it("accepts requests WITHOUT an Authorization header (browser AddOrderDialog path)", async () => {
      aiState.aiResponse = ESUN_RESPONSE;
      const { status, body } = await callParse(
        { text: "Bestellnr 306-8035056-1237952 eSUN ASA+ 1KG x2 €46.99" },
        false,
      );
      expect(status).toBe(200);
      expect(body.parsed).toBeTruthy();
    });

    it("accepts requests WITH a Bearer header (HA-script path)", async () => {
      aiState.aiResponse = ESUN_RESPONSE;
      const { status } = await callParse(
        { text: "Bestellnr 306-8035056-1237952 eSUN ASA+ 1KG x2 €46.99" },
        true,
      );
      expect(status).toBe(200);
    });
  });

  describe("input-type detection routes the correct path", () => {
    it("plain-text email → type='email'", async () => {
      aiState.aiResponse = ESUN_RESPONSE;
      const { body } = await callParse(
        { text: "Bestellung 12345 — eSUN ASA+ €46.99" },
        false,
      );
      expect(body.type).toBe("email");
    });

    it("plain product search → type='search'", async () => {
      aiState.aiResponse = JSON.stringify({
        shop: null,
        orderNumber: null,
        orderDate: null,
        items: [],
      });
      const { body } = await callParse({ text: "PLA Basic Charcoal" }, false);
      expect(body.type).toBe("search");
    });
  });

  describe("response shape", () => {
    it("extracts shop, orderNumber, orderDate, and items with match metadata", async () => {
      aiState.aiResponse = ESUN_RESPONSE;
      const { body } = await callParse(
        { text: "Bestellnr 306-8035056-1237952 eSUN ASA+ 1KG x2 €46.99" },
        false,
      );
      const parsed = body.parsed as {
        shop: string;
        orderNumber: string;
        items: Array<{
          name: string;
          quantity: number;
          price: number;
          matchedFilamentId: string | null;
          matchConfidence: string;
        }>;
      };
      expect(parsed.shop).toBe("eSUN Official Store");
      expect(parsed.orderNumber).toBe("306-8035056-1237952");
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].quantity).toBe(2);
      expect(parsed.items[0].price).toBe(23.5);
      // No filaments seeded → no match
      expect(parsed.items[0].matchedFilamentId).toBeNull();
      expect(parsed.items[0].matchConfidence).toBe("new");
    });

    it("matches an existing filament by exact vendor+name", async () => {
      const { db } = await import("@/lib/db");
      const { vendors, filaments } = await import("@/lib/db/schema");
      const [vendor] = await db.insert(vendors).values({ name: "eSUN" }).returning();
      const [filament] = await db.insert(filaments).values({
        vendorId: vendor.id,
        name: "eSUN ASA+ Cold White",
        material: "ASA",
        colorHex: "F5F5F5",
        spoolWeight: 1000,
      }).returning();

      aiState.aiResponse = ESUN_RESPONSE;
      const { body } = await callParse(
        { text: "Bestellnr 306-8035056-1237952 eSUN ASA+ 1KG x2 €46.99" },
        false,
      );
      const parsed = body.parsed as { items: Array<{ matchedFilamentId: string | null; matchConfidence: string }> };
      expect(parsed.items[0].matchedFilamentId).toBe(filament.id);
      expect(parsed.items[0].matchConfidence).toBe("exact");
    });
  });

  describe("error handling", () => {
    it("returns 400 on invalid body shape", async () => {
      aiState.aiResponse = ESUN_RESPONSE;
      const { status } = await callParse({ noText: "oops" }, false);
      expect(status).toBe(400);
    });

    it("returns 422 when AI returns non-JSON garbage", async () => {
      aiState.aiResponse = "Sorry, I can't help with that.";
      const { status } = await callParse(
        { text: "Some order text" },
        false,
      );
      expect(status).toBe(422);
    });
  });
});
