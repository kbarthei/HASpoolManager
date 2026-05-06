import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { prints, modelFiles } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const body = (await request.json()) as { modelFileId?: string | null };
    const modelFileId = body.modelFileId ?? null;

    const print = await db.query.prints.findFirst({ where: eq(prints.id, id) });
    if (!print) {
      return NextResponse.json({ error: "Print not found" }, { status: 404 });
    }
    if (modelFileId) {
      const model = await db.query.modelFiles.findFirst({ where: eq(modelFiles.id, modelFileId) });
      if (!model) {
        return NextResponse.json({ error: "Model file not found" }, { status: 404 });
      }
    }

    await db
      .update(prints)
      .set({ modelFileId, updatedAt: new Date() })
      .where(eq(prints.id, id));

    return NextResponse.json({ printId: id, modelFileId });
  } catch (error) {
    console.error(`POST /api/v1/prints/${id}/link-model error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
