// SLOWPLAY Nash ceramic: 39 mm diameter, ~3.3 mm thickness.
export const DEFAULT_RATIO = 3.3 / 39;

/** sinθ from the top-face ellipse: sqrt(1 − (b/a)²). Clamped to [0,1]. */
export function tiltSinTheta(minor: number, major: number): number {
  if (major <= 0) return 0;
  const r = Math.min(1, Math.max(0, minor / major));
  return Math.sqrt(Math.max(0, 1 - r * r));
}

/** Single-chip edge height in px: h = ratio · a · sinθ. */
export function singleChipHeightPx(major: number, minor: number, ratio: number): number {
  return ratio * major * tiltSinTheta(minor, major);
}

/** Unrounded chip count of a band. */
export function rawBandCount(bandHeightPx: number, hPx: number): number {
  return hPx > 0 ? bandHeightPx / hPx : 0;
}

/** Rounded chip count, never below 1 for a detected band. */
export function bandCount(bandHeightPx: number, hPx: number): number {
  return Math.max(1, Math.round(rawBandCount(bandHeightPx, hPx)));
}

/** Lean of a column: angle (deg) of the top→bottom centre line from vertical. */
export function leanAngleDeg(topCx: number, topCy: number, botCx: number, botCy: number): number {
  const dy = Math.abs(botCy - topCy);
  const dx = botCx - topCx;
  return dy === 0 ? 0 : Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
}
