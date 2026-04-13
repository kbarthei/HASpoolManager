import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filaments } from "@/lib/db/schema";
import { eq, and, type SQL } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { validateBody, createFilamentSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const material = searchParams.get("material");
    const vendorId = searchParams.get("vendor_id");

    const conditions: SQL[] = [];
    if (material) conditions.push(eq(filaments.material, material));
    if (vendorId) conditions.push(eq(filaments.vendorId, vendorId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const allFilaments = await db.query.filaments.findMany({
      where,
      with: { vendor: true },
    });

    return NextResponse.json(allFilaments);
  } catch (error) {
    console.error("Failed to list filaments:", error);
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
    const raw = await request.json();
    const validation = validateBody(createFilamentSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
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
    } = validation.data;

    const [filament] = await db
      .insert(filaments)
      .values({
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
      })
      .returning();

    return NextResponse.json(filament, { status: 201 });
  } catch (error) {
    console.error("Failed to create filament:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
