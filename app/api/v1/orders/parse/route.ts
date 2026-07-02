import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { optionalAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, orderParseSchema } from "@/lib/validations";
import { validateURL } from "@/lib/url-validator";

/** Detect whether input text is a URL, an email/order confirmation, or a plain search query. */
export function detectInputType(text: string): "url" | "email" | "search" {
  if (text.trim().startsWith("http")) return "url";
  if (
    text.includes("@") ||
    text.toLowerCase().includes("order") ||
    text.toLowerCase().includes("bestellung") ||
    text.toLowerCase().includes("bestätigung")
  )
    return "email";
  return "search";
}

const SYSTEM_PROMPT = `You extract 3D printing filament order data from text (email confirmations, product pages, or product descriptions).

Return ONLY valid JSON with this exact structure:
{
  "shop": "store name or null",
  "orderNumber": "order ID or null",
  "orderDate": "YYYY-MM-DD or null",
  "items": [{
    "name": "filament product name (e.g., PLA Matte Charcoal)",
    "vendor": "manufacturer (e.g., Bambu Lab, Polymaker, Creality)",
    "material": "PLA or PETG or ABS or ABS-GF or TPU or ASA or PC or PA",
    "colorName": "color name (e.g., Charcoal, White, Gray)",
    "colorHex": "best guess 6-char hex without # (e.g., 2B2B2D) or null",
    "weight": 1000,
    "quantity": 1,
    "price": 19.99,
    "currency": "EUR",
    "url": "product URL or null"
  }]
}

Rules:
- ALWAYS return colorName in English, even if the input is in German or another language
  - "Kohlschwarz" → "Charcoal Black"
  - "Jade-Weiß" → "Jade White"
  - "Milchkaffee-Braun" → "Coffee Brown"
  - "Champagner" → "Champagne"
- Use the official English product name when known (e.g., Bambu Lab "Matte Charcoal", not "Matte Kohlschwarz")
- weight is net filament weight in grams (usually 1000 for a standard spool)
- price is per unit, not total
- For Bambu Lab filaments, the vendor is always "Bambu Lab"
- For Polymaker filaments (PolyTerra, PolyLite), vendor is "Polymaker"
- If multiple quantities of the same item, set quantity accordingly
- Return ONLY the JSON, no markdown, no explanation`;

export async function POST(request: NextRequest) {
  const auth = await optionalAuth(request);
  if (!auth.authenticated) return auth.response;

  try {
    const raw = await request.json();
    const validation = validateBody(orderParseSchema, raw);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { text } = validation.data;

    // Detect input type
    const inputType = detectInputType(text);

    let contentToParse = text;

    // If URL, fetch the page content. SSRF guard: the URL is user-supplied,
    // so it MUST pass the same allowlist + private-IP block that the price
    // crawler uses. Without this an attacker could point the addon at
    // internal services (HA at 10.10.20.2:8123, cloud metadata at
    // 169.254.169.254, etc.) and exfiltrate the response via the AI summary.
    if (inputType === "url") {
      const urlCheck = validateURL(text.trim());
      if (!urlCheck.valid) {
        // Don't fetch — fall back to treating the raw URL as text so the
        // AI can still attempt a best-effort parse of the URL string itself.
        contentToParse = `Product URL: ${text}`;
      } else {
        try {
          const res = await fetch(urlCheck.sanitizedUrl!, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; HASpoolManager/1.0)" },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            const html = await res.text();
            // Extract text content, strip HTML tags, limit to ~4000 chars
            const stripped = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 4000);
            contentToParse = `Product URL: ${text}\n\nPage content:\n${stripped}`;
          }
        } catch {
          // If fetch fails, just pass the URL as text
          contentToParse = `Product URL: ${text}`;
        }
      }
    }

    // Call AI to extract order data
    const { text: aiResponse } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: SYSTEM_PROMPT,
      prompt: contentToParse,
    });

    // Parse AI response
    let parsed: {
      shop: string | null;
      orderNumber: string | null;
      orderDate: string | null;
      items: Array<{
        name: string;
        vendor: string;
        material: string;
        colorName: string | null;
        colorHex: string | null;
        weight: number;
        quantity: number;
        price: number | null;
        currency: string;
        url: string | null;
      }>;
    };
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in AI response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw: aiResponse },
        { status: 422 },
      );
    }

    // Match items against existing filaments
    const matchedItems = [];
    const existingFilaments = await db.query.filaments.findMany({
      with: { vendor: true },
    });

    for (const item of parsed.items || []) {
      let matchedFilament: (typeof existingFilaments)[0] | undefined;
      let matchConfidence = "new";

      // Exact match: vendor + name
      matchedFilament = existingFilaments.find(
        (f) =>
          f.vendor.name.toLowerCase() === (item.vendor || "").toLowerCase() &&
          f.name.toLowerCase() === (item.name || "").toLowerCase(),
      );
      if (matchedFilament) {
        matchConfidence = "exact";
      } else {
        // Fuzzy: vendor + material + color
        matchedFilament = existingFilaments.find(
          (f) =>
            f.vendor.name.toLowerCase() === (item.vendor || "").toLowerCase() &&
            f.material.toLowerCase() === (item.material || "").toLowerCase() &&
            f.colorName != null &&
            f.colorName.toLowerCase() === (item.colorName || "").toLowerCase(),
        );
        if (matchedFilament) matchConfidence = "fuzzy";
      }

      matchedItems.push({
        ...item,
        matchedFilamentId: matchedFilament?.id ?? null,
        matchedFilamentName: matchedFilament
          ? `${matchedFilament.vendor.name} ${matchedFilament.name}`
          : null,
        matchConfidence,
      });
    }

    return NextResponse.json({
      type: inputType,
      parsed: {
        shop: parsed.shop ?? null,
        orderNumber: parsed.orderNumber ?? null,
        orderDate: parsed.orderDate ?? null,
        items: matchedItems,
      },
    });
  } catch (error) {
    console.error("POST /api/v1/orders/parse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
