/**
 * GET /api/v1/admin/audit-logs/stats
 *
 * Aggregate counters for the Audit Log dashboard: total queries, success
 * rate, average execution time, top users. Honours the same filter set
 * as the list endpoint so the stats reflect the currently visible slice.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

const VALID_OPS = new Set(["SELECT", "INSERT", "UPDATE", "DELETE", "PRAGMA", "DDL"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const opRaw = searchParams.get("op");
    const op = opRaw && VALID_OPS.has(opRaw.toUpperCase()) ? opRaw.toUpperCase() : null;
    const successRaw = searchParams.get("success");
    const success = successRaw === "true" ? true : successRaw === "false" ? false : null;
    const user = searchParams.get("user")?.trim() || null;
    const q = searchParams.get("q")?.trim() || null;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");

    const filters: SQL[] = [];
    if (op) filters.push(eq(auditLogs.operation, op));
    if (success !== null) filters.push(eq(auditLogs.success, success));
    if (user) filters.push(like(auditLogs.userId, `%${user}%`));
    if (q) filters.push(like(auditLogs.sqlStatement, `%${q}%`));
    if (fromRaw) filters.push(gte(auditLogs.createdAt, new Date(fromRaw)));
    if (toRaw) {
      const toDate = new Date(toRaw);
      if (toRaw.length === 10) toDate.setUTCHours(23, 59, 59, 999);
      filters.push(lte(auditLogs.createdAt, toDate));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [totalsRow, opBreakdown, topUsers] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          successes: sql<number>`sum(case when success = 1 then 1 else 0 end)`,
          avgMs: sql<number | null>`avg(execution_time_ms)`,
          maxMs: sql<number | null>`max(execution_time_ms)`,
        })
        .from(auditLogs)
        .where(where),
      db
        .select({
          operation: auditLogs.operation,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(where)
        .groupBy(auditLogs.operation),
      db
        .select({
          userId: auditLogs.userId,
          count: sql<number>`count(*)`,
        })
        .from(auditLogs)
        .where(where)
        .groupBy(auditLogs.userId)
        .orderBy(sql`count(*) desc`)
        .limit(5),
    ]);

    const total = Number(totalsRow[0]?.total ?? 0);
    const successes = Number(totalsRow[0]?.successes ?? 0);

    return NextResponse.json({
      total,
      successes,
      failures: total - successes,
      successRate: total > 0 ? successes / total : null,
      avgMs: totalsRow[0]?.avgMs == null ? null : Number(totalsRow[0].avgMs),
      maxMs: totalsRow[0]?.maxMs == null ? null : Number(totalsRow[0].maxMs),
      operations: opBreakdown.map((r) => ({ op: r.operation ?? "UNKNOWN", count: Number(r.count) })),
      topUsers: topUsers.map((r) => ({ userId: r.userId, count: Number(r.count) })),
    });
  } catch (error) {
    console.error("GET /api/v1/admin/audit-logs/stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
