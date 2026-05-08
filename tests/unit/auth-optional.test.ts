/**
 * optionalAuth() must treat *any* non-Bearer Authorization header as
 * "anonymous web UI", not as a failed Bearer claim. HA ingress
 * sometimes injects Basic / session tokens that are NOT for us; we
 * cannot 401 every browser request because of them.
 *
 * Real-world incident (2026-05-08): the SQL Audit Log card on /admin
 * surfaced "Missing Authorization header" because requireAuth was
 * being called with HA's ingress-injected non-Bearer header. Fix
 * lives in lib/auth.ts:optionalAuth — this test prevents regression.
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the DB-touching parts so this stays a pure unit test (CI has no
// ./data/ directory; we don't need a DB to assert optionalAuth's
// header-handling semantics).
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));

import { optionalAuth } from "@/lib/auth";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL("http://test.local/api/v1/x"), { headers });
}

describe("optionalAuth", () => {
  it("treats no Authorization header as anonymous web-ui", async () => {
    const res = await optionalAuth(req());
    expect(res.authenticated).toBe(true);
    if (res.authenticated) expect(res.keyId).toBe("web-ui");
  });

  it("treats Basic Authorization (e.g. HA ingress) as anonymous web-ui", async () => {
    const res = await optionalAuth(req({ authorization: "Basic dXNlcjpwYXNz" }));
    expect(res.authenticated).toBe(true);
    if (res.authenticated) expect(res.keyId).toBe("web-ui");
  });

  it("treats arbitrary non-Bearer scheme as anonymous web-ui", async () => {
    const res = await optionalAuth(req({ authorization: "X-HA-Session abc123" }));
    expect(res.authenticated).toBe(true);
    if (res.authenticated) expect(res.keyId).toBe("web-ui");
  });

  it("rejects an invalid Bearer token (no silent bypass)", async () => {
    const res = await optionalAuth(req({ authorization: "Bearer hspm_definitelynotvalid" }));
    expect(res.authenticated).toBe(false);
    if (!res.authenticated) expect(res.response).toBeDefined();
  });

  it("accepts a Bearer matching API_SECRET_KEY env", async () => {
    const prev = process.env.API_SECRET_KEY;
    process.env.API_SECRET_KEY = "test-secret-12345";
    try {
      const res = await optionalAuth(req({ authorization: "Bearer test-secret-12345" }));
      expect(res.authenticated).toBe(true);
      if (res.authenticated) expect(res.keyId).toBe("env");
    } finally {
      if (prev === undefined) delete process.env.API_SECRET_KEY;
      else process.env.API_SECRET_KEY = prev;
    }
  });
});
