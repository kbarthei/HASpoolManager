/**
 * Browser auth contract — every route the web UI calls without a Bearer
 * header must use `optionalAuth`, otherwise it returns 401 in prod.
 *
 * Background: a `requireAuth` drift on `/api/v1/orders/parse` broke the
 * "Add Order" dialog. This test enumerates every browser-called route
 * and asserts the handler does NOT respond with 401 to a no-auth call.
 *
 * If you add a new browser fetch (`fetch("/api/v1/...")` from `app/`
 * or `components/` without an Authorization header), add it to
 * BROWSER_ROUTES below.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { NextRequest } from "next/server";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import {
  makeGetRequest,
  makePostRequest,
  makePatchRequest,
  makeDeleteRequest,
  routeContext,
} from "../harness/request";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// AI SDK mocked so /orders/parse + /spools/scan don't burn credits.
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: JSON.stringify({ shop: null, orderNumber: null, orderDate: null, items: [] }),
  })),
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

// Price crawler must not hit the network — return a benign result.
vi.mock("@/lib/price-crawler", () => ({
  fetchProductPrice: vi.fn(async () => ({
    price: null,
    currency: "EUR",
    source: "test",
    inStock: false,
  })),
}));

type RouteCase = {
  label: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  route: () => Promise<{
    handler: (req: NextRequest, ctx?: unknown) => Promise<Response>;
    path: string;
    body?: unknown;
    params?: Record<string, string>;
  }>;
};

const BROWSER_ROUTES: RouteCase[] = [
  {
    label: "POST /api/v1/orders/parse",
    method: "POST",
    route: async () => ({
      handler: (await import("@/app/api/v1/orders/parse/route")).POST,
      path: "/api/v1/orders/parse",
      body: { text: "Some order text" },
    }),
  },
  {
    label: "POST /api/v1/spools/scan",
    method: "POST",
    route: async () => ({
      handler: (await import("@/app/api/v1/spools/scan/route")).POST,
      path: "/api/v1/spools/scan",
      body: { image: "data:image/png;base64,iVBORw0KGgo=" },
    }),
  },
  {
    label: "POST /api/v1/prices/refresh",
    method: "POST",
    route: async () => ({
      handler: (await import("@/app/api/v1/prices/refresh/route")).POST,
      path: "/api/v1/prices/refresh",
      body: {},
    }),
  },
  {
    label: "PATCH /api/v1/printers/[id]/ams-units/[unitId]",
    method: "PATCH",
    route: async () => ({
      handler: (await import("@/app/api/v1/printers/[id]/ams-units/[unitId]/route")).PATCH,
      path: "/api/v1/printers/p123/ams-units/u456",
      body: { isEnabled: true },
      params: { id: "p123", unitId: "u456" },
    }),
  },
  {
    label: "POST /api/v1/admin/printer-mappings",
    method: "POST",
    route: async () => ({
      handler: (await import("@/app/api/v1/admin/printer-mappings/route")).POST,
      path: "/api/v1/admin/printer-mappings",
      body: { deviceId: "d1", field: "f1", entityId: "e1" },
    }),
  },
  {
    label: "DELETE /api/v1/admin/printer-mappings",
    method: "DELETE",
    route: async () => ({
      handler: (await import("@/app/api/v1/admin/printer-mappings/route")).DELETE,
      path: "/api/v1/admin/printer-mappings",
    }),
  },
  {
    label: "PUT /api/v1/supply/alerts/[id]",
    method: "PUT",
    route: async () => ({
      handler: (await import("@/app/api/v1/supply/alerts/[id]/route")).PUT,
      path: "/api/v1/supply/alerts/a123",
      body: { status: "dismissed" },
      params: { id: "a123" },
    }),
  },
  {
    label: "POST /api/v1/supply/rules",
    method: "POST",
    route: async () => ({
      handler: (await import("@/app/api/v1/supply/rules/route")).POST,
      path: "/api/v1/supply/rules",
      body: {},
    }),
  },
  {
    label: "PATCH /api/v1/supply/rules/[id]",
    method: "PATCH",
    route: async () => ({
      handler: (await import("@/app/api/v1/supply/rules/[id]/route")).PATCH,
      path: "/api/v1/supply/rules/r123",
      body: { is_active: true },
      params: { id: "r123" },
    }),
  },
  {
    label: "DELETE /api/v1/supply/rules/[id]",
    method: "DELETE",
    route: async () => ({
      handler: (await import("@/app/api/v1/supply/rules/[id]/route")).DELETE,
      path: "/api/v1/supply/rules/r123",
      params: { id: "r123" },
    }),
  },
  {
    label: "PATCH /api/v1/prints/[id]/usage/[usageId]",
    method: "PATCH",
    route: async () => ({
      handler: (await import("@/app/api/v1/prints/[id]/usage/[usageId]/route")).PATCH,
      path: "/api/v1/prints/p123/usage/u456",
      body: { weightUsed: 100 },
      params: { id: "p123", usageId: "u456" },
    }),
  },
];

function buildRequest(c: RouteCase, payload: Awaited<ReturnType<RouteCase["route"]>>) {
  switch (c.method) {
    case "GET":
      return makeGetRequest(payload.path, false);
    case "POST":
      return makePostRequest(payload.path, payload.body ?? {}, false);
    case "PATCH":
    case "PUT":
      return makePatchRequest(payload.path, payload.body ?? {}, false);
    case "DELETE":
      return makeDeleteRequest(payload.path, false);
  }
}

describe("Browser auth contract — no route returns 401 without Bearer", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  for (const c of BROWSER_ROUTES) {
    it(`${c.label} accepts requests without an Authorization header`, async () => {
      const payload = await c.route();
      const req = buildRequest(c, payload);
      const ctx = payload.params ? routeContext(payload.params) : undefined;
      const res = await payload.handler(req, ctx);
      // We don't care if the route returns 200/400/404/500 — those are
      // application-level outcomes against an empty DB. We only assert
      // it's NOT 401 (the auth gate must be open for browser calls).
      expect(
        res.status,
        `${c.label} returned ${res.status} — must not be 401 (drift back to requireAuth?)`,
      ).not.toBe(401);
    });
  }
});
