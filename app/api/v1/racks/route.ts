import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { racks } from "@/lib/db/schema";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { validateBody, createRackSchema } from "@/lib/validations";
import { asc, isNull } from "drizzle-orm";

// GET /api/v1/racks — list racks (default: active only; ?includeArchived=1 for all)
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  try {
    const rows = includeArchived
      ? await db.select().from(racks).orderBy(asc(racks.sortOrder), asc(racks.createdAt))
      : await db.select().from(racks).where(isNull(racks.archivedAt)).orderBy(asc(racks.sortOrder), asc(racks.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/v1/racks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/v1/racks — create a new rack
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(createRackSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    const [created] = await db
      .insert(racks)
      .values({ name: body.name, rows: body.rows, cols: body.cols, sortOrder: body.sortOrder ?? 0 })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/racks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
