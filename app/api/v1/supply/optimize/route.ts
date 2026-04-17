import { NextRequest, NextResponse } from "next/server";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { filaments, shops, shopListings, vendors } from "@/lib/db/schema";
import { runSupplyAnalysis } from "@/lib/supply-engine-db";
import { getBudgetStatus } from "@/lib/budget";
import {
  optimizeOrders,
  type ReorderNeed,
  type ShopConfig,
  type ShopListing,
  type BulkDiscountTier,
} from "@/lib/order-optimizer";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseBulkRules(raw: string | null): BulkDiscountTier[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r) =>
          r &&
          typeof r.minQty === "number" &&
          typeof r.discountPercent === "number" &&
          r.minQty > 0 &&
          r.discountPercent > 0
      )
      .map((r) => ({ minQty: r.minQty, discountPercent: r.discountPercent }));
  } catch {
    return [];
  }
}

/**
 * GET /api/v1/supply/optimize
 *
 * Computes per-shop reorder proposals from current supply analysis +
 * shop-listing prices, applying shipping/discount rules and the monthly
 * budget cap.
 */
export async function GET(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const [statuses, allShops, listingRows, filamentRows, budgetStatus] = await Promise.all([
      runSupplyAnalysis(),
      db.query.shops.findMany({ where: eq(shops.isActive, true) }),
      db.select().from(shopListings),
      db.query.filaments.findMany({ with: { vendor: true } }),
      getBudgetStatus(),
    ]);

    const filamentNameById = new Map<string, string>();
    for (const f of filamentRows) {
      const vendor = f.vendor?.name ?? "Unknown";
      filamentNameById.set(f.id, `${vendor} ${f.name}`.trim());
    }

    const needs: ReorderNeed[] = statuses
      .filter((s) => s.needsReorder)
      .map((s) => ({
        filamentId: s.filamentId,
        filamentName: filamentNameById.get(s.filamentId) ?? s.filamentId.slice(0, 8),
        quantity: Math.max(1, s.recommendedQty),
        urgency: s.urgency,
      }));

    const listings: ShopListing[] = listingRows
      .filter((l) => l.currentPrice != null && l.currentPrice > 0)
      .map((l) => ({
        shopId: l.shopId,
        filamentId: l.filamentId,
        pricePerSpool: l.pricePerSpool ?? l.currentPrice ?? 0,
        productUrl: l.productUrl,
      }))
      .filter((l) => l.pricePerSpool > 0);

    const shopConfigs: ShopConfig[] = allShops.map((s) => ({
      id: s.id,
      name: s.name,
      freeShippingThreshold: s.freeShippingThreshold,
      shippingCost: s.shippingCost,
      bulkDiscountRules: parseBulkRules(s.bulkDiscountRules),
    }));

    const remainingBudget =
      budgetStatus.budget != null
        ? Math.max(0, budgetStatus.budget - budgetStatus.spent)
        : null;

    const result = optimizeOrders(needs, listings, shopConfigs, { remainingBudget });

    return NextResponse.json({
      data: result,
      budget: budgetStatus,
    });
  } catch (error) {
    console.error("GET /api/v1/supply/optimize error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
