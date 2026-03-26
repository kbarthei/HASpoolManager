import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tagMappings } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const results = await db.query.tagMappings.findMany({
      with: { spool: true },
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/v1/tags error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    const [tag] = await db
      .insert(tagMappings)
      .values({
        tagUid: body.tagUid,
        spoolId: body.spoolId,
        source: body.source,
      })
      .returning();

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/tags error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
