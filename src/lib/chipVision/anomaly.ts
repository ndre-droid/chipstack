import type { Anomaly } from './types.ts';

const a = (code: string, severity: 'warn' | 'blocking', autoFixed: boolean, columnIndex?: number): Anomaly =>
  ({ code, severity, autoFixed, columnIndex });

// b/a thresholds (ellipse minor/major).
const BA_TOP_WARN = 0.8;    // too top-down: edges compressed
const BA_TOP_BLOCK = 0.9;
const BA_SIDE_MIN = 0.15;   // too side-on: tops invisible, no self-scale
const MAX_STACK = 30;       // chips per column before we warn
const LEAN_AXIS_DEG = 4;    // above this, measure along the principal axis
const LEAN_BLOCK_DEG = 15;  // above this, force a retake
const CONTRAST_MIN = 0.12;  // foreground mask coverage floor
const GLARE_MAX = 0.08;     // blown-out edge-pixel ratio ceiling

/** Ellipse aspect → view-angle anomaly. */
export function detectView(minor: number, major: number, columnIndex: number): Anomaly | null {
  if (major <= 0) return a('viewTooSideOn', 'blocking', false, columnIndex);
  const r = minor / major;
  if (r < BA_SIDE_MIN) return a('viewTooSideOn', 'blocking', false, columnIndex);
  if (r > BA_TOP_BLOCK) return a('viewTooTopDown', 'blocking', false, columnIndex);
  if (r > BA_TOP_WARN) return a('viewTooTopDown', 'warn', false, columnIndex);
  return null;
}

export function detectTooTall(estCount: number, columnIndex: number): Anomaly | null {
  return estCount > MAX_STACK ? a('tooTall', 'warn', false, columnIndex) : null;
}

/** Small lean is auto-handled by measuring along the column axis; large lean blocks. */
export function detectLean(leanDeg: number, columnIndex: number): { anomaly: Anomaly | null; useAxis: boolean } {
  if (leanDeg >= LEAN_BLOCK_DEG) return { anomaly: a('leaning', 'blocking', false, columnIndex), useAxis: true };
  if (leanDeg >= LEAN_AXIS_DEG) return { anomaly: null, useAxis: true };  // auto-fixed silently
  return { anomaly: null, useAxis: false };
}

export function detectCutOff(
  _x0: number, _x1: number, topY: number, bottomY: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  columnIndex: number,
): Anomaly | null {
  const pad = 3;
  // Only VERTICAL clipping (top/bottom) actually loses chips from the count — a
  // stack touching the left/right is harmless. Warn (not blocking) so it advises
  // without preventing a count the user can still review.
  const touches = topY <= box.y0 + pad || bottomY >= box.y1 - pad;
  return touches ? a('cutOff', 'warn', false, columnIndex) : null;
}

export function detectWeakContrast(maskCoverage: number): Anomaly | null {
  return maskCoverage < CONTRAST_MIN ? a('weakContrast', 'blocking', false) : null;
}

// Above this fraction, so much of the frame differs from the sampled background
// that the surface/lighting isn't separable from the chips — one frame-sized
// blob results (a dark, textured, or coloured-lit surface). Guide, don't guess.
const BUSY_MAX = 0.5;
export function detectBusyBackground(maskCoverage: number): Anomaly | null {
  return maskCoverage > BUSY_MAX ? a('busyBackground', 'blocking', false) : null;
}

export function detectGlare(saturatedRatio: number): Anomaly | null {
  return saturatedRatio > GLARE_MAX ? a('glare', 'warn', false) : null;
}

/** How many chip-diameters wide a region is (≥1). Used to split touching stacks. */
export function splitMergedColumn(x0: number, x1: number, diameterPx: number): number {
  if (diameterPx <= 0) return 1;
  return Math.max(1, Math.round((x1 - x0) / diameterPx));
}

/** Index of the sharpest frame (max variance-of-Laplacian). */
export function pickSharpestFrame(laplacianVariances: number[]): number {
  let best = 0;
  for (let i = 1; i < laplacianVariances.length; i++) {
    if (laplacianVariances[i] > laplacianVariances[best]) best = i;
  }
  return best;
}
