import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import Database from "better-sqlite3";

/**
 * POST /api/v1/admin/query
 *
 * Execute a read-only SQL query against the production database.
 * REQUIRES Bearer token authentication.
 * Uses better-sqlite3 readonly mode for defense-in-depth.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

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
        return NextResponse.json({ error: "Write operations and multi-statements not allowed" }, { status: 403 });
      }
    }

    // Use a separate readonly connection for true safety
    const dbPath = process.env.SQLITE_PATH || "./data/haspoolmanager.db";
    const readonlyDb = new Database(dbPath, { readonly: true });

    try {
      const stmt = readonlyDb.prepare(query);
      const result = stmt.all();
      return NextResponse.json({ rows: result, count: result.length });
    } finally {
      readonlyDb.close();
    }
  } catch (error) {
    // Don't expose internal error details
    const msg = (error as Error).message || "Query error";
    const safeMsg = msg.includes("SQLITE") ? "SQL error" : msg;
    return NextResponse.json({ error: safeMsg }, { status: 400 });
  }
}
