import { VENDOR_COLORS } from "./vendor-colors";

// Pure material names without a color component — skip fuzzy matching for these
const BARE_MATERIAL_NAMES = new Set([
  "pla", "petg", "abs", "asa", "tpu", "pa", "pc", "pva", "hips", "pp",
  "pla+", "petg+", "abs+", "pla-cf", "petg-cf", "abs-gf", "pa-cf", "pc-cf",
]);

/**
 * Look up the exact hex color for a vendor + filament name.
 * Falls back to fuzzy matching (strips material prefix, tries partial match).
 * Returns the hex color (uppercase, no #) or null if not found.
 *
 * Skips matching for bare material names ("ABS", "PLA") since those
 * don't contain color info — would match the wrong SpoolmanDB entry.
 *
 * Source: SpoolmanDB (donkie.github.io/SpoolmanDB)
 */
export function lookupVendorColor(vendor: string, filamentName: string): string | null {
  // Skip bare material names — they don't contain color info
  if (BARE_MATERIAL_NAMES.has(filamentName.toLowerCase().trim())) return null;

  // Exact match: "Bambu Lab|PLA Matte Charcoal"
  const exact = VENDOR_COLORS[`${vendor}|${filamentName}`];
  if (exact) return exact;

  // Try without material prefix: "Matte Charcoal" from "PLA Matte Charcoal"
  const withoutMaterial = filamentName.replace(/^(PLA|PETG|ABS|ASA|TPU|PA|PC|PVA)\s+/i, "");
  if (withoutMaterial !== filamentName) {
    // Don't match if stripping leaves just a bare material name
    if (!BARE_MATERIAL_NAMES.has(withoutMaterial.toLowerCase().trim())) {
      const stripped = VENDOR_COLORS[`${vendor}|${withoutMaterial}`];
      if (stripped) return stripped;
    }
  }

  // Fuzzy: case-insensitive search across all entries for this vendor
  const prefix = `${vendor}|`;
  const nameLower = filamentName.toLowerCase();
  for (const [key, hex] of Object.entries(VENDOR_COLORS)) {
    if (!key.startsWith(prefix)) continue;
    const entryName = key.slice(prefix.length).toLowerCase();
    if (entryName === nameLower) return hex;
    // Partial: "Charcoal" matches "Matte Charcoal" — but only if search term is specific enough
    if (nameLower.length >= 4 && (entryName.includes(nameLower) || nameLower.includes(entryName))) return hex;
  }

  return null;
}
