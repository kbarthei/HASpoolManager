import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const { path } = await request.json();
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const latest = await db.query.prints.findFirst({
    orderBy: [desc(prints.startedAt)],
  });
  if (!latest) return NextResponse.json({ error: "no print found" }, { status: 404 });

  await db.update(prints).set({ coverImagePath: path, updatedAt: new Date() })
    .where(eq(prints.id, latest.id));

  return NextResponse.json({ ok: true, printId: latest.id });
}
