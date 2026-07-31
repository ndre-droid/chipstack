import type { Lab, DenomRef, ChipCalibration } from './types.ts';

// --- sRGB → CIE Lab (D65) ---
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // linear RGB → XYZ (D65)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const h = hex.replace('#', '');
  return rgbToLab(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

/** CIE76 ΔE (Euclidean in Lab) — adequate for this palette. */
export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Gold art-deco line: bright + yellow (high L*, positive b*, near-zero a*). */
export function isGoldDeco(lab: Lab): boolean {
  return lab[0] > 62 && lab[2] > 22 && lab[1] > -8 && lab[1] < 22;
}

/** Median Lab of body pixels, discarding gold-deco pixels. */
export function dominantLab(pixels: Lab[]): Lab | null {
  const body = pixels.filter((p) => !isGoldDeco(p));
  const src = body.length >= 3 ? body : pixels;
  if (src.length === 0) return null;
  const med = (i: number) => {
    const s = src.map((p) => p[i]).sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  return [med(0), med(1), med(2)];
}

/**
 * Nearest denomination by ΔE. `margin` = (2nd-best distance − best distance);
 * a larger margin means a more confident match. Returns value=null when the best
 * distance exceeds `reject`.
 */
export function nearestDenom(
  lab: Lab,
  denoms: DenomRef[],
  reject: number,
): { value: number | null; distance: number; margin: number } {
  if (denoms.length === 0) return { value: null, distance: Infinity, margin: 0 };
  const sorted = denoms
    .map((d) => ({ value: d.value, distance: labDistance(lab, d.lab) }))
    .sort((a, b) => a.distance - b.distance);
  const best = sorted[0];
  const second = sorted[1]?.distance ?? Infinity;
  if (best.distance > reject) return { value: null, distance: best.distance, margin: 0 };
  return { value: best.value, distance: best.distance, margin: second - best.distance };
}

/** Store denominations → Lab references, using calibrated colours when available. */
export function buildDenomRefs(
  denoms: { value: number; color: string; enabled: boolean }[],
  cal?: ChipCalibration,
): DenomRef[] {
  return denoms
    .filter((d) => d.enabled)
    .map((d) => ({ value: d.value, lab: cal?.colors[d.value] ?? hexToLab(d.color) }));
}
