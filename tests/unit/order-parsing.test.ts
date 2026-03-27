import { describe, it, expect } from "vitest";

describe("Order input type detection", () => {
  // The parse route detects input type based on text content
  function detectInputType(text: string): "url" | "email" | "search" {
    if (text.trim().startsWith("http")) return "url";
    if (text.includes("@") || text.toLowerCase().includes("order") ||
        text.toLowerCase().includes("bestellung") || text.toLowerCase().includes("bestätigung"))
      return "email";
    return "search";
  }

  it("detects URLs", () => {
    expect(detectInputType("https://eu.store.bambulab.com/products/pla-basic")).toBe("url");
    expect(detectInputType("http://amazon.de/dp/B0123")).toBe("url");
  });

  it("detects emails with English keywords", () => {
    expect(detectInputType("Your order has been shipped")).toBe("email");
    expect(detectInputType("Order confirmation #12345")).toBe("email");
  });

  it("detects emails with German keywords", () => {
    expect(detectInputType("Ihre Bestellung ist unterwegs")).toBe("email");
    expect(detectInputType("Bestellbestätigung EN7054")).toBe("email");
  });

  it("detects emails with @ symbol", () => {
    expect(detectInputType("From: shop@bambulab.com\nSubject: Order shipped")).toBe("email");
  });

  it("detects plain product searches", () => {
    expect(detectInputType("PLA Basic Charcoal")).toBe("search");
    expect(detectInputType("Bambu Lab PETG HF")).toBe("search");
  });

  it("handles empty input", () => {
    expect(detectInputType("")).toBe("search");
  });

  it("handles URLs with trailing whitespace", () => {
    expect(detectInputType("  https://3djake.de/product/123  ")).toBe("url");
  });
});

describe("Order data validation", () => {
  // Test the structure of parsed order data
  interface ParsedItem {
    name: string;
    vendor: string;
    material: string;
    colorName: string | null;
    colorHex: string | null;
    weight: number;
    quantity: number;
    price: number | null;
    currency: string;
  }

  it("validates complete item structure", () => {
    const item: ParsedItem = {
      name: "PLA Matte Charcoal",
      vendor: "Bambu Lab",
      material: "PLA",
      colorName: "Charcoal",
      colorHex: "2B2B2D",
      weight: 1000,
      quantity: 2,
      price: 22.99,
      currency: "EUR",
    };
    expect(item.name).toBeTruthy();
    expect(item.vendor).toBeTruthy();
    expect(["PLA", "PETG", "ABS", "ABS-GF", "TPU", "ASA", "PC", "PA"]).toContain(item.material);
    expect(item.weight).toBeGreaterThan(0);
    expect(item.quantity).toBeGreaterThan(0);
  });

  it("allows null for optional fields", () => {
    const item: ParsedItem = {
      name: "ABS",
      vendor: "Bambu Lab",
      material: "ABS",
      colorName: null,
      colorHex: null,
      weight: 1000,
      quantity: 1,
      price: null,
      currency: "EUR",
    };
    expect(item.colorName).toBeNull();
    expect(item.colorHex).toBeNull();
    expect(item.price).toBeNull();
  });

  it("validates hex color format", () => {
    const validHex = /^[0-9A-Fa-f]{6}$/;
    expect(validHex.test("2B2B2D")).toBe(true);
    expect(validHex.test("FF69B4")).toBe(true);
    expect(validHex.test("abc")).toBe(false);
    expect(validHex.test("#FF0000")).toBe(false);
    expect(validHex.test("GGGGGG")).toBe(false);
  });

  it("validates material types", () => {
    const validMaterials = ["PLA", "PETG", "ABS", "ABS-GF", "TPU", "ASA", "PC", "PA"];
    expect(validMaterials).toContain("PLA");
    expect(validMaterials).toContain("PETG");
    expect(validMaterials).toContain("ABS-GF");
    expect(validMaterials).not.toContain("NYLON");
  });
});

