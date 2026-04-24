import { NextRequest, NextResponse } from "next/server";
import { and, desc, gte, lte } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prints } from "@/lib/db/schema";
import { csvResponseHeaders, toCsv } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "name",
  "printer_name",
  "status",
  "started_at",
  "finished_at",
  "duration_seconds",
  "print_weight_g",
  "filament_cost",
  "energy_cost",
  "total_cost",
  "gcode_file",
];

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const filters = [];
  if (from) filters.push(gte(prints.startedAt, new Date(from)));
  if (to) filters.push(lte(prints.startedAt, new Date(to)));

  const rows = await db.query.prints.findMany({
    where: filters.length > 0 ? and(...filters) : undefined,
    orderBy: [desc(prints.startedAt)],
    with: {
      printer: { columns: { name: true } },
    },
  });

  const csv = toCsv(
    rows.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      printer_name: r.printer?.name ?? "",
      status: r.status,
      started_at: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      finished_at: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
      duration_seconds: r.durationSeconds,
      print_weight_g: r.printWeight,
      filament_cost: r.filamentCost,
      energy_cost: r.energyCost,
      total_cost: r.totalCost,
      gcode_file: r.gcodeFile ?? "",
    })),
    COLUMNS,
  );

  const filename = `haspoolmanager-prints-${new Date().toISOString().slice(0, 10)}.csv`;
  const buffer = Buffer.from(csv, "utf-8");
  return new NextResponse(buffer, {
    status: 200,
    headers: csvResponseHeaders(filename, buffer.byteLength),
  });
}
