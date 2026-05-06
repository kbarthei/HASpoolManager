import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelFiles, modelFileFilaments } from "@/lib/db/schema";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { computeCompatibility } from "@/lib/model-file-compatibility";
import { deleteModelFileDir } from "@/lib/model-file-store";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const model = await db.query.modelFiles.findFirst({
      where: eq(modelFiles.id, id),
    });
    if (!model) {
      return NextResponse.json({ error: "Model file not found" }, { status: 404 });
    }

    const filaments = await db
      .select()
      .from(modelFileFilaments)
      .where(eq(modelFileFilaments.modelFileId, id));

    const compatibility = await computeCompatibility(id);
    const warnings = model.parseWarnings ? safeParseJson(model.parseWarnings) : [];

    return NextResponse.json({
      ...model,
      parseWarnings: warnings,
      filaments,
      compatibility,
    });
  } catch (error) {
    console.error(`GET /api/v1/models/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const existing = await db.query.modelFiles.findFirst({
      where: eq(modelFiles.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: "Model file not found" }, { status: 404 });
    }

    await db.delete(modelFiles).where(eq(modelFiles.id, id)); // cascades to filaments via FK
    deleteModelFileDir(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/v1/models/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
