/**
 * Order optimizer — pure functions. Given reorder needs + shop-listing prices
 * + shop configuration, return per-shop grouped proposals with free-shipping
 * top-up hints, bulk discount application, and budget enforcement.
 *
 * No DB access here — callers hydrate inputs and write results back. Keeps
 * the logic unit-testable without a harness.
 */

export interface BulkDiscountTier {
  /** Minimum quantity at this tier (inclusive). */
  minQty: number;
  /** Percent discount off subtotal (0–100). */
  discountPercent: number;
}

export interface ShopConfig {
  id: string;
  name: string;
  /** Free-shipping kicks in when the per-shop subtotal reaches this. */
  freeShippingThreshold: number | null;
  /** Flat shipping cost applied when subtotal is below the threshold. */
  shippingCost: number | null;
  /** Sorted low→high by minQty. */
  bulkDiscountRules: BulkDiscountTier[];
}

export interface ShopListing {
  shopId: string;
  filamentId: string;
  pricePerSpool: number;
  productUrl?: string | null;
}

export interface ReorderNeed {
  filamentId: string;
  filamentName: string;
  /** Number of spools to order. */
  quantity: number;
  urgency: "critical" | "warning" | "ok";
}

export interface OptimizedLine {
  filamentId: string;
  filamentName: string;
  quantity: number;
  pricePerSpool: number;
  lineSubtotal: number;
  urgency: ReorderNeed["urgency"];
  productUrl?: string | null;
}

export interface OptimizedShopOrder {
  shopId: string;
  shopName: string;
  items: OptimizedLine[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  shipping: number;
  total: number;
  /** Hint: adding this much value unlocks free shipping. */
  freeShippingGap: number | null;
  /** Hint: how many more units reach the next bulk discount. */
  nextBulkTier: { addQty: number; discountPercent: number } | null;
}

export interface OptimizerResult {
  shops: OptimizedShopOrder[];
  /** Total across all shop orders (EUR). */
  grandTotal: number;
  /** Items we couldn't source from any configured shop. */
  unsourced: ReorderNeed[];
  /** Items trimmed because we hit the budget cap — still suggested. */
  deferredForBudget: OptimizedLine[];
}

export interface OptimizeOptions {
  /** Remaining budget this period (EUR). null disables budget cap. */
  remainingBudget: number | null;
}

/** Pick the cheapest shop for each need, or null if no listing exists. */
function cheapestShopFor(need: ReorderNeed, listings: ShopListing[]): ShopListing | null {
  const candidates = listings.filter((l) => l.filamentId === need.filamentId);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.pricePerSpool < best.pricePerSpool ? c : best));
}

/** Best bulk discount applicable at this quantity (returns 0 if none). */
function applicableBulkDiscount(qty: number, rules: BulkDiscountTier[]): number {
  const sorted = [...rules].sort((a, b) => b.minQty - a.minQty);
  for (const tier of sorted) {
    if (qty >= tier.minQty) return tier.discountPercent;
  }
  return 0;
}

function nextBulkTier(qty: number, rules: BulkDiscountTier[]): { addQty: number; discountPercent: number } | null {
  const higher = rules
    .filter((r) => r.minQty > qty)
    .sort((a, b) => a.minQty - b.minQty);
  if (higher.length === 0) return null;
  return { addQty: higher[0].minQty - qty, discountPercent: higher[0].discountPercent };
}

/** Ranks needs by urgency (critical first) then by quantity. */
function rankNeeds(needs: ReorderNeed[]): ReorderNeed[] {
  const rank: Record<ReorderNeed["urgency"], number> = { critical: 0, warning: 1, ok: 2 };
  return [...needs].sort((a, b) => {
    const diff = rank[a.urgency] - rank[b.urgency];
    return diff !== 0 ? diff : b.quantity - a.quantity;
  });
}

export function optimizeOrders(
  needs: ReorderNeed[],
  listings: ShopListing[],
  shops: ShopConfig[],
  options: OptimizeOptions = { remainingBudget: null }
): OptimizerResult {
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const linesByShop = new Map<string, OptimizedLine[]>();
  const unsourced: ReorderNeed[] = [];
  const deferred: OptimizedLine[] = [];

  let runningTotal = 0;

  for (const need of rankNeeds(needs)) {
    const listing = cheapestShopFor(need, listings);
    if (!listing) {
      unsourced.push(need);
      continue;
    }
    const line: OptimizedLine = {
      filamentId: need.filamentId,
      filamentName: need.filamentName,
      quantity: need.quantity,
      pricePerSpool: listing.pricePerSpool,
      lineSubtotal: listing.pricePerSpool * need.quantity,
      urgency: need.urgency,
      productUrl: listing.productUrl ?? null,
    };

    // Tentatively add → re-compute shop totals → check budget
    const lines = linesByShop.get(listing.shopId) ?? [];
    const tentative = [...lines, line];
    const tentativeTotal = priceShopOrder(tentative, shopMap.get(listing.shopId));

    if (options.remainingBudget != null) {
      const currentShopCost = computeShopTotal(lines, shopMap.get(listing.shopId));
      const delta = tentativeTotal.total - currentShopCost;
      if (runningTotal + delta > options.remainingBudget && need.urgency !== "critical") {
        deferred.push(line);
        continue;
      }
      runningTotal += delta;
    }

    linesByShop.set(listing.shopId, tentative);
  }

  const shopsOut: OptimizedShopOrder[] = [];
  for (const [shopId, lines] of linesByShop.entries()) {
    const cfg = shopMap.get(shopId);
    const priced = priceShopOrder(lines, cfg);
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    shopsOut.push({
      shopId,
      shopName: cfg?.name ?? shopId,
      items: lines,
      subtotal: priced.subtotal,
      discountAmount: priced.discountAmount,
      discountPercent: priced.discountPercent,
      shipping: priced.shipping,
      total: priced.total,
      freeShippingGap:
        cfg?.freeShippingThreshold != null && priced.subtotal < cfg.freeShippingThreshold
          ? Math.round((cfg.freeShippingThreshold - priced.subtotal) * 100) / 100
          : null,
      nextBulkTier: cfg ? nextBulkTier(totalQty, cfg.bulkDiscountRules) : null,
    });
  }

  shopsOut.sort((a, b) => b.total - a.total);
  const grandTotal = shopsOut.reduce((s, o) => s + o.total, 0);

  return {
    shops: shopsOut,
    grandTotal: Math.round(grandTotal * 100) / 100,
    unsourced,
    deferredForBudget: deferred,
  };
}

interface PricedShop {
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  shipping: number;
  total: number;
}

function priceShopOrder(lines: OptimizedLine[], cfg: ShopConfig | undefined): PricedShop {
  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineSubtotal, 0) * 100) / 100;
  if (!cfg) {
    return { subtotal, discountAmount: 0, discountPercent: 0, shipping: 0, total: subtotal };
  }
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const discountPercent = applicableBulkDiscount(totalQty, cfg.bulkDiscountRules);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const shipping =
    cfg.freeShippingThreshold != null && afterDiscount >= cfg.freeShippingThreshold
      ? 0
      : cfg.shippingCost ?? 0;
  const total = Math.round((afterDiscount + shipping) * 100) / 100;
  return { subtotal, discountAmount, discountPercent, shipping, total };
}

function computeShopTotal(lines: OptimizedLine[], cfg: ShopConfig | undefined): number {
  return priceShopOrder(lines, cfg).total;
}
