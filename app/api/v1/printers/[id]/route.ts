import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// GET /api/v1/printers/:id — Get printer with amsSlots (each with spool)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const printer = await db.query.printers.findFirst({
      where: eq(printers.id, id),
      with: {
        amsSlots: {
          with: { spool: true },
        },
      },
    });

    if (!printer) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(printer);
  } catch (error) {
    console.error("GET /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/v1/printers/:id — Update printer
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
      .update(printers)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(printers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/printers/:id — Delete printer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(printers)
      .where(eq(printers.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("DELETE /api/v1/printers/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
