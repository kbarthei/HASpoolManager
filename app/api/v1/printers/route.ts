import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { validateBody, createPrinterSchema } from "@/lib/validations";

// GET /api/v1/printers — List all printers with amsSlots
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const result = await db.query.printers.findMany({
      with: { amsSlots: { with: { spool: { with: { filament: { with: { vendor: true } } } } } } },
      orderBy: (printers, { asc }) => [asc(printers.name)],
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/v1/printers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/v1/printers — Create a printer
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(createPrinterSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    const [printer] = await db
      .insert(printers)
      .values({
        name: body.name,
        model: body.model,
        ipAddress: body.ipAddress,
      })
      .returning();

    return NextResponse.json(printer, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/printers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
