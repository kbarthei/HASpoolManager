import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { printerAmsUnits, amsSlots, spools } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { validateBody, updateAmsUnitSchema } from "@/lib/validations";
import { eq, and, inArray } from "drizzle-orm";

// PATCH /api/v1/printers/[id]/ams-units/[unitId] — update AMS unit
// Side-effect: disabling a unit moves loaded spools to storage and clears
// slot spool refs so the unit can be re-enabled cleanly later.
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; unitId: string }> },
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id: printerId, unitId } = await ctx.params;

  try {
    const raw = await request.json();
    const validation = validateBody(updateAmsUnitSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const existing = await db.query.printerAmsUnits.findFirst({
      where: and(eq(printerAmsUnits.id, unitId), eq(printerAmsUnits.printerId, printerId)),
    });
    if (!existing) {
      return NextResponse.json({ error: "AMS unit not found" }, { status: 404 });
    }

    await db.update(printerAmsUnits).set({ ...validation.data }).where(eq(printerAmsUnits.id, unitId));

    // Side-effect: if transitioning from enabled → disabled, evict spools
    if (validation.data.enabled === false && existing.enabled) {
      const affectedSlots = await db.query.amsSlots.findMany({
        where: and(
          eq(amsSlots.printerId, printerId),
          eq(amsSlots.amsIndex, existing.amsIndex),
          eq(amsSlots.slotType, existing.slotType),
        ),
      });
      const spoolIds = affectedSlots.map((s) => s.spoolId).filter((x): x is string => x !== null);
      if (spoolIds.length > 0) {
        await db
          .update(spools)
          .set({ location: "storage", updatedAt: new Date() })
          .where(inArray(spools.id, spoolIds));
      }
      if (affectedSlots.length > 0) {
        await db
          .update(amsSlots)
          .set({ spoolId: null, isEmpty: true, updatedAt: new Date() })
          .where(
            and(
              eq(amsSlots.printerId, printerId),
              eq(amsSlots.amsIndex, existing.amsIndex),
              eq(amsSlots.slotType, existing.slotType),
            ),
          );
      }
    }

    const updated = await db.query.printerAmsUnits.findFirst({ where: eq(printerAmsUnits.id, unitId) });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/v1/printers/[id]/ams-units/[unitId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
