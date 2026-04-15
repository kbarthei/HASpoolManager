import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { runSupplyAnalysis } from "@/lib/supply-engine-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const statuses = await runSupplyAnalysis();
    return NextResponse.json({ data: statuses });
  } catch (error) {
    console.error("GET /api/v1/supply/status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
