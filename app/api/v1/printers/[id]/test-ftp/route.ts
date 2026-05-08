import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { testFtpConnection } from "@/lib/printer-ftp";

// Browser-callable from the admin Access Code card. optionalAuth matches
// the convention for admin UI actions; LAN-only PWA gating is the
// security boundary, not an in-app Bearer requirement.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  // Body lets the admin UI test unsaved IP/code edits without persisting them
  // first. Both fields fall back to the stored printer row if absent.
  let body: { accessCode?: string; ipAddress?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — fall back to stored values
  }

  const printer = await db.query.printers.findFirst({ where: eq(printers.id, id) });
  if (!printer) {
    return NextResponse.json({ error: "Printer not found" }, { status: 404 });
  }

  const host = (body.ipAddress?.trim() || printer.ipAddress) ?? null;
  if (!host) {
    return NextResponse.json({ error: "Printer has no IP address configured" }, { status: 400 });
  }

  const accessCode = body.accessCode ?? printer.accessCode;
  if (!accessCode) {
    return NextResponse.json({ error: "No access code provided" }, { status: 400 });
  }

  const result = await testFtpConnection({
    host,
    accessCode,
  });

  return NextResponse.json(result);
}
