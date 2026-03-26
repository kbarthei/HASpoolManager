import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filaments } from "@/lib/db/schema";
import { eq, and, type SQL } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
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

    if (!vendorId || !name || !material) {
      return NextResponse.json(
        { error: "vendorId, name, and material are required" },
        { status: 400 }
      );
    }

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
