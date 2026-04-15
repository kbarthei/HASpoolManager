import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runSupplyAnalysis, updateSupplyAlerts, backfillConsumptionStats, updateShopLeadTimes } from "@/lib/supply-engine-db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    // Backfill consumption stats from print history (idempotent)
    const backfilled = await backfillConsumptionStats();

    // Update shop lead times
    await updateShopLeadTimes();

    // Run analysis
    const statuses = await runSupplyAnalysis();

    // Generate/update alerts
    await updateSupplyAlerts(statuses);

    revalidatePath("/");
    revalidatePath("/orders");

    return NextResponse.json({
      data: statuses,
      backfilled,
      alertsUpdated: true,
    });
  } catch (error) {
    console.error("POST /api/v1/supply/analyze error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
