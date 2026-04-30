/**
 * Format a duration given in MINUTES.
 *
 * - `<= 0` or null/undefined → "—"
 * - `< 60`                   → "Xmin"   (e.g. "45min", "1min")
 * - `>= 60`                  → "Xh YYmin"  (e.g. "21h 08min", "2h 00min")
 */
export function formatRemainingMinutes(
  minutes: number | null | undefined,
): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}
