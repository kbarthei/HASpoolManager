import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopListings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";
import { fetchProductPrice } from "@/lib/price-crawler";

/**
 * POST /api/v1/prices/refresh
 * Body: { filamentId?: string } — refresh one filament's prices, or all if omitted
 */
export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));

    let listings;
    if (body.filamentId) {
      listings = await db.query.shopListings.findMany({
        where: eq(shopListings.filamentId, body.filamentId),
      });
    } else {
      listings = await db.query.shopListings.findMany({
        where: eq(shopListings.isActive, true),
      });
    }

    const results = [];
    for (const listing of listings) {
      const result = await fetchProductPrice(listing.productUrl);

      if (result.price !== null) {
        await db.update(shopListings).set({
          currentPrice: result.price,
          pricePerSpool: result.price / listing.packSize,
          currency: result.currency,
          inStock: result.inStock,
          lastCheckedAt: new Date(),
        }).where(eq(shopListings.id, listing.id));
      } else {
        await db.update(shopListings).set({
          lastCheckedAt: new Date(),
        }).where(eq(shopListings.id, listing.id));
      }

      results.push({
        listingId: listing.id,
        filamentId: listing.filamentId,
        url: listing.productUrl,
        price: result.price,
        currency: result.currency,
        source: result.source,
        inStock: result.inStock,
      });
    }

    return NextResponse.json({ refreshed: results.length, results });
  } catch (error) {
    console.error("POST /api/v1/prices/refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
