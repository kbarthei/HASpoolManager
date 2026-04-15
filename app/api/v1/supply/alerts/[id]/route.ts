import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplyAlerts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!["active", "dismissed", "resolved", "ordered"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db.update(supplyAlerts).set({
    status,
    resolvedAt: status !== "active" ? new Date() : null,
  }).where(eq(supplyAlerts.id, id));

  return NextResponse.json({ ok: true });
}
