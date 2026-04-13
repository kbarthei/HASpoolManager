import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * POST /api/v1/admin/query
 *
 * Execute a read-only SQL query against the production database.
 * For admin debugging only — rejects any write operations.
 */
export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const query = (body.query || body.sql || "").trim();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Block write operations
    const upper = query.toUpperCase();
    const writeOps = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "REPLACE", "ATTACH", "DETACH", "VACUUM", "PRAGMA"];
    for (const op of writeOps) {
      if (upper.startsWith(op) || upper.includes(` ${op} `)) {
        return NextResponse.json({ error: `Write operation "${op}" not allowed` }, { status: 403 });
      }
    }

    const result = db.all(sql.raw(query));

    return NextResponse.json({
      rows: result,
      count: result.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
