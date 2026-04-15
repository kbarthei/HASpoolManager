import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { printUsage, prints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { sqlCoalesceSumCost } from "@/lib/db/sql-helpers";

/**
 * PATCH /api/v1/prints/[id]/usage/[usageId]
 * Update the weight_used for a specific print_usage record.
 * Recalculates cost and the print's total_cost.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; usageId: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id: printId, usageId } = await params;

  let weightUsed: number;
  try {
    const body = await request.json();
    weightUsed = Number(body.weightUsed);
    if (isNaN(weightUsed) || weightUsed < 0) {
      return NextResponse.json({ error: "Invalid weightUsed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Update weight
  await db.update(printUsage).set({ weightUsed }).where(eq(printUsage.id, usageId));

  // Recalculate cost for this usage record
  const usage = await db.query.printUsage.findFirst({
    where: eq(printUsage.id, usageId),
    with: {
      spool: true,
    },
  });

  if (usage?.spool?.purchasePrice && usage.spool.initialWeight > 0) {
    const pricePerGram = usage.spool.purchasePrice / usage.spool.initialWeight;
    const cost = Math.round(pricePerGram * weightUsed * 100) / 100;
    await db.update(printUsage).set({ cost }).where(eq(printUsage.id, usageId));
  } else {
    // Clear cost if spool has no price info
    await db.update(printUsage).set({ cost: null }).where(eq(printUsage.id, usageId));
  }

  // Recalculate filament cost on the print, then recompute totalCost
  const [{ total }] = await db
    .select({ total: sqlCoalesceSumCost() })
    .from(printUsage)
    .where(eq(printUsage.printId, printId));

  const currentPrint = await db.query.prints.findFirst({
    where: eq(prints.id, printId),
    columns: { energyCost: true },
  });
  const energyCost = currentPrint?.energyCost ?? 0;
  const filamentCost = total ?? 0;

  await db
    .update(prints)
    .set({
      filamentCost,
      totalCost: Math.round((filamentCost + energyCost) * 100) / 100,
      updatedAt: new Date(),
    })
    .where(eq(prints.id, printId));

  // Also adjust spool remaining weight — not done here intentionally:
  // weight adjustments on usage records are corrections, not live deductions.
  // The spool weight is managed by printer-sync and manual adjustment.

  revalidatePath("/prints");

  return NextResponse.json({ ok: true });
}
