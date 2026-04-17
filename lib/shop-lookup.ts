import { db } from "./db";
import { shops } from "./db/schema";

/**
 * Find an existing shop by name, using fuzzy matching.
 * Handles variations like "Bambu Lab" / "Bambu Lab Store" / "Bambu Lab Store EU".
 *
 * Matching strategy (first match wins):
 * 1. Exact match (case-insensitive)
 * 2. One name contains the other (e.g., "Bambu Lab" matches "Bambu Lab Store EU")
 * 3. URL domain match (e.g., "bambulab" in both URLs)
 */
export async function findOrCreateShop(
  name: string,
  url?: string | null
): Promise<string> {
  const allShops = await db.query.shops.findMany();
  const nameLower = name.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  const exact = allShops.find(
    (s) => s.name.toLowerCase().trim() === nameLower
  );
  if (exact) return exact.id;

  // 2. Containment match: input contains existing name or vice versa
  // Prefer the longer (more specific) shop name
  const containment = allShops
    .filter((s) => {
      const existing = s.name.toLowerCase().trim();
      return existing.includes(nameLower) || nameLower.includes(existing);
    })
    .sort((a, b) => b.name.length - a.name.length); // longest first
  if (containment.length > 0) return containment[0].id;

  // 3. URL domain match
  if (url) {
    const inputDomain = extractDomain(url);
    if (inputDomain) {
      const urlMatch = allShops.find((s) => {
        if (!s.website) return false;
        return extractDomain(s.website) === inputDomain;
      });
      if (urlMatch) return urlMatch.id;
    }
  }

  // No match — create new shop
  const [newShop] = await db
    .insert(shops)
    .values({
      name,
      website: url ?? null,
    })
    .returning();
  return newShop.id;
}

function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    // Strip www. and get the base domain
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
