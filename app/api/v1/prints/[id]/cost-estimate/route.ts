import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { computeCostEstimate } from "@/lib/print-cost-estimate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const estimate = await computeCostEstimate(id);
  if (!estimate) {
    return NextResponse.json({ error: "Print not found" }, { status: 404 });
  }
  return NextResponse.json(estimate);
}
