// Composition-frame ranges (30 fps). Beat starts in the COMPOSITION timeline
// (transitions overlap by 15 frames each). Computed:
//
//   Hook       0..150
//   Features   135..495
//   Dashboard  480..750
//   Inventory  735..975
//   Inspector  960..1200
//   Scan      1185..1485
//   Prints    1470..1740
//   Orders    1725..2085
//   Analytics 2070..2340
//   MobileCta 2325..2700

export type Caption = {
  text: string;
  startFrame: number;
  endFrame: number;
};

export const captions: Caption[] = [
  // Beat 2 — Features (let the on-screen list breathe; subtitle reinforces theme)
  { startFrame: 200, endFrame: 470,  text: "Fifteen features. One Home Assistant addon." },
  // Beat 3 — Dashboard
  { startFrame: 510, endFrame: 730,  text: "Daily cockpit — printer status, spend, prints, alerts." },
  // Beat 4 — Inventory
  { startFrame: 760, endFrame: 960,  text: "30+ spools across racks, AMS, workbench. Every gram tracked." },
  // Beat 5 — Inspector
  { startFrame: 990, endFrame: 1180, text: "Drill into any spool — weight, cost, history, location." },
  // Beat 6 — Scan
  { startFrame: 1215, endFrame: 1470, text: "Bambu RFID exact match. Third-party? CIE Delta-E fuzzy." },
  // Beat 7 — Prints
  { startFrame: 1500, endFrame: 1730, text: "Filament + energy = per-print cost, automatically." },
  // Beat 8 — Orders
  { startFrame: 1755, endFrame: 2080, text: "Paste an order email. Claude extracts every line item." },
  // Beat 9 — Analytics
  { startFrame: 2105, endFrame: 2330, text: "Per-gram price history. Per-month spend. All tracked." },
  // Beat 10 — Mobile + CTA
  { startFrame: 2360, endFrame: 2620, text: "Open-source Home Assistant addon. Install in two clicks." },
];
