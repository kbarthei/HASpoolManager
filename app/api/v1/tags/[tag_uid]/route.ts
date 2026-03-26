import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tagMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag_uid: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { tag_uid } = await params;

    const tag = await db.query.tagMappings.findFirst({
      where: eq(tagMappings.tagUid, tag_uid),
      with: {
        spool: {
          with: {
            filament: { with: { vendor: true } },
          },
        },
      },
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Tag mapping not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tag);
  } catch (error) {
    console.error("GET /api/v1/tags/[tag_uid] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tag_uid: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { tag_uid } = await params;

    const [deleted] = await db
      .delete(tagMappings)
      .where(eq(tagMappings.tagUid, tag_uid))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Tag mapping not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(deleted);
  } catch (error) {
    console.error("DELETE /api/v1/tags/[tag_uid] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
