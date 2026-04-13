import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filaments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const filament = await db.query.filaments.findFirst({
      where: eq(filaments.id, id),
      with: { vendor: true },
    });

    if (!filament) {
      return NextResponse.json(
        { error: "Filament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(filament);
  } catch (error) {
    console.error("Failed to get filament:", error);
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
    const {
      vendorId,
      name,
      material,
      diameter,
      density,
      colorName,
      colorHex,
      nozzleTempDefault,
      nozzleTempMin,
      nozzleTempMax,
      bedTempDefault,
      bedTempMin,
      bedTempMax,
      spoolWeight,
      bambuIdx,
      notes,
    } = body;

    const [filament] = await db
      .update(filaments)
      .set({
        vendorId,
        name,
        material,
        diameter,
        density,
        colorName,
        colorHex,
        nozzleTempDefault,
        nozzleTempMin,
        nozzleTempMax,
        bedTempDefault,
        bedTempMin,
        bedTempMax,
        spoolWeight,
        bambuIdx,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(filaments.id, id))
      .returning();

    if (!filament) {
      return NextResponse.json(
        { error: "Filament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(filament);
  } catch (error) {
    console.error("Failed to update filament:", error);
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
    const [filament] = await db
      .delete(filaments)
      .where(eq(filaments.id, id))
      .returning();

    if (!filament) {
      return NextResponse.json(
        { error: "Filament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(filament);
  } catch (error) {
    console.error("Failed to delete filament:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
