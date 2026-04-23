/**
 * Helpers for parsing and formatting the spools.location rack format.
 *
 * Format: "rack:<rackId>:R-C"
 */

export interface RackPosition {
  rackId: string;
  row: number;
  col: number;
}

/** Parse a rack-location string. Returns null for non-rack strings. */
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

/** Build a rack-location string. */
export function formatRackLocation(rackId: string, row: number, col: number): string {
  return `rack:${rackId}:${row}-${col}`;
}
