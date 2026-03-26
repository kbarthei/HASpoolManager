import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { matchSpool, type MatchRequest } from "@/lib/matching";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body: MatchRequest = await request.json();

    if (!body.tag_uid && !body.tray_info_idx && !body.tray_type && !body.tray_color) {
      return NextResponse.json(
        { error: "At least one of tag_uid, tray_info_idx, tray_type, or tray_color is required" },
        { status: 400 }
      );
    }

    const result = await matchSpool(body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/v1/match error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
