import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

// GET /api/v1/prints/:id — Get print with printer and usage (with spool)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const print = await db.query.prints.findFirst({
      where: eq(prints.id, id),
      with: {
        printer: true,
        usage: {
          with: { spool: true },
        },
      },
    });

    if (!print) {
      return NextResponse.json(
        { error: "Print not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(print);
  } catch (error) {
    console.error("GET /api/v1/prints/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/v1/prints/:id — Update print
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      gcodeFile,
      status,
      finishedAt,
      durationSeconds,
      totalLayers,
      printWeight,
      printLength,
      filamentCost,
      energyCost,
      totalCost,
      notes,
    } = body;

    const [updated] = await db
      .update(prints)
      .set({
        name,
        gcodeFile,
        status,
        finishedAt: finishedAt ? new Date(finishedAt) : undefined,
        durationSeconds,
        totalLayers,
        printWeight,
        printLength,
        filamentCost,
        energyCost,
        totalCost,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(prints.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Print not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/v1/prints/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
