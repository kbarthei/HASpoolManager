import { NextRequest, NextResponse } from "next/server";
import { requireAuth, optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hmsEvents, prints, amsSlots, spools } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { parseHmsCodeString } from "@/lib/printer-sync-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/events/hms
 *
 * Store one or more HMS events from the sync worker.
 * Resolves spool/filament from AMS slot mapping when the error code contains slot info.
 *
 * Body: { printer_id, events: [{ code, message, severity, wiki_url, raw_attr?, raw_code? }] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { printer_id, events } = body;

    if (!printer_id || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "printer_id and events[] required" }, { status: 400 });
    }

    // Find currently running print (if any)
    const runningPrint = await db.query.prints.findFirst({
      where: and(eq(prints.printerId, printer_id), eq(prints.status, "running")),
      columns: { id: true },
    });

    const stored: string[] = [];

    for (const evt of events) {
      const hmsCode = String(evt.code ?? "").replace(/^HMS_/i, "");
      if (!hmsCode) continue;

      // Parse the code to extract module, severity, slot info
      const parsed = parseHmsCodeString(hmsCode);
      const moduleName = parsed?.module ?? "unknown";
      const severity = evt.severity ?? parsed?.severity ?? "unknown";
      const slotKey = parsed?.slotKey ?? null;

      // Resolve spool + filament from AMS slot if we have slot info
      let spoolId: string | null = null;
      let filamentId: string | null = null;

      if (slotKey) {
        const slot = await db.query.amsSlots.findFirst({
          where: and(
            eq(amsSlots.printerId, printer_id),
            eq(amsSlots.slotType, slotKey.startsWith("slot_ht") ? "ams_ht" : "ams"),
            eq(amsSlots.trayIndex, (parsed?.slotIndex ?? 1) - 1),
          ),
          with: { spool: { columns: { id: true, filamentId: true } } },
        });
        if (slot?.spool) {
          spoolId = slot.spool.id;
          filamentId = slot.spool.filamentId;
        }
      }

      // Deduplicate: skip if same code was stored in the last 60 seconds for this printer
      // Use SQL datetime comparison to avoid timezone parsing issues
      const [dupCheck] = await db.select({ count: sql<number>`count(*)` })
        .from(hmsEvents)
        .where(and(
          eq(hmsEvents.printerId, printer_id),
          eq(hmsEvents.hmsCode, hmsCode),
          sql`${hmsEvents.createdAt} > datetime('now', '-60 seconds')`,
        ));
      if (dupCheck.count > 0) continue;

      const [row] = await db.insert(hmsEvents).values({
        printerId: printer_id,
        printId: runningPrint?.id ?? null,
        spoolId,
        filamentId,
        hmsCode,
        module: moduleName,
        severity,
        message: evt.message ?? null,
        wikiUrl: evt.wiki_url ?? null,
        slotKey,
        rawAttr: evt.raw_attr ?? null,
        rawCode: evt.raw_code ?? null,
      }).returning({ id: hmsEvents.id });

      stored.push(row.id);
    }

    return NextResponse.json({ stored: stored.length, ids: stored });
  } catch (error) {
    console.error("POST /api/v1/events/hms error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/v1/events/hms
 *
 * Query HMS events with optional filters.
 * Query params: printer_id, filament_id, module, limit (default 50)
 */
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  const events = await db.query.hmsEvents.findMany({
    orderBy: [desc(hmsEvents.createdAt)],
    limit,
    with: {
      spool: { with: { filament: { with: { vendor: true } } } },
      print: { columns: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json(events);
}
