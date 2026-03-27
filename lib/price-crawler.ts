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
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
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
  // Bambu Lab uses structured data (JSON-LD) or meta tags
  // Try JSON-LD first
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data["@type"] === "Product" && data.offers) {
        const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
        return {
          price: parseFloat(offer.price),
          currency: offer.priceCurrency || "EUR",
          inStock: offer.availability?.includes("InStock") ?? null,
          source: "parser",
        };
      }
    } catch {}
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
