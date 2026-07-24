/**
 * Lightweight background-photo analysis for the TV big-screen.
 *
 * We can't do full object detection in the browser cheaply, but we can find where
 * the "busy" part of a photo is (the subject) and how bright it is overall. The TV
 * then keeps that region clear, crops toward it, and tunes its scrim so the AI-made
 * poker-lounge art stays visible while the clock / stats / legend text stay readable
 * — computed fresh for every upload rather than a one-size-fits-all overlay.
 */
export interface BgAnalysis {
  /** salience-weighted focal point, in 0..100 % of width/height */
  focus: { x: number; y: number };
  /** mean luminance, 0 (dark) .. 1 (bright) — drives scrim strength */
  tone: number;
}

/**
 * Analyse an already-drawn 2D canvas context. Splits the image into a grid, scores
 * each cell by local contrast (edge energy ≈ where the detail is), and returns the
 * contrast-weighted centroid plus the overall brightness. Pixels are subsampled so
 * this stays fast even on a 4K source.
 */
export function analyzeBackground(ctx: CanvasRenderingContext2D, w: number, h: number): BgAnalysis {
  const cols = 16;
  const rows = 9;
  const sum = new Float64Array(cols * rows);
  const sumSq = new Float64Array(cols * rows);
  const n = new Float64Array(cols * rows);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // tainted canvas or unavailable — fall back to neutral centre
    return { focus: { x: 50, y: 50 }, tone: 0.5 };
  }

  // subsample: aim for ~40k samples regardless of source size
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 40000)));
  let total = 0;
  let totalN = 0;
  for (let y = 0; y < h; y += step) {
    const cy = Math.min(rows - 1, Math.floor((y / h) * rows));
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const cx = Math.min(cols - 1, Math.floor((x / w) * cols));
      const cell = cy * cols + cx;
      sum[cell] += lum;
      sumSq[cell] += lum * lum;
      n[cell] += 1;
      total += lum;
      totalN += 1;
    }
  }

  let wsum = 0;
  let wx = 0;
  let wy = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = r * cols + c;
      if (n[cell] === 0) continue;
      const mean = sum[cell] / n[cell];
      const variance = Math.max(0, sumSq[cell] / n[cell] - mean * mean);
      const salience = Math.sqrt(variance); // std-dev ≈ local contrast
      const weight = salience * salience; // emphasise the busiest cells
      const centerX = ((c + 0.5) / cols) * 100;
      const centerY = ((r + 0.5) / rows) * 100;
      wsum += weight;
      wx += centerX * weight;
      wy += centerY * weight;
    }
  }

  const focus =
    wsum > 0
      ? { x: clamp(wx / wsum, 12, 88), y: clamp(wy / wsum, 14, 86) }
      : { x: 50, y: 50 };
  const tone = totalN > 0 ? clamp(total / (totalN * 255), 0, 1) : 0.5;

  return { focus, tone };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
