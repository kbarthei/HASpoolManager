/**
 * Material → pill colour mapping for rack spool cards.
 *
 * Each polymer family gets an rgba background + solid hex foreground so the
 * pill tints correctly in both light and dark mode. Returns a style object
 * (not a classname) because the list of materials grows over time and we
 * don't want to sync Tailwind safelists. Fallback: neutral grey for unknowns.
 */

export interface MaterialPillColors {
  bg: string; // rgba(...) — sits on any surface
  fg: string; // hex — readable in both modes
}

const MATERIAL_COLORS: Record<string, MaterialPillColors> = {
  PLA: { bg: "rgba(220,110,60,0.25)", fg: "#b85a28" },
  "PLA Matte": { bg: "rgba(200,120,80,0.25)", fg: "#c07a52" },
  "PLA Glow": { bg: "rgba(80,180,100,0.22)", fg: "#3b8a50" },
  PETG: { bg: "rgba(60,170,120,0.20)", fg: "#2e8a5c" },
  ABS: { bg: "rgba(220,60,60,0.22)", fg: "#b83030" },
  "ABS-GF": { bg: "rgba(255,140,80,0.25)", fg: "#c06020" },
  TPU: { bg: "rgba(60,170,210,0.22)", fg: "#2876a0" },
  "TPU-90A": { bg: "rgba(60,170,210,0.22)", fg: "#2876a0" },
  ASA: { bg: "rgba(170,120,220,0.22)", fg: "#7a4fb4" },
};

const FALLBACK: MaterialPillColors = {
  bg: "rgba(150,150,150,0.22)",
  fg: "#6a6a6a",
};

/** Inline style for a material pill. Use with `style={pillStyleForMaterial(m)}`. */
export function pillStyleForMaterial(material: string): {
  backgroundColor: string;
  color: string;
} {
  const c = MATERIAL_COLORS[material] ?? FALLBACK;
  return { backgroundColor: c.bg, color: c.fg };
}
