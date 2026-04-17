/**
 * String normalization helpers for DB identifier columns
 * (shops.name, vendors.name, filaments.name).
 *
 * Use `normalizeName()` before every write so whitespace variations
 * ("  Bambu  Lab " vs "Bambu Lab") collapse to the same stored value.
 */

/** Trim and collapse internal whitespace (including non-breaking space). */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
