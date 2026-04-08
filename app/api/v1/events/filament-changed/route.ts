import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints, printUsage, spools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { matchSpool } from "@/lib/matching";

/**
 * POST /api/v1/events/filament-changed
 *
 * Called by HA when the printer switches filament mid-print.
 * Records usage for the old spool and identifies the new spool.
 *
 * Body:
 *   ha_event_id: string (of the running print)
 *   print_id?: string (UUID, alternative)
 *   old_spool: {
 *     spool_id?: string
 *     weight_used: number (grams used before the switch)
 *   }
 *   new_tray: {
 *     tag_uid?: string
 *     tray_info_idx?: string
 *     tray_type?: string
 *     tray_color?: string
 *     tray_sub_brands?: string
 *     printer_id?: string
 *     ams_index?: number
 *     tray_index?: number
 *   }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();

    // Find the running print
    let print;
    if (body.print_id) {
      print = await db.query.prints.findFirst({
        where: eq(prints.id, body.print_id),
      });
    } else if (body.ha_event_id) {
      print = await db.query.prints.findFirst({
        where: eq(prints.haEventId, body.ha_event_id),
      });
    }

    if (!print) {
      return NextResponse.json(
        { error: "Running print not found" },
        { status: 404 }
      );
    }

    if (print.status !== "running") {
      return NextResponse.json(
        { error: "Print is not running", print_status: print.status },
        { status: 409 }
      );
    }

    const result: {
      old_spool_usage?: { spool_id: string; weight_used: number; cost: number };
      new_spool_match?: { spool_id: string; confidence: number; method: string };
    } = {};

    // Record usage for the old spool
    if (body.old_spool?.spool_id && body.old_spool?.weight_used) {
      const spool = await db.query.spools.findFirst({
        where: eq(spools.id, body.old_spool.spool_id),
      });

      if (spool) {
        const pricePerGram = spool.purchasePrice
          ? spool.purchasePrice / spool.initialWeight
          : 0;
        const cost = Math.round(body.old_spool.weight_used * pricePerGram * 100) / 100;

        await db.insert(printUsage).values({
          printId: print.id,
          spoolId: spool.id,
          weightUsed: body.old_spool.weight_used,
          cost,
        });

        // Deduct weight
        const newWeight = Math.max(0, spool.remainingWeight - Math.round(body.old_spool.weight_used));
        await db
          .update(spools)
          .set({
            remainingWeight: newWeight,
            lastUsedAt: new Date(),
            status: newWeight <= 0 ? "empty" : "active",
            updatedAt: new Date(),
          })
          .where(eq(spools.id, spool.id));

        result.old_spool_usage = {
          spool_id: spool.id,
          weight_used: body.old_spool.weight_used,
          cost,
        };
      }
    }

    // Match the new spool
    if (body.new_tray) {
      const matchResult = await matchSpool(body.new_tray);
      if (matchResult.match) {
        result.new_spool_match = {
          spool_id: matchResult.match.spool_id,
          confidence: matchResult.match.confidence,
          method: matchResult.match.match_method,
        };
      }
    }

    return NextResponse.json({
      print_id: print.id,
      status: "filament_changed",
      ...result,
    });
  } catch (error) {
    console.error("POST /api/v1/events/filament-changed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
