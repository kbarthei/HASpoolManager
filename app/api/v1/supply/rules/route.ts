import { NextRequest, NextResponse } from "next/server";
import { optionalAuth, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplyRules } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const rules = await db.query.supplyRules.findMany({
    orderBy: [desc(supplyRules.createdAt)],
    with: {
      filament: { with: { vendor: true } },
      vendor: true,
      preferredShop: true,
    },
  });

  return NextResponse.json({ data: rules });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const body = await request.json();
  const { filament_id, material, vendor_id, min_spools, max_stock_spools, preferred_shop_id, max_price_per_spool } = body;

  if (!filament_id && !material) {
    return NextResponse.json({ error: "filament_id or material required" }, { status: 400 });
  }

  const [rule] = await db.insert(supplyRules).values({
    filamentId: filament_id ?? null,
    material: material ?? null,
    vendorId: vendor_id ?? null,
    source: "manual",
    isConfirmed: true,
    minSpools: min_spools ?? 1,
    maxStockSpools: max_stock_spools ?? 5,
    preferredShopId: preferred_shop_id ?? null,
    maxPricePerSpool: max_price_per_spool ?? null,
  }).returning();

  return NextResponse.json({ data: rule }, { status: 201 });
}
