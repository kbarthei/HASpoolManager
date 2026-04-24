import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { spools } from "@/lib/db/schema";
import { csvResponseHeaders, toCsv } from "@/lib/export-csv";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "filament_name",
  "vendor",
  "material",
  "color_hex",
  "bambu_idx",
  "initial_weight_g",
  "remaining_weight_g",
  "location",
  "status",
  "purchase_price",
  "currency",
  "purchase_date",
  "lot_number",
  "first_used_at",
  "last_used_at",
];

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("include_archived") === "1";

  const rows = await db.query.spools.findMany({
    orderBy: [asc(spools.createdAt)],
    with: {
      filament: { with: { vendor: { columns: { name: true } } } },
    },
  });

  const filtered = includeArchived ? rows : rows.filter((r) => r.status !== "archived");

  const csv = toCsv(
    filtered.map((r) => ({
      id: r.id,
      filament_name: r.filament?.name ?? "",
      vendor: r.filament?.vendor?.name ?? "",
      material: r.filament?.material ?? "",
      color_hex: r.filament?.colorHex ?? "",
      bambu_idx: r.filament?.bambuIdx ?? "",
      initial_weight_g: r.initialWeight,
      remaining_weight_g: r.remainingWeight,
      location: r.location ?? "",
      status: r.status,
      purchase_price: r.purchasePrice,
      currency: r.currency ?? "",
      purchase_date: r.purchaseDate ?? "",
      lot_number: r.lotNumber ?? "",
      first_used_at: r.firstUsedAt ? new Date(r.firstUsedAt).toISOString() : null,
      last_used_at: r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : null,
    })),
    COLUMNS,
  );

  const filename = `haspoolmanager-spools-${new Date().toISOString().slice(0, 10)}.csv`;
  const buffer = Buffer.from(csv, "utf-8");
  return new NextResponse(buffer, {
    status: 200,
    headers: csvResponseHeaders(filename, buffer.byteLength),
  });
}
