import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prints, printUsage, spools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { validateBody, printFinishedSchema } from "@/lib/validations";

/**
 * POST /api/v1/events/print-finished
 *
 * Called by HA when gcode_state changes to FINISH, FAILED, or is canceled.
 * Updates print record, deducts weight from spools, calculates cost.
 * Idempotent: won't re-deduct if ha_event_id already processed.
 *
 * Body:
 *   ha_event_id: string (matches the print-started event)
 *   print_id?: string (UUID, alternative to ha_event_id)
 *   status: "finished" | "failed" | "cancelled"
 *   finished_at?: string (ISO 8601, defaults to now)
 *   duration_seconds?: number
 *   print_weight?: number (actual total weight used in grams)
 *   usage: Array<{
 *     spool_id: string
 *     weight_used: number (grams)
 *     length_used?: number (mm)
 *   }>
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(printFinishedSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    // Find the print record
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
        { error: "Print not found. Send print-started first." },
        { status: 404 }
      );
    }

    // Idempotency: if print is already finished, don't re-process
    if (print.status !== "running") {
      return NextResponse.json({
        print_id: print.id,
        status: "already_processed",
        print_status: print.status,
      });
    }

    const finishedAt = body.finished_at ? new Date(body.finished_at) : new Date();
    const durationSeconds =
      body.duration_seconds ||
      (print.startedAt
        ? Math.floor((finishedAt.getTime() - new Date(print.startedAt).getTime()) / 1000)
        : null);

    // Process usage entries: deduct weight and calculate cost
    const deductions: Array<{
      spool_id: string;
      previous_weight: number;
      new_weight: number;
      cost: number;
    }> = [];
    const warnings: string[] = [];
    let totalCost = 0;

    if (body.usage && body.usage.length > 0) {
      for (const entry of body.usage) {
        const spool = await db.query.spools.findFirst({
          where: eq(spools.id, entry.spool_id),
          with: { filament: true },
        });

        if (!spool) {
          warnings.push(`Spool ${entry.spool_id} not found`);
          continue;
        }

        const previousWeight = spool.remainingWeight;
        const newWeight = Math.max(0, previousWeight - Math.round(entry.weight_used));
        const pricePerGram = spool.purchasePrice
          ? parseFloat(spool.purchasePrice) / spool.initialWeight
          : 0;
        const cost = Math.round(entry.weight_used * pricePerGram * 100) / 100;
        totalCost += cost;

        // Deduct weight from spool
        await db
          .update(spools)
          .set({
            remainingWeight: newWeight,
            lastUsedAt: finishedAt,
            firstUsedAt: spool.firstUsedAt || finishedAt,
            status: newWeight <= 0 ? "empty" : "active",
            updatedAt: new Date(),
          })
          .where(eq(spools.id, spool.id));

        // Create usage record
        await db.insert(printUsage).values({
          printId: print.id,
          spoolId: spool.id,
          weightUsed: entry.weight_used,
          lengthUsed: entry.length_used || null,
          cost: String(cost),
        });

        deductions.push({
          spool_id: spool.id,
          previous_weight: previousWeight,
          new_weight: newWeight,
          cost,
        });
      }
    }

    // Update print record
    await db
      .update(prints)
      .set({
        status: body.status || "finished",
        finishedAt,
        durationSeconds,
        printWeight: body.print_weight || null,
        totalCost: String(totalCost),
        updatedAt: new Date(),
      })
      .where(eq(prints.id, print.id));

    return NextResponse.json({
      print_id: print.id,
      status: body.status || "finished",
      deductions,
      total_cost: totalCost,
      warnings,
    });
  } catch (error) {
    console.error("POST /api/v1/events/print-finished error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
