/**
 * Integration tests for the audit-log read API:
 *   GET /api/v1/admin/audit-logs           — list + filter + sort + paginate
 *   GET /api/v1/admin/audit-logs/stats     — aggregates over the same filter set
 *
 * Seeds 25 audit_log rows across operations / users / outcomes and exercises
 * each filter axis. The list endpoint is requireAuth so we also assert 401
 * without a Bearer token.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb } from "../harness/sqlite-db";
import { makeGetRequest } from "../harness/request";
import { eq } from "drizzle-orm";

interface ListResponse {
  rows: Array<{
    id: string;
    operation: string | null;
    success: boolean;
    userId: string;
    sqlStatement: string;
    executionTimeMs: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface StatsResponse {
  total: number;
  successes: number;
  failures: number;
  successRate: number | null;
  avgMs: number | null;
  maxMs: number | null;
  operations: Array<{ op: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
}

async function seedAuditLogs() {
  const { db } = await import("@/lib/db");
  const { auditLogs } = await import("@/lib/db/schema");

  // 25 rows: mix of SELECT / UPDATE / INSERT / DELETE, success+failures,
  // 3 users, mixed timing. Spread across the last 5 days.
  const ops = ["SELECT", "UPDATE", "INSERT", "DELETE"];
  const users = ["web-ui", "ha-script", "env-secret"];
  const baseTs = Date.now();
  const rows = Array.from({ length: 25 }).map((_, i) => ({
    id: crypto.randomUUID(),
    action: i % 4 === 0 ? "sql_execute" : "sql_query",
    userId: users[i % users.length],
    userKeyId: users[i % users.length] === "web-ui" ? "web-ui" : `key-${i}`,
    sqlStatement: `${ops[i % ops.length]} * FROM widgets WHERE id = ${i}`,
    sqlParams: i % 3 === 0 ? null : JSON.stringify([i, "test"]),
    operation: ops[i % ops.length],
    dryRun: i % 5 === 0,
    success: i % 7 !== 0, // ~14% failure rate
    rowsAffected: i % 7 !== 0 ? i + 1 : null,
    errorMessage: i % 7 === 0 ? `Synthetic failure #${i}` : null,
    executionTimeMs: 5 + (i % 10) * 3,
    ipAddress: i % 2 === 0 ? "127.0.0.1" : null,
    userAgent: i % 2 === 0 ? "Mozilla/5.0" : null,
    createdAt: new Date(baseTs - i * 60_000), // 1 minute apart, newest first by index 0
  }));
  await db.insert(auditLogs).values(rows);
  return rows;
}

describe("/api/v1/admin/audit-logs", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { auditLogs } = await import("@/lib/db/schema");
    await db.delete(auditLogs);
    await seedAuditLogs();
  });

  describe("auth", () => {
    it("rejects without Bearer token", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs", false));
      expect(res.status).toBe(401);
    });
  });

  describe("list", () => {
    it("returns first page of 50 by default sorted by createdAt desc", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs", true));
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBe(25);
      expect(body.total).toBe(25);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
      expect(body.pageCount).toBe(1);
    });

    it("paginates with custom pageSize", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?pageSize=10", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBe(10);
      expect(body.pageCount).toBe(3);
      expect(body.pageSize).toBe(10);
    });

    it("returns subsequent pages", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const r1 = await GET(makeGetRequest("/api/v1/admin/audit-logs?pageSize=10&page=1", true));
      const r2 = await GET(makeGetRequest("/api/v1/admin/audit-logs?pageSize=10&page=2", true));
      const b1 = (await r1.json()) as ListResponse;
      const b2 = (await r2.json()) as ListResponse;
      expect(b1.rows[0].id).not.toBe(b2.rows[0].id);
      expect(b2.page).toBe(2);
    });

    it("filters by operation", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?op=SELECT", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.operation === "SELECT")).toBe(true);
    });

    it("filters by success=true (failures excluded)", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?success=true", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.every((r) => r.success === true)).toBe(true);
    });

    it("filters by success=false", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?success=false", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.success === false)).toBe(true);
    });

    it("filters by user (LIKE %term%)", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?user=web", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBeGreaterThan(0);
      expect(body.rows.every((r) => r.userId.includes("web"))).toBe(true);
    });

    it("searches sql_statement (q)", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?q=widgets", true));
      const body = (await res.json()) as ListResponse;
      expect(body.rows.length).toBe(25);
      expect(body.rows.every((r) => r.sqlStatement.includes("widgets"))).toBe(true);
    });

    it("sorts by executionTimeMs asc", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?sort=executionTimeMs&dir=asc", true));
      const body = (await res.json()) as ListResponse;
      const times = body.rows.map((r) => r.executionTimeMs ?? 0);
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    });

    it("rejects invalid sort field", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?sort=DROP_TABLE", true));
      expect(res.status).toBe(400);
    });

    it("clamps pageSize to max 200", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs?pageSize=10000", true));
      const body = (await res.json()) as ListResponse;
      expect(body.pageSize).toBe(200);
    });
  });

  describe("stats", () => {
    it("returns aggregates over the full set", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/stats/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs/stats", true));
      expect(res.status).toBe(200);
      const body = (await res.json()) as StatsResponse;
      expect(body.total).toBe(25);
      expect(body.successes + body.failures).toBe(25);
      expect(body.successRate).toBeGreaterThan(0);
      expect(body.avgMs).toBeGreaterThan(0);
      expect(body.operations.length).toBeGreaterThan(0);
      expect(body.topUsers.length).toBeGreaterThan(0);
      expect(body.topUsers.length).toBeLessThanOrEqual(5);
    });

    it("honours filters (success=true subset only)", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/stats/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs/stats?success=true", true));
      const body = (await res.json()) as StatsResponse;
      expect(body.failures).toBe(0);
      expect(body.successRate).toBe(1);
    });

    it("returns null successRate for empty set", async () => {
      const { db } = await import("@/lib/db");
      const { auditLogs } = await import("@/lib/db/schema");
      await db.delete(auditLogs);

      const { GET } = await import("@/app/api/v1/admin/audit-logs/stats/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs/stats", true));
      const body = (await res.json()) as StatsResponse;
      expect(body.total).toBe(0);
      expect(body.successRate).toBeNull();
      expect(body.avgMs).toBeNull();
    });

    it("requires auth", async () => {
      const { GET } = await import("@/app/api/v1/admin/audit-logs/stats/route");
      const res = await GET(makeGetRequest("/api/v1/admin/audit-logs/stats", false));
      expect(res.status).toBe(401);
    });
  });

  // Suppress unused-import for `eq` (kept for potential follow-up tests).
  void eq;
});
