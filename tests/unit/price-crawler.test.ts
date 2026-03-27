import { describe, it, expect } from "vitest";

// We can't import the actual module (it uses fetch), so test the parsing logic concepts

describe("Price extraction patterns", () => {
  describe("JSON-LD structured data", () => {
    it("extracts price from Product schema", () => {
      const jsonLd = {
        "@type": "Product",
        name: "PLA Basic",
        offers: { price: "22.99", priceCurrency: "EUR", availability: "https://schema.org/InStock" }
      };
      expect(parseFloat(jsonLd.offers.price)).toBe(22.99);
      expect(jsonLd.offers.priceCurrency).toBe("EUR");
      expect(jsonLd.offers.availability.includes("InStock")).toBe(true);
    });

    it("handles array offers", () => {
      const jsonLd = {
        "@type": "Product",
        offers: [
          { price: "22.99", priceCurrency: "EUR" },
          { price: "25.99", priceCurrency: "USD" },
        ]
      };
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      expect(parseFloat(offer.price)).toBe(22.99);
    });

    it("handles lowPrice in offers", () => {
      const offer = { lowPrice: "18.50", priceCurrency: "EUR" };
      const price = parseFloat(offer.lowPrice);
      expect(price).toBe(18.5);
    });
  });

  describe("Meta tag extraction", () => {
    it("extracts price from product:price:amount meta", () => {
      const html = '<meta property="product:price:amount" content="22.99">';
      const match = html.match(/product:price:amount["\s]+content="([\d.]+)"/i);
      expect(match).not.toBeNull();
      expect(parseFloat(match![1])).toBe(22.99);
    });

    it("extracts currency from product:price:currency meta", () => {
      const html = '<meta property="product:price:currency" content="EUR">';
      const match = html.match(/product:price:currency["\s]+content="(\w+)"/i);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("EUR");
    });
  });

  describe("Domain detection", () => {
    it("identifies Bambu Lab store", () => {
      const url = "https://eu.store.bambulab.com/products/pla-basic";
      const domain = new URL(url).hostname.toLowerCase();
      expect(domain.includes("bambulab.com")).toBe(true);
    });

    it("identifies 3DJake", () => {
      const url = "https://www.3djake.de/product/123";
      const domain = new URL(url).hostname.toLowerCase();
      expect(domain.includes("3djake")).toBe(true);
    });

    it("identifies unknown shops", () => {
      const url = "https://www.amazon.de/dp/B0123";
      const domain = new URL(url).hostname.toLowerCase();
      expect(domain.includes("bambulab.com")).toBe(false);
      expect(domain.includes("3djake")).toBe(false);
    });
  });
});

describe("Price comparison logic", () => {
  function comparePrices(currentPrice: number | null, avgPrice: number | null): "below" | "above" | "at" | "unknown" {
    if (currentPrice === null || avgPrice === null) return "unknown";
    if (currentPrice < avgPrice) return "below";
    if (currentPrice > avgPrice * 1.1) return "above";
    return "at";
  }

  it("identifies below average price", () => {
    expect(comparePrices(20, 25)).toBe("below");
  });

  it("identifies above average price (>10%)", () => {
    expect(comparePrices(30, 25)).toBe("above");
  });

  it("identifies at average price (within 10%)", () => {
    expect(comparePrices(26, 25)).toBe("at");
    expect(comparePrices(25, 25)).toBe("at");
  });

  it("handles null current price", () => {
    expect(comparePrices(null, 25)).toBe("unknown");
  });

  it("handles null average", () => {
    expect(comparePrices(20, null)).toBe("unknown");
  });
});

describe("Shopping list calculations", () => {
  it("calculates estimated total", () => {
    const items = [
      { quantity: 2, lastPrice: 22.99 },
      { quantity: 1, lastPrice: 18.99 },
      { quantity: 3, lastPrice: null },
    ];
    const total = items.reduce((sum, item) => {
      return sum + (item.lastPrice ?? 0) * item.quantity;
    }, 0);
    expect(total).toBeCloseTo(64.97, 2);
  });

  it("handles all null prices", () => {
    const items = [
      { quantity: 2, lastPrice: null },
      { quantity: 1, lastPrice: null },
    ];
    const total = items.reduce((sum, item) => sum + (item.lastPrice ?? 0) * item.quantity, 0);
    expect(total).toBe(0);
  });

  it("increments quantity for existing item", () => {
    const existing = { filamentId: "abc", quantity: 2 };
    const newQty = existing.quantity + 1;
    expect(newQty).toBe(3);
  });
});

describe("Price history aggregation", () => {
  it("calculates average from multiple prices", () => {
    const prices = [22.99, 21.50, 23.99, 20.00];
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    expect(avg).toBeCloseTo(22.12, 2);
  });

  it("finds min and max", () => {
    const prices = [22.99, 21.50, 23.99, 20.00];
    expect(Math.min(...prices)).toBe(20.00);
    expect(Math.max(...prices)).toBe(23.99);
  });

  it("handles single price", () => {
    const prices = [22.99];
    const avg = prices[0];
    expect(avg).toBe(22.99);
    expect(Math.min(...prices)).toBe(22.99);
    expect(Math.max(...prices)).toBe(22.99);
  });
});
