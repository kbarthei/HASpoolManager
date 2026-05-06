import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import Database from "better-sqlite3";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

/**
 * POST /api/v1/admin/query
 *
 * Execute a read-only SQL query against the production database.
 * REQUIRES Bearer token authentication.
 * Uses better-sqlite3 readonly mode for defense-in-depth.
 */

async function logAudit(data: {
  userId: string;
  userKeyId: string;
  sqlStatement: string;
  success: boolean;
  rowsAffected?: number;
  errorMessage?: string;
  executionTimeMs: number;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      action: "sql_query",
      userId: data.userId,
      userKeyId: data.userKeyId,
      sqlStatement: data.sqlStatement,
      sqlParams: null,
      operation: "SELECT",
      dryRun: false,
      success: data.success,
      rowsAffected: data.rowsAffected,
      errorMessage: data.errorMessage,
      executionTimeMs: data.executionTimeMs,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });
  } catch (err) {
    console.error("[audit] Failed to log SQL query:", err);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  // Extract request metadata for audit logging
  const ipAddress = request.headers.get("x-forwarded-for") ||
                    request.headers.get("x-real-ip") ||
                    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  try {
    const body = await request.json();
    const query = (body.query || body.sql || "").trim();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Defense in depth: block obvious write operations at string level
    const upper = query.toUpperCase().replace(/\s+/g, " ");
    const writeOps = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "REPLACE", "ATTACH", "DETACH", "VACUUM", "PRAGMA", "BEGIN", "COMMIT", "ROLLBACK", "REINDEX"];
    for (const op of writeOps) {
      if (upper.startsWith(op) || upper.includes(` ${op} `) || upper.includes(`;`)) {
        const executionTimeMs = Date.now() - startTime;
        await logAudit({
          userId: auth.name,
          userKeyId: auth.keyId,
          sqlStatement: query,
          success: false,
          errorMessage: "Write operations and multi-statements not allowed",
          executionTimeMs,
          ipAddress,
          userAgent,
        });
        return NextResponse.json({ error: "Write operations and multi-statements not allowed" }, { status: 403 });
      }
    }

    // Use a separate readonly connection for true safety
    const dbPath = process.env.SQLITE_PATH || "./data/haspoolmanager.db";
    const readonlyDb = new Database(dbPath, { readonly: true });

    try {
      const stmt = readonlyDb.prepare(query);
      const result = stmt.all();
      const executionTimeMs = Date.now() - startTime;

      console.log(
        `[sql/query] ${auth.name} SELECT → ${result.length} row(s) (${executionTimeMs}ms)`,
      );

      // Log successful query
      await logAudit({
        userId: auth.name,
        userKeyId: auth.keyId,
        sqlStatement: query,
        success: true,
        rowsAffected: result.length,
        executionTimeMs,
        ipAddress,
        userAgent,
      });

      return NextResponse.json({ rows: result, count: result.length });
    } finally {
      readonlyDb.close();
    }
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const msg = (error as Error).message || "Query error";
    const safeMsg = msg.includes("SQLITE") ? "SQL error" : msg;

    // Log failed query
    await logAudit({
      userId: auth.name,
      userKeyId: auth.keyId,
      sqlStatement: "query",
      success: false,
      errorMessage: msg,
      executionTimeMs,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ error: safeMsg }, { status: 400 });
  }
}
