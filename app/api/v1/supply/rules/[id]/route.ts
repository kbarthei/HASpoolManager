import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplyRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await request.json();

  await db.update(supplyRules).set({
    minSpools: body.min_spools,
    maxStockSpools: body.max_stock_spools,
    preferredShopId: body.preferred_shop_id,
    maxPricePerSpool: body.max_price_per_spool,
    isActive: body.is_active,
    isConfirmed: body.is_confirmed,
    updatedAt: new Date(),
  }).where(eq(supplyRules.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  await db.delete(supplyRules).where(eq(supplyRules.id, id));
  return NextResponse.json({ ok: true });
}