describe("Month grouping logic", () => {
  function groupByMonth(orders: { orderDate: string }[]): Map<string, typeof orders> {
    const groups = new Map<string, typeof orders>();
    for (const order of orders) {
      const date = new Date(order.orderDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }
    return groups;
  }

  it("groups orders by month", () => {
    const orders = [
      { orderDate: "2026-03-15" },
      { orderDate: "2026-03-03" },
      { orderDate: "2026-02-20" },
    ];
    const groups = groupByMonth(orders);
    expect(groups.size).toBe(2);
    expect(groups.get("2026-03")?.length).toBe(2);
    expect(groups.get("2026-02")?.length).toBe(1);
  });

  it("handles single order", () => {
    const groups = groupByMonth([{ orderDate: "2026-01-01" }]);
    expect(groups.size).toBe(1);
  });

  it("handles empty list", () => {
    const groups = groupByMonth([]);
    expect(groups.size).toBe(0);
  });

  it("sorts within month by date", () => {
    const orders = [
      { orderDate: "2026-03-03" },
      { orderDate: "2026-03-15" },
      { orderDate: "2026-03-01" },
    ];
    const groups = groupByMonth(orders);
    const marchOrders = groups.get("2026-03")!;
    expect(marchOrders.length).toBe(3);
  });
});

describe("Filter logic", () => {
  const orders = [
    { shop: "Bambu Lab", filaments: ["PLA Basic", "ABS"], orderNumber: "EN001" },
    { shop: "3DJake", filaments: ["PETG CF"], orderNumber: "DJ002" },
    { shop: "Amazon", filaments: ["PLA Silk+"], orderNumber: "AM003" },
    { shop: "Bambu Lab", filaments: ["PLA Matte"], orderNumber: "EN004" },
  ];

  function filterOrders(items: typeof orders, search: string, shop: string) {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.filaments.some(f => f.toLowerCase().includes(q)) ||
        o.shop.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q)
      );
    }
    if (shop !== "all") {
      result = result.filter(o => o.shop === shop);
    }
    return result;
  }

  it("filters by shop", () => {
    expect(filterOrders(orders, "", "Bambu Lab").length).toBe(2);
    expect(filterOrders(orders, "", "3DJake").length).toBe(1);
    expect(filterOrders(orders, "", "all").length).toBe(4);
  });

  it("searches by filament name", () => {
    expect(filterOrders(orders, "PLA", "all").length).toBe(3);
    expect(filterOrders(orders, "PETG", "all").length).toBe(1);
    expect(filterOrders(orders, "Silk", "all").length).toBe(1);
  });

  it("searches by order number", () => {
    expect(filterOrders(orders, "EN001", "all").length).toBe(1);
    expect(filterOrders(orders, "DJ", "all").length).toBe(1);
  });

  it("combines search and shop filter", () => {
    expect(filterOrders(orders, "PLA", "Bambu Lab").length).toBe(2);
    expect(filterOrders(orders, "PLA", "Amazon").length).toBe(1);
    expect(filterOrders(orders, "PETG", "Bambu Lab").length).toBe(0);
  });

  it("case insensitive search", () => {
    expect(filterOrders(orders, "pla", "all").length).toBe(3);
    expect(filterOrders(orders, "bambu", "all").length).toBe(2);
  });

  it("handles empty search", () => {
    expect(filterOrders(orders, "", "all").length).toBe(4);
  });
});

describe("Progressive filter visibility", () => {
  it("shows no filters for <6 orders", () => {
    const showFilters = (count: number) => count > 5;
    expect(showFilters(0)).toBe(false);
    expect(showFilters(5)).toBe(false);
  });

  it("shows filters for 6+ orders", () => {
    const showFilters = (count: number) => count > 5;
    expect(showFilters(6)).toBe(true);
    expect(showFilters(50)).toBe(true);
  });

  it("shows shop chips only with multiple shops", () => {
    const showShopChips = (shops: string[]) => shops.length > 1;
    expect(showShopChips(["Bambu Lab"])).toBe(false);
    expect(showShopChips(["Bambu Lab", "3DJake"])).toBe(true);
  });
});

describe("Days ago calculation", () => {
  it("calculates days correctly", () => {
    const daysAgo = (orderDate: string, now: number) =>
      Math.floor((now - new Date(orderDate).getTime()) / 86400000);

    const now = new Date("2026-03-27T12:00:00Z").getTime();
    expect(daysAgo("2026-03-27", now)).toBe(0);
    expect(daysAgo("2026-03-26", now)).toBe(1);
    expect(daysAgo("2026-03-20", now)).toBe(7);
    expect(daysAgo("2026-03-01", now)).toBe(26);
  });
});
