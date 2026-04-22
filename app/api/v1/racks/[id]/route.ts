import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { racks, spools } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { validateBody, updateRackSchema } from "@/lib/validations";
import { eq, like } from "drizzle-orm";

// PATCH /api/v1/racks/[id] — update a rack
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const raw = await request.json();
    const validation = validateBody(updateRackSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const existing = await db.query.racks.findFirst({ where: eq(racks.id, id) });
    if (!existing) {
      return NextResponse.json({ error: "Rack not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(racks)
      .set({ ...validation.data })
      .where(eq(racks.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/v1/racks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/v1/racks/[id] — soft-archive a rack, move its spools to storage
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  try {
    const existing = await db.query.racks.findFirst({ where: eq(racks.id, id) });
    if (!existing) {
      return NextResponse.json({ error: "Rack not found" }, { status: 404 });
    }

    // Move all spools in this rack to storage, then soft-archive the rack.
    // Sequential (not transactional) — better-sqlite3's sync transaction API
    // doesn't mix with async drizzle queries. Idempotent if interrupted.
    await db
      .update(spools)
      .set({ location: "storage", updatedAt: new Date() })
      .where(like(spools.location, `rack:${id}:%`));
    await db.update(racks).set({ archivedAt: new Date() }).where(eq(racks.id, id));

    return NextResponse.json({ id, archived: true });
  } catch (error) {
    console.error("DELETE /api/v1/racks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
