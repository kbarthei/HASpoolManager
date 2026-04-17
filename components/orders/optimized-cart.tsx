import { db } from "@/lib/db";
import { filaments, shops, shopListings } from "@/lib/db/schema";
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, TrendingDown, AlertCircle, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function parseBulkRules(raw: string | null): BulkDiscountTier[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r) =>
          r && typeof r.minQty === "number" && typeof r.discountPercent === "number"
      )
      .map((r) => ({ minQty: r.minQty, discountPercent: r.discountPercent }));
  } catch {
    return [];
  }
}

export async function OptimizedCart() {
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
    filamentNameById.set(f.id, `${vendor} · ${f.name}`.trim());
  }

  const needs: ReorderNeed[] = statuses
    .filter((s) => s.needsReorder)
    .map((s) => ({
      filamentId: s.filamentId,
      filamentName: filamentNameById.get(s.filamentId) ?? s.filamentId.slice(0, 8),
      quantity: Math.max(1, s.recommendedQty),
      urgency: s.urgency,
    }));

  if (needs.length === 0) {
    return null;
  }

  const listings: ShopListing[] = listingRows
    .filter((l) => (l.pricePerSpool ?? l.currentPrice ?? 0) > 0)
    .map((l) => ({
      shopId: l.shopId,
      filamentId: l.filamentId,
      pricePerSpool: l.pricePerSpool ?? l.currentPrice ?? 0,
      productUrl: l.productUrl,
    }));

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

  const hasContent =
    result.shops.length > 0 ||
    result.unsourced.length > 0 ||
    result.deferredForBudget.length > 0;
  if (!hasContent) return null;

  return (
    <Card className="p-4 space-y-3" data-testid="optimized-cart">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-primary" />
            Optimized Shopping List
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cheapest per-shop proposal for current reorder needs. Free-shipping and bulk-discount hints included.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-semibold">{formatEur(result.grandTotal)}</div>
          <div className="text-[10px] text-muted-foreground">
            {result.shops.length} {result.shops.length === 1 ? "shop" : "shops"}
          </div>
        </div>
      </div>

      {result.shops.map((order) => (
        <div key={order.shopId} className="border border-border rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Package className="w-3.5 h-3.5" />
              {order.shopName}
            </div>
            <div className="text-xs font-mono">{formatEur(order.total)}</div>
          </div>
          <div className="space-y-1">
            {order.items.map((line) => (
              <div key={line.filamentId} className="flex items-center gap-2 text-xs">
                <Badge
                  className={cn(
                    "text-[9px] h-4 px-1 shrink-0",
                    line.urgency === "critical"
                      ? "bg-red-500/15 text-red-600 border-red-500/30"
                      : line.urgency === "warning"
                      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {line.urgency}
                </Badge>
                <span className="flex-1 truncate">
                  {line.quantity}× {line.filamentName}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatEur(line.lineSubtotal)}
                </span>
                {line.productUrl && (
                  <a
                    href={line.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-[10px]"
                  >
                    →
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
            <span>Subtotal {formatEur(order.subtotal)}</span>
            {order.discountPercent > 0 && (
              <span className="text-emerald-600">
                − {order.discountPercent}% ({formatEur(order.discountAmount)})
              </span>
            )}
            <span>
              {order.shipping === 0 ? "Free shipping ✓" : `Shipping ${formatEur(order.shipping)}`}
            </span>
            {order.freeShippingGap != null && (
              <span className="text-amber-600 flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" />
                + {formatEur(order.freeShippingGap)} unlocks free shipping
              </span>
            )}
            {order.nextBulkTier && (
              <span className="text-amber-600 flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" />
                + {order.nextBulkTier.addQty} for {order.nextBulkTier.discountPercent}% off
              </span>
            )}
          </div>
        </div>
      ))}

      {result.deferredForBudget.length > 0 && (
        <div className="border border-amber-500/30 rounded p-2 bg-amber-500/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
            Deferred for budget ({result.deferredForBudget.length})
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {result.deferredForBudget.map((l) => (
              <div key={l.filamentId}>
                {l.quantity}× {l.filamentName} — {formatEur(l.lineSubtotal)}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.unsourced.length > 0 && (
        <div className="border border-border rounded p-2 bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
            Needs a shop ({result.unsourced.length})
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {result.unsourced.map((n) => (
              <div key={n.filamentId}>
                {n.filamentName} — no shop listing configured
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
