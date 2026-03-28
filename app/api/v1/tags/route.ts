import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tagMappings } from "@/lib/db/schema";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { validateBody, createTagSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
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
    const raw = await request.json();
    const validation = validateBody(createTagSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { tagUid, spoolId, source } = validation.data;

    const [tag] = await db
      .insert(tagMappings)
      .values({
        tagUid,
        spoolId,
        source,
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
