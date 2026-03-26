import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spools } from "@/lib/db/schema";
import { eq, and, type SQL } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const location = searchParams.get("location");
    const filamentId = searchParams.get("filament_id");

    const filters: SQL[] = [];
    if (status) filters.push(eq(spools.status, status));
    if (location) filters.push(eq(spools.location, location));
    if (filamentId) filters.push(eq(spools.filamentId, filamentId));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const results = await db.query.spools.findMany({
      where,
      with: {
        filament: { with: { vendor: true } },
        tagMappings: true,
      },
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/v1/spools error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    const [spool] = await db
      .insert(spools)
      .values({
        filamentId: body.filamentId,
        lotNumber: body.lotNumber,
        purchaseDate: body.purchaseDate,
        purchasePrice: body.purchasePrice,
        currency: body.currency,
        initialWeight: body.initialWeight,
        remainingWeight: body.remainingWeight ?? body.initialWeight,
        location: body.location,
        status: body.status,
        notes: body.notes,
      })
      .returning();

    return NextResponse.json(spool, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/spools error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
