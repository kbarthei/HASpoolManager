/**
 * Format cost tooltip showing filament + energy breakdown.
 * Returns undefined only if there's nothing meaningful to show
 * (no cost at all, or only one type with no other to compare).
 */
export function costTooltip(print: {
  filamentCost?: number | null;
  energyCost?: number | null;
  energyKwh?: number | null;
  totalCost?: number | null;
}): string | undefined {
  const filament = Number(print.filamentCost ?? 0);
  const energy = Number(print.energyCost ?? 0);
  const kwh = Number(print.energyKwh ?? 0);
  const total = Number(print.totalCost ?? 0);

  if (total <= 0) return undefined;

  // Show tooltip whenever energy data exists (even if filament is 0)
  if (energy <= 0) return undefined;

  const parts: string[] = [];
  parts.push(`Filament: €${filament.toFixed(2)}`);
  parts.push(`Electricity: €${energy.toFixed(2)} (${kwh.toFixed(3)} kWh)`);
  parts.push(`Total: €${total.toFixed(2)}`);
  return parts.join(" · ");
}
