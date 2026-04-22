/**
 * Helpers for parsing and formatting the spools.location rack format.
 *
 * Canonical format (post-migration):  "rack:<rackId>:R-C"
 * Legacy format (pre-migration):       "rack:R-C"
 *
 * Only migrate-data.ts touches the legacy parser; app code uses parseRackLocation.
 */

export interface RackPosition {
  rackId: string;
  row: number;
  col: number;
}

/** Parse the canonical rack-location format. Returns null for non-rack strings. */
export function parseRackLocation(location: string | null | undefined): RackPosition | null {
  if (!location) return null;
  const match = location.match(/^rack:([^:]+):(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    rackId: match[1],
    row: parseInt(match[2], 10),
    col: parseInt(match[3], 10),
  };
}

/** Build a canonical rack-location string. */
export function formatRackLocation(rackId: string, row: number, col: number): string {
  return `rack:${rackId}:${row}-${col}`;
}

/** Legacy parser for the pre-migration "rack:R-C" format — migration code only. */
export function parseLegacyRackLocation(location: string): { row: number; col: number } | null {
  const match = location.match(/^rack:(\d+)-(\d+)$/);
  if (!match) return null;
  return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
}
