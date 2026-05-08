/**
 * GET /api/v1/admin/audit-logs
 *
 * Read-only listing of admin SQL audit log entries with filtering, search,
 * pagination, and sorting. Built for the /admin Audit Log table UI; the
 * raw SELECT FROM audit_logs path via /api/v1/admin/query is still
 * available as the catch-all for ad-hoc analysis.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gt, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";

const SORTABLE = new Set(["createdAt", "userId", "operation", "executionTimeMs", "rowsAffected"]);
const VALID_OPS = new Set(["SELECT", "INSERT", "UPDATE", "DELETE", "PRAGMA", "DDL"]);

// Read-only listing — browser-callable from /admin without a Bearer
// token (HA ingress / LAN-only PWA gates access at the addon layer).
// See docs/architecture/security-model.md for the auth-tier convention.
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    // ── Filters ─────────────────────────────────────────────────────────────
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
      // Inclusive end-of-day for date-only inputs.
      const toDate = new Date(toRaw);
      if (toRaw.length === 10) toDate.setUTCHours(23, 59, 59, 999);
      filters.push(lte(auditLogs.createdAt, toDate));
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    // ── Sorting ─────────────────────────────────────────────────────────────
    const sortField = searchParams.get("sort") ?? "createdAt";
    if (!SORTABLE.has(sortField)) {
      return NextResponse.json({ error: `Invalid sort field: ${sortField}` }, { status: 400 });
    }
    const dir = searchParams.get("dir") === "asc" ? asc : desc;
    const sortColumn = (auditLogs as unknown as Record<string, unknown>)[sortField];

    // ── Pagination ──────────────────────────────────────────────────────────
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") ?? "50", 10), 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const offset = (page - 1) * pageSize;

    // ── Run + count in parallel ─────────────────────────────────────────────
    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(where)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .orderBy(dir(sortColumn as any))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(where),
    ]);

    return NextResponse.json({
      rows,
      total: Number(totalRow[0]?.count ?? 0),
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(Number(totalRow[0]?.count ?? 0) / pageSize), 1),
    });
  } catch (error) {
    console.error("GET /api/v1/admin/audit-logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Mark unused imports as referenced for the typecheck strict pass.
void or;
void gt;
