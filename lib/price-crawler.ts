/**
 * Price crawler — fetches product pages and extracts current prices.
 * Uses shop-specific parsers for known shops, generic JSON-LD fallback for unknown.
 */

interface PriceResult {
  price: number | null;
  currency: string;
  inStock: boolean | null;
  source: "parser" | "ai" | "failed";
}

/** Fetch a product page and extract the price */
export async function fetchProductPrice(url: string): Promise<PriceResult> {
  try {
    // Use German locale headers to get EUR prices
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
        "Cookie": "localization=DE; cart_currency=EUR",
      },
    });
    if (!res.ok) return { price: null, currency: "EUR", inStock: null, source: "failed" };

    const html = await res.text();
    const domain = new URL(url).hostname.toLowerCase();

    // Try shop-specific parser first
    if (domain.includes("bambulab.com")) return parseBambuLab(html);
    if (domain.includes("3djake")) return parse3DJake(html);

    // Fallback: try generic price extraction
    return parseGeneric(html);
  } catch {
    return { price: null, currency: "EUR", inStock: null, source: "failed" };
  }
}

/** Bambu Lab Store parser */
function parseBambuLab(html: string): PriceResult {
  // EU store: extract EUR price from HTML body (JSON-LD has USD only)
  const eurMatch = html.match(/From\s*€([\d.,]+)/i) || html.match(/€([\d.,]+)\s*EUR/i);
  if (eurMatch) {
    const price = parseFloat(eurMatch[1].replace(",", "."));
    if (!isNaN(price)) {
      return { price, currency: "EUR", inStock: true, source: "parser" };
    }
  }

  // Try JSON-LD — Bambu uses ProductGroup with hasVariant
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<\/?script[^>]*>/gi, "");
        const data = JSON.parse(jsonStr);

        // Handle Product type
        if (data["@type"] === "Product" && data.offers) {
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          return {
            price: parseFloat(offer.price),
            currency: offer.priceCurrency || "EUR",
            inStock: offer.availability?.includes("InStock") ?? null,
            source: "parser",
          };
        }

        // Handle ProductGroup type (Bambu Lab uses this)
        if (data["@type"] === "ProductGroup" && data.hasVariant) {
          const variants = Array.isArray(data.hasVariant) ? data.hasVariant : [data.hasVariant];
          // Find lowest price among variants
          let lowestPrice = Infinity;
          let currency = "EUR";
          let inStock = false;
          for (const variant of variants) {
            const offers = variant.offers ? (Array.isArray(variant.offers) ? variant.offers : [variant.offers]) : [];
            for (const offer of offers) {
              const price = parseFloat(offer.price);
              if (!isNaN(price) && price < lowestPrice) {
                lowestPrice = price;
                currency = offer.priceCurrency || "EUR";
              }
              if (offer.availability?.includes("InStock")) inStock = true;
            }
          }
          if (lowestPrice < Infinity) {
            return { price: lowestPrice, currency, inStock, source: "parser" };
          }
        }
      } catch {}
    }
  }

  // Fallback: meta tags
  const priceMatch = html.match(/meta\s+property="product:price:amount"\s+content="([\d.]+)"/i)
    || html.match(/meta\s+content="([\d.]+)"\s+property="product:price:amount"/i);
  if (priceMatch) {
    const currMatch = html.match(/meta\s+property="product:price:currency"\s+content="(\w+)"/i)
      || html.match(/meta\s+content="(\w+)"\s+property="product:price:currency"/i);
    return {
      price: parseFloat(priceMatch[1]),
      currency: currMatch?.[1] || "EUR",
      inStock: null,
      source: "parser",
    };
  }

  return parseGeneric(html);
}

/** 3DJake parser */
function parse3DJake(html: string): PriceResult {
  // 3DJake uses JSON-LD and standard price meta tags
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<\/?script[^>]*>/gi, "");
        const data = JSON.parse(jsonStr);
        const product = data["@type"] === "Product" ? data :
          (Array.isArray(data["@graph"]) ? data["@graph"].find((n: { "@type": string }) => n["@type"] === "Product") : null);
        if (product?.offers) {
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
          return {
            price: parseFloat(offer.price || offer.lowPrice),
            currency: offer.priceCurrency || "EUR",
            inStock: offer.availability?.includes("InStock") ?? null,
            source: "parser",
          };
        }
      } catch {}
    }
  }

  return parseGeneric(html);
}

/** Generic price extraction — looks for common price patterns in HTML */
function parseGeneric(html: string): PriceResult {
  // Try JSON-LD (works for many e-commerce sites)
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<\/?script[^>]*>/gi, "");
        const data = JSON.parse(jsonStr);
        const findProduct = (obj: unknown): { offers?: unknown; "@type"?: string } | null => {
          if (!obj || typeof obj !== "object") return null;
          const o = obj as Record<string, unknown>;
          if (o["@type"] === "Product") return o as { offers?: unknown };
          if (Array.isArray(o["@graph"])) {
            const found = (o["@graph"] as unknown[]).find(
              (n) => typeof n === "object" && n !== null && (n as Record<string, unknown>)["@type"] === "Product"
            );
            return found as { offers?: unknown } | null;
          }
          if (Array.isArray(obj)) {
            const found = (obj as unknown[]).find(
              (n) => typeof n === "object" && n !== null && (n as Record<string, unknown>)["@type"] === "Product"
            );
            return found as { offers?: unknown } | null;
          }
          return null;
        };
        const product = findProduct(data);
        if (product?.offers) {
          const offers = product.offers as Record<string, unknown>;
          const offer = Array.isArray(offers) ? (offers as Record<string, unknown>[])[0] : offers;
          const price = parseFloat(String(offer.price ?? offer.lowPrice ?? ""));
          if (!isNaN(price)) {
            return {
              price,
              currency: String(offer.priceCurrency ?? "EUR"),
              inStock: typeof offer.availability === "string"
                ? offer.availability.includes("InStock")
                : null,
              source: "parser",
            };
          }
        }
      } catch {}
    }
  }

  // Try og:price or product:price meta tags
  const priceMatch = html.match(/(?:og|product):price:amount["\s]+content="([\d.,]+)"/i)
    || html.match(/content="([\d.,]+)"[^>]+(?:og|product):price:amount/i);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1].replace(",", "."));
    if (!isNaN(price)) {
      return { price, currency: "EUR", inStock: null, source: "parser" };
    }
  }

  return { price: null, currency: "EUR", inStock: null, source: "failed" };
}

export type { PriceResult };
