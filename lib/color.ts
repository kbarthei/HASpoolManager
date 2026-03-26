/**
 * CIE Delta-E color distance calculation.
 * Converts hex colors to LAB color space and computes CIE76 Delta-E.
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface LAB {
  l: number;
  a: number;
  b: number;
}

/** Parse 6-char hex (no #) to RGB 0-255 */
export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "").slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Convert sRGB to linear RGB */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Convert RGB to CIE XYZ (D65 illuminant) */
function rgbToXyz(rgb: RGB): { x: number; y: number; z: number } {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);

  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    z: r * 0.0193339 + g * 0.119192 + b * 0.9503041,
  };
}

/** Convert XYZ to CIELAB (D65 reference white) */
function xyzToLab(xyz: { x: number; y: number; z: number }): LAB {
  // D65 reference white
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(xyz.x / xn);
  const fy = f(xyz.y / yn);
  const fz = f(xyz.z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** Convert hex color to CIELAB */
export function hexToLab(hex: string): LAB {
  return xyzToLab(rgbToXyz(hexToRgb(hex)));
}

/** CIE76 Delta-E between two LAB colors */
export function deltaE(lab1: LAB, lab2: LAB): number {
  return Math.sqrt(
    Math.pow(lab1.l - lab2.l, 2) +
      Math.pow(lab1.a - lab2.a, 2) +
      Math.pow(lab1.b - lab2.b, 2)
  );
}

/** CIE76 Delta-E between two hex colors */
export function deltaEHex(hex1: string, hex2: string): number {
  return deltaE(hexToLab(hex1), hexToLab(hex2));
}
