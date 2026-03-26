import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const spool = await db.query.spools.findFirst({
      where: eq(spools.id, id),
      with: {
        filament: { with: { vendor: true } },
        tagMappings: true,
        printUsage: true,
      },
    });

    if (!spool) {
      return NextResponse.json({ error: "Spool not found" }, { status: 404 });
    }

    return NextResponse.json(spool);
  } catch (error) {
    console.error("GET /api/v1/spools/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db
      .update(spools)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(spools.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Spool not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/v1/spools/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(spools)
      .where(eq(spools.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Spool not found" }, { status: 404 });
    }

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("DELETE /api/v1/spools/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
