/**
 * Theme utility functions for HASpoolManager
 * Apple Health-inspired design system
 */

/**
 * Returns a Tailwind text color class based on stock level percentage.
 */
export function getStockLevelColor(percent: number): string {
  if (percent === 0) return "text-gray-400 line-through";
  if (percent < 10) return "text-red-500";
  if (percent < 30) return "text-amber-500";
  return "text-emerald-500";
}

/**
 * Returns a Tailwind background color class for progress bars based on stock level.
 */
export function getStockLevelBg(percent: number): string {
  if (percent === 0) return "bg-gray-400";
  if (percent < 10) return "bg-red-500";
  if (percent < 30) return "bg-amber-500";
  return "bg-emerald-500";
}

/**
 * Returns Tailwind classes for material badge chips.
 */
export function getMaterialColor(material: string): string {
  const m = material.toUpperCase();
  if (m === "PLA") return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
  if (m === "PETG") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (m === "ABS") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  if (m === "ABS-GF") return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  if (m === "TPU") return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
  // Default fallback
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

/**
 * Calculates relative luminance of a 6-character hex color string (without #).
 * Returns true if the color is too dark (<0.15) or too light (>0.9),
 * indicating that a visibility ring should be added on spool color dots.
 */
export function needsRing(hex: string): boolean {
  // Strip leading # if present
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return false;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // sRGB linearization
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance < 0.15 || luminance > 0.9;
}
