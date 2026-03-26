import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/v1/events/print-started
 *
 * Called by HA when gcode_state changes to RUNNING.
 * Creates a print record. Idempotent via ha_event_id.
 *
 * Body:
 *   printer_id: string (UUID)
 *   name?: string (print job name)
 *   gcode_file?: string
 *   total_layers?: number
 *   print_weight?: number (estimated total weight in grams)
 *   print_length?: number (estimated total length in mm)
 *   ha_event_id: string (unique event ID for idempotency)
 *   started_at?: string (ISO 8601, defaults to now)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    if (!body.printer_id) {
      return NextResponse.json(
        { error: "printer_id is required" },
        { status: 400 }
      );
    }

    // Idempotency check
    if (body.ha_event_id) {
      const existing = await db.query.prints.findFirst({
        where: eq(prints.haEventId, body.ha_event_id),
      });
      if (existing) {
        return NextResponse.json(
          { print_id: existing.id, status: "already_exists" },
          { status: 200 }
        );
      }
    }

    const [print] = await db
      .insert(prints)
      .values({
        printerId: body.printer_id,
        name: body.name || null,
        gcodeFile: body.gcode_file || null,
        status: "running",
        startedAt: body.started_at ? new Date(body.started_at) : new Date(),
        totalLayers: body.total_layers || null,
        printWeight: body.print_weight || null,
        printLength: body.print_length || null,
        haEventId: body.ha_event_id || null,
      })
      .returning();

    return NextResponse.json(
      { print_id: print.id, status: "created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/v1/events/print-started error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
