/**
 * Pure helpers for the Multi-AMS + Multi-Rack migration.
 * No DB access — only string/array transforms. Imported by both the
 * startup migration script (scripts/migrate-db.js via lib/migrate-data.ts)
 * and unit tests.
 */

export function rewriteRackLocation(
  location: string | null,
  defaultRackId: string,
): string | null {
  if (location === null) return null;
  if (!location.startsWith("rack:")) return location;
  // Already migrated: has two colons (rack:<id>:R-C)
  if (location.match(/^rack:[^:]+:[^:]+$/)) return location;
  // Old format: rack:R-C → rack:<id>:R-C
  const match = location.match(/^rack:(\d+)-(\d+)$/);
  if (!match) return location;
  return `rack:${defaultRackId}:${match[1]}-${match[2]}`;
}

export interface SlotCombo {
  amsIndex: number;
  slotType: string;
}

export interface DerivedAmsUnit {
  amsIndex: number;
  slotType: string;
  displayName: string;
}

export function deriveAmsUnitsFromSlots(slots: SlotCombo[]): DerivedAmsUnit[] {
  const seen = new Set<string>();
  const result: DerivedAmsUnit[] = [];
  for (const s of slots) {
    if (s.slotType === "external") continue;
    const key = `${s.amsIndex}|${s.slotType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      amsIndex: s.amsIndex,
      slotType: s.slotType,
      displayName: s.slotType === "ams_ht" ? "AMS HT" : `AMS ${s.amsIndex + 1}`,
    });
  }
  result.sort((a, b) => {
    if (a.slotType !== b.slotType) return a.slotType === "ams" ? -1 : 1;
    return a.amsIndex - b.amsIndex;
  });
  return result;
}
