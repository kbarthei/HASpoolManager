/** Parse a rack location string (e.g. "rack:2-3") into row/col coordinates. */
export function parseRackPosition(location: string): { row: number; col: number } | null {
  const match = location.match(/^rack:(\d+)-(\d+)$/);
  if (!match) return null;
  return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
}
