/**
 * Canonical vendor name resolution.
 *
 * Normalizes vendor-name variations coming from order imports, spool scans,
 * and CSV uploads so we end up with one entry per real vendor in the DB.
 *
 * Use `resolveVendorName(raw)` at every entry point before a DB insert.
 */

// Map of lowercase/compact alias → canonical display name.
const VENDOR_ALIASES: Record<string, string> = {
  // Bambu Lab
  "bambulab": "Bambu Lab",
  "bambu": "Bambu Lab",
  "bambulabs": "Bambu Lab",
  // Polymaker
  "polymaker": "Polymaker",
  "polyterra": "Polymaker",
  "polylite": "Polymaker",
  "polymax": "Polymaker",
  "polymide": "Polymaker",
  "panchroma": "Polymaker",
  // eSun
  "esun": "eSun",
  "esunfilament": "eSun",
  // Prusament
  "prusament": "Prusament",
  "prusa": "Prusament",
  "prusaresearch": "Prusament",
  // Sunlu
  "sunlu": "Sunlu",
  // Elegoo
  "elegoo": "Elegoo",
  // Overture
  "overture": "Overture",
  // Hatchbox
  "hatchbox": "Hatchbox",
  // 3dJake
  "3djake": "3DJake",
  "jake": "3DJake",
  // Anycubic
  "anycubic": "Anycubic",
  // Creality
  "creality": "Creality",
  "cralityfilament": "Creality",
  // Geeetech
  "geeetech": "Geeetech",
  // Fiberlogy
  "fiberlogy": "Fiberlogy",
  // Das Filament
  "dasfilament": "Das Filament",
  "extrudrfilament": "Extrudr",
  "extrudr": "Extrudr",
};

/** Strip non-letters/digits, lowercase, for alias lookup. */
function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve a raw vendor string to its canonical display name.
 * Returns the trimmed raw name if no alias matches.
 */
export function resolveVendorName(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const key = normalizeKey(trimmed);
  if (key in VENDOR_ALIASES) return VENDOR_ALIASES[key];
  return trimmed;
}

/** Exposed for tests. */
export const __vendorAliasesForTest = VENDOR_ALIASES;
