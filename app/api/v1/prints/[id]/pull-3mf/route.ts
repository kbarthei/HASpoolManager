/**
 * POST /api/v1/prints/[id]/pull-3mf
 *
 * Manually trigger the FTPS auto-pull for a specific print. Use cases:
 *  - The auto-pull at print-start fired but matched the wrong file
 *    (token-overlap heuristic was too loose).
 *  - The auto-pull failed due to wrong/missing access code; user fixed
 *    it and now wants to retroactively populate model_file_id.
 *  - User started the print from the printer's history and the auto-
 *    pull skipped because no MQTT print_started fired.
 *
 * Browser-callable from the print detail UI. Uses optionalAuth — same
 * convention as every admin/UI mutation in this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { optionalAuth } from "@/lib/auth";
import { pullByPrintName } from "@/lib/printer-ftp-pull";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await ctx.params;

  // Optional override — if the auto-match keeps picking the wrong file,
  // the UI can pass `printName` to force a different name to match against.
  let body: { printName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body fine — fall back to print's own name
  }

  const print = await db.query.prints.findFirst({
    where: eq(prints.id, id),
    columns: { id: true, printerId: true, name: true },
  });
  if (!print) {
    return NextResponse.json({ error: "Print not found" }, { status: 404 });
  }
  if (!print.printerId) {
    return NextResponse.json({ error: "Print has no associated printer" }, { status: 400 });
  }

  const matchAgainst = body.printName?.trim() || print.name;
  if (!matchAgainst) {
    return NextResponse.json({ error: "Print has no name and no override provided" }, { status: 400 });
  }

  // Run synchronously (not the fire-and-forget setTimeout pattern the
  // sync-worker uses) so the UI can show success/failure immediately.
  await pullByPrintName(print.printerId, print.id, matchAgainst, null);

  // Re-read prints.model_file_id to surface what actually got linked.
  const after = await db.query.prints.findFirst({
    where: eq(prints.id, id),
    columns: { modelFileId: true, plannedWeightG: true },
  });

  return NextResponse.json({
    ok: true,
    printId: id,
    matchedAgainst: matchAgainst,
    modelFileId: after?.modelFileId ?? null,
    plannedWeightG: after?.plannedWeightG ?? null,
  });
}
