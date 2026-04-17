import { describe, it, expect } from "vitest";
import {
  optimizeOrders,
  type ReorderNeed,
  type ShopListing,
  type ShopConfig,
} from "@/lib/order-optimizer";

const SHOP_A: ShopConfig = {
  id: "shop-a",
  name: "Shop A",
  freeShippingThreshold: 50,
  shippingCost: 4.99,
  bulkDiscountRules: [
    { minQty: 3, discountPercent: 5 },
    { minQty: 5, discountPercent: 10 },
  ],
};
const SHOP_B: ShopConfig = {
  id: "shop-b",
  name: "Shop B",
  freeShippingThreshold: null,
  shippingCost: 3.5,
  bulkDiscountRules: [],
};

const FIL_1 = { filamentId: "f1", filamentName: "PLA Black" };
const FIL_2 = { filamentId: "f2", filamentName: "PLA White" };

describe("optimizeOrders", () => {
  it("picks the cheapest shop per filament", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 1, urgency: "warning" }];
    const listings: ShopListing[] = [
      { shopId: "shop-a", filamentId: "f1", pricePerSpool: 20 },
      { shopId: "shop-b", filamentId: "f1", pricePerSpool: 18 },
    ];
    const result = optimizeOrders(needs, listings, [SHOP_A, SHOP_B]);
    expect(result.shops).toHaveLength(1);
    expect(result.shops[0].shopId).toBe("shop-b");
    expect(result.shops[0].items[0].pricePerSpool).toBe(18);
  });

  it("flags unsourced needs when no listing exists", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 1, urgency: "warning" }];
    const result = optimizeOrders(needs, [], [SHOP_A]);
    expect(result.shops).toHaveLength(0);
    expect(result.unsourced).toHaveLength(1);
    expect(result.unsourced[0].filamentId).toBe("f1");
  });

  it("applies flat shipping when subtotal below threshold", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 1, urgency: "warning" }];
    const listings: ShopListing[] = [{ shopId: "shop-a", filamentId: "f1", pricePerSpool: 20 }];
    const result = optimizeOrders(needs, listings, [SHOP_A]);
    const order = result.shops[0];
    expect(order.subtotal).toBe(20);
    expect(order.shipping).toBe(4.99);
    expect(order.total).toBe(24.99);
    expect(order.freeShippingGap).toBe(30);
  });

  it("drops shipping once free-shipping threshold is hit", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 3, urgency: "warning" }];
    const listings: ShopListing[] = [{ shopId: "shop-a", filamentId: "f1", pricePerSpool: 20 }];
    const result = optimizeOrders(needs, listings, [SHOP_A]);
    const order = result.shops[0];
    // 3x20 = 60 subtotal, 5% bulk = 3 discount → 57 after discount, ≥ 50 threshold → free shipping
    expect(order.subtotal).toBe(60);
    expect(order.discountPercent).toBe(5);
    expect(order.discountAmount).toBe(3);
    expect(order.shipping).toBe(0);
    expect(order.total).toBe(57);
    expect(order.freeShippingGap).toBeNull();
  });

  it("applies the best bulk-discount tier at each qty", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 5, urgency: "warning" }];
    const listings: ShopListing[] = [{ shopId: "shop-a", filamentId: "f1", pricePerSpool: 10 }];
    const result = optimizeOrders(needs, listings, [SHOP_A]);
    const order = result.shops[0];
    // 5 units → 10% tier
    expect(order.discountPercent).toBe(10);
    expect(order.discountAmount).toBe(5);
  });

  it("hints at the next bulk tier", () => {
    const needs: ReorderNeed[] = [{ ...FIL_1, quantity: 2, urgency: "warning" }];
    const listings: ShopListing[] = [{ shopId: "shop-a", filamentId: "f1", pricePerSpool: 10 }];
    const result = optimizeOrders(needs, listings, [SHOP_A]);
    // qty=2, next tier is minQty=3 (5%) — needs 1 more
    expect(result.shops[0].nextBulkTier).toEqual({ addQty: 1, discountPercent: 5 });
  });

  it("groups needs from different filaments into the same shop when it's cheapest", () => {
    const needs: ReorderNeed[] = [
      { ...FIL_1, quantity: 1, urgency: "warning" },
      { ...FIL_2, quantity: 1, urgency: "warning" },
    ];
    const listings: ShopListing[] = [
      { shopId: "shop-a", filamentId: "f1", pricePerSpool: 18 },
      { shopId: "shop-a", filamentId: "f2", pricePerSpool: 20 },
    ];
    const result = optimizeOrders(needs, listings, [SHOP_A]);
    expect(result.shops).toHaveLength(1);
    expect(result.shops[0].items).toHaveLength(2);
  });

  it("defers non-critical items that blow the budget but keeps critical ones", () => {
    const needs: ReorderNeed[] = [
      { ...FIL_1, quantity: 2, urgency: "critical" }, // €40 → must go through
      { ...FIL_2, quantity: 1, urgency: "warning" }, // would add €20 → over budget
    ];
    const listings: ShopListing[] = [
      { shopId: "shop-a", filamentId: "f1", pricePerSpool: 20 },
      { shopId: "shop-a", filamentId: "f2", pricePerSpool: 20 },
    ];
    const result = optimizeOrders(needs, listings, [SHOP_A], { remainingBudget: 50 });
    expect(result.shops[0].items.map((i) => i.filamentId)).toEqual(["f1"]);
    expect(result.deferredForBudget.map((l) => l.filamentId)).toEqual(["f2"]);
  });

  it("ranks critical urgency first when budget is tight", () => {
    const needs: ReorderNeed[] = [
      { ...FIL_1, quantity: 1, urgency: "ok" },
      { ...FIL_2, quantity: 1, urgency: "critical" },
    ];
    const listings: ShopListing[] = [
      { shopId: "shop-a", filamentId: "f1", pricePerSpool: 20 },
      { shopId: "shop-a", filamentId: "f2", pricePerSpool: 20 },
    ];
    const result = optimizeOrders(needs, listings, [SHOP_A], { remainingBudget: 25 });
    const fids = result.shops.flatMap((s) => s.items.map((i) => i.filamentId));
    expect(fids).toContain("f2"); // critical retained
    expect(fids).not.toContain("f1"); // ok deferred
  });
});
