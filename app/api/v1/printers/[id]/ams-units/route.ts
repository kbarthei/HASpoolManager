import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printerAmsUnits } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";

// GET /api/v1/printers/[id]/ams-units — list AMS units for a printer
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const rows = await db
      .select()
      .from(printerAmsUnits)
      .where(eq(printerAmsUnits.printerId, id))
      .orderBy(asc(printerAmsUnits.slotType), asc(printerAmsUnits.amsIndex));
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/v1/printers/[id]/ams-units error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
