import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { captureCoverNowAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { printId } = await request.json();
    if (!printId || typeof printId !== "string") {
      return NextResponse.json({ error: "printId required" }, { status: 400 });
    }
    const result = await captureCoverNowAction(printId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("POST /api/v1/admin/capture-cover error:", error);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
}
