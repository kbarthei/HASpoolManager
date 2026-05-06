import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopListings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { optionalAuth } from "@/lib/auth";
import { fetchProductPrice } from "@/lib/price-crawler";
import { validateURL } from "@/lib/url-validator";

/**
 * POST /api/v1/prices/refresh
 * Body: { filamentId?: string } — refresh one filament's prices, or all if omitted
 *
 * SECURITY: Validates all URLs before fetching to prevent SSRF attacks.
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
    let skipped = 0;

    for (const listing of listings) {
      // Pre-validate URL before attempting fetch
      const validation = validateURL(listing.productUrl);
      if (!validation.valid) {
        console.warn(
          `[prices/refresh] Skipping invalid URL for listing ${listing.id}: ${validation.error}`
        );
        results.push({
          listingId: listing.id,
          filamentId: listing.filamentId,
          url: listing.productUrl,
          price: null,
          currency: "EUR",
          source: "failed",
          inStock: null,
          error: validation.error,
        });
        skipped++;
        continue;
      }

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
        error: result.error,
      });
    }

    return NextResponse.json({
      refreshed: results.length - skipped,
      skipped,
      total: results.length,
      results
    });
  } catch (error) {
    console.error("POST /api/v1/prices/refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
