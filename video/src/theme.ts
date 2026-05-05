export const colors = {
  // Surfaces (Apple system dark)
  bg: "#000000",
  surface: "#1C1C1E",
  surface2: "#2C2C2E",
  surface3: "#3A3A3C",
  border: "#38383A",

  // Brand accent — Apple teal (dark variant)
  accent: "#40C8E0",
  accentSoft: "#40C8E033",
  accentRing: "#40C8E055",

  // Text
  text: "#F5F5F7",
  textMuted: "#8D8D93",
  ink2: "rgba(235, 235, 245, 0.85)",

  // Status
  success: "#30D158",
  warning: "#FF9F0A",
  danger: "#FF453A",

  // Charts — Apple system
  chart1: "#40C8E0",
  chart2: "#0A84FF",
  chart3: "#5E5CE6",
  chart4: "#30D158",
  chart5: "#FF9F0A",

  // Home Assistant
  haBlue: "#41BDF5",
} as const;

export const fonts = {
  sans: '"Geist", "Geist Fallback", system-ui, sans-serif',
  mono: '"Geist Mono", "Geist Mono Fallback", ui-monospace, monospace',
} as const;

export const radii = {
  sm: 8,        // 0.75rem * 0.6
  md: 10,       // 0.75rem * 0.8
  card: 12,     // 0.75rem (lg)
  cardLg: 17,   // 0.75rem * 1.4 (xl)
  card2xl: 22,  // 0.75rem * 1.8
  pill: 999,
} as const;
