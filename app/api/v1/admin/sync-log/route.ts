import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";
import { desc, ne, inArray, sql } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";

// Active states as defined in the normalizer
const ACTIVE_STATES = [
  "PRINTING",
  "CHANGING_FILAMENT",
  "CALIBRATING_EXTRUSION",
  "CALIBRATING_BED",
  "HEATING",
];

export type SyncLogFilter = "all" | "transitions" | "active";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const filter = (searchParams.get("filter") ?? "all") as SyncLogFilter;
    const offset = (page - 1) * limit;

    // Build WHERE clause based on filter
    let whereClause;
    if (filter === "transitions") {
      whereClause = ne(syncLog.printTransition, "none");
    } else if (filter === "active") {
      whereClause = inArray(syncLog.normalizedState, ACTIVE_STATES);
    }
    // "all" → no WHERE clause

    // Count total matching rows
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(syncLog)
      .where(whereClause);

    // Fetch paginated entries
    const entries = await db
      .select()
      .from(syncLog)
      .where(whereClause)
      .orderBy(desc(syncLog.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ entries, total, page, limit });
  } catch (error) {
    console.error("GET /api/v1/admin/sync-log error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
