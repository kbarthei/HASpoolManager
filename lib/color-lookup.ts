import { VENDOR_COLORS } from "./vendor-colors";

/**
 * Look up the exact hex color for a vendor + filament name.
 * Falls back to fuzzy matching (strips material prefix, tries partial match).
 * Returns the hex color (uppercase, no #) or null if not found.
 *
 * Source: SpoolmanDB (donkie.github.io/SpoolmanDB)
 */
export function lookupVendorColor(vendor: string, filamentName: string): string | null {
  // Exact match: "Bambu Lab|PLA Matte Charcoal"
  const exact = VENDOR_COLORS[`${vendor}|${filamentName}`];
  if (exact) return exact;

  // Try without material prefix: "Matte Charcoal" from "PLA Matte Charcoal"
  const withoutMaterial = filamentName.replace(/^(PLA|PETG|ABS|ASA|TPU|PA|PC|PVA)\s+/i, "");
  if (withoutMaterial !== filamentName) {
    const stripped = VENDOR_COLORS[`${vendor}|${withoutMaterial}`];
    if (stripped) return stripped;
  }

  // Fuzzy: case-insensitive search across all entries for this vendor
  const prefix = `${vendor}|`;
  const nameLower = filamentName.toLowerCase();
  for (const [key, hex] of Object.entries(VENDOR_COLORS)) {
    if (!key.startsWith(prefix)) continue;
    const entryName = key.slice(prefix.length).toLowerCase();
    if (entryName === nameLower) return hex;
    // Partial: "Charcoal" matches "Matte Charcoal"
    if (entryName.includes(nameLower) || nameLower.includes(entryName)) return hex;
  }

  return null;
}
