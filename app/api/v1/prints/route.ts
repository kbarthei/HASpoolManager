import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

// GET /api/v1/prints — List prints with filters and pagination
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const status = url.searchParams.get("status");
    const printerId = url.searchParams.get("printer_id");

    const conditions = [];
    if (status) conditions.push(eq(prints.status, status));
    if (printerId) conditions.push(eq(prints.printerId, printerId));

    const whereClause =
      conditions.length > 1
        ? and(...conditions)
        : conditions.length === 1
          ? conditions[0]
          : undefined;

    const result = await db.query.prints.findMany({
      where: whereClause,
      with: {
        printer: true,
        usage: true,
      },
      orderBy: [desc(prints.startedAt)],
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/v1/prints error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/prints — Create a print
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    const [print] = await db
      .insert(prints)
      .values({
        printerId: body.printerId,
        name: body.name,
        gcodeFile: body.gcodeFile,
        status: body.status,
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        totalLayers: body.totalLayers,
        printWeight: body.printWeight,
        printLength: body.printLength,
        haEventId: body.haEventId,
      })
      .returning();

    return NextResponse.json(print, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/prints error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
