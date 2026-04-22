import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printerAmsUnits } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { eq, and, asc } from "drizzle-orm";
import { buildSlotDefs } from "@/lib/printer-sync-helpers";

// GET /api/v1/printers/[id]/ams-config — topology for the HA sync script.
// Returns enabled AMS units + the expected slot-def mapping so the HA
// script can build the correct payload keys for this printer.
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const units = await db
      .select()
      .from(printerAmsUnits)
      .where(and(eq(printerAmsUnits.printerId, id), eq(printerAmsUnits.enabled, true)))
      .orderBy(asc(printerAmsUnits.amsIndex));

    const slotDefs = buildSlotDefs(units);

    return NextResponse.json({
      units: units.map((u) => ({
        amsIndex: u.amsIndex,
        slotType: u.slotType,
        displayName: u.displayName,
      })),
      slotDefs,
    });
  } catch (error) {
    console.error("GET /api/v1/printers/[id]/ams-config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
