import { loadCv } from './opencv.ts';
import type { ColumnResult, Band, Anomaly, DenomRef, Lab } from './types.ts';
import { dominantLab, nearestDenom } from './color.ts';
import { singleChipHeightPx, bandCount, rawBandCount, leanAngleDeg } from './geometry.ts';
import {
  detectView, detectLean, detectCutOff, detectWeakContrast, detectBusyBackground, detectGlare, splitMergedColumn,
} from './anomaly.ts';

export type Box = { x0: number; y0: number; x1: number; y1: number };

const WORK_W = 1000;             // working width (px)
const BAND_DELTA_E = 8;          // Lab jump that starts a new band
const MIN_BAND_CHIPS = 0.4;      // merge slivers below this

/** Draw the source into a working canvas cropped to the guide box. */
function toWorkCanvas(src: ImageBitmap | HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const scale = WORK_W / bw;
  const c = document.createElement('canvas');
  c.width = Math.round(bw * scale);
  c.height = Math.round(bh * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, box.x0, box.y0, bw, bh, 0, 0, c.width, c.height);
  return c;
}

/**
 * One frame → columns. Pipeline: felt background model → foreground mask →
 * column segmentation → per-column top-ellipse fit (self-calibrating scale) →
 * colour-band read + denom classification. Anomalies collected alongside.
 */
export async function extractColumns(
  src: ImageBitmap | HTMLCanvasElement,
  box: Box,
  denoms: DenomRef[],
  ratio: number,
  rejectDeltaE: number,
): Promise<{ columns: ColumnResult[]; anomalies: Anomaly[]; laplacianVariance: number }> {
  const cv = await loadCv();
  const canvas = toWorkCanvas(src, box);
  const W = canvas.width, H = canvas.height;
  const workBox = { x0: 0, y0: 0, x1: W, y1: H };
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, W, H);

  const src4 = cv.matFromImageData(rgba);
  const rgb = new cv.Mat();
  cv.cvtColor(src4, rgb, cv.COLOR_RGBA2RGB);
  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

  // --- sharpness (variance of Laplacian on grayscale) ---
  const gray = new cv.Mat();
  cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const lap = new cv.Mat();
  cv.Laplacian(gray, lap, cv.CV_64F);
  const mean = new cv.Mat(), stddev = new cv.Mat();
  cv.meanStdDev(lap, mean, stddev);
  const laplacianVariance = stddev.doubleAt(0, 0) ** 2;

  // --- foreground mask: brightness (Otsu) split, robust to dark / low-light /
  // coloured-lit surfaces where a colour-distance-to-felt threshold fails ---
  const mask = foregroundMask(cv, gray, W, H);
  const maskCoverage = cv.countNonZero(mask) / (W * H);

  const anomalies: Anomaly[] = [];
  const contrast = detectWeakContrast(maskCoverage);
  if (contrast) anomalies.push(contrast);
  const busy = detectBusyBackground(maskCoverage);
  if (busy) anomalies.push(busy);
  const glare = detectGlare(saturatedRatio(lab, mask, W, H));
  if (glare) anomalies.push(glare);

  // A busy / low-contrast background yields one frame-sized blob. Skip column
  // detection then, and drop any whole-frame region, so it can't masquerade as a
  // giant "column" that trips the cut-off / merged-stacks warnings.
  const rawColumns = (busy ? [] : segmentColumns(cv, mask, W, H)).filter(
    (c) => (c.x1 - c.x0) <= 0.92 * W || (c.bottomY - c.topY) <= 0.92 * H,
  ); // {x0,x1,topY,bottomY,contour}
  const diameterPx = rawColumns.length ? median(rawColumns.map((c) => c.x1 - c.x0)) : W;

  const columns: ColumnResult[] = [];
  let ci = 0;
  for (const rc of rawColumns) {
    const subCount = splitMergedColumn(rc.x0, rc.x1, diameterPx);
    if (subCount > 1) anomalies.push({ code: 'mergedColumns', severity: 'warn', autoFixed: true, columnIndex: ci });
    const subW = (rc.x1 - rc.x0) / subCount;
    for (let s = 0; s < subCount; s++) {
      const cx0 = rc.x0 + s * subW, cx1 = cx0 + subW;
      const col = readColumn(cv, lab, mask, { x0: cx0, x1: cx1, topY: rc.topY, bottomY: rc.bottomY }, denoms, ratio, rejectDeltaE, ci, anomalies, workBox);
      if (col) columns.push(col);
      ci++;
    }
  }

  src4.delete(); rgb.delete(); lab.delete(); gray.delete(); lap.delete();
  mean.delete(); stddev.delete(); mask.delete();
  return { columns, anomalies, laplacianVariance };

  // ---- helpers close over `cv` ----
  function readColumn(
    cv: any, lab: any, mask: any,
    reg: { x0: number; x1: number; topY: number; bottomY: number },
    denoms: DenomRef[], ratio: number, reject: number, columnIndex: number,
    anomalies: Anomaly[], box: Box,
  ): ColumnResult | null {
    const ellipse = fitTopEllipse(cv, mask, reg);        // {major,minor,cx,cy,angle} | null
    const cut = detectCutOff(reg.x0, reg.x1, reg.topY, reg.bottomY, box, columnIndex);
    if (cut) anomalies.push(cut);

    let major = ellipse?.major ?? (reg.x1 - reg.x0);
    let minor = ellipse?.minor ?? major * 0.4;
    const view = detectView(minor, major, columnIndex);
    if (view) anomalies.push(view);

    const topCx = ellipse?.cx ?? (reg.x0 + reg.x1) / 2;
    const botCx = bottomCentre(cv, mask, reg);
    const lean = detectLean(leanAngleDeg(topCx, reg.topY, botCx, reg.bottomY), columnIndex);
    if (lean.anomaly) anomalies.push(lean.anomaly);

    const hPx = singleChipHeightPx(major, minor, ratio) || (ratio * major);
    const profile = colourProfile(cv, lab, mask, reg, ellipse, lean.useAxis, topCx, botCx);  // Lab per row, top→bottom
    const bands = segmentBands(profile, hPx, denoms, reject);
    if (bands.length === 0) return null;
    return { x0: reg.x0, x1: reg.x1, topY: reg.topY, bottomY: reg.bottomY, hPx, bands };
  }

  function segmentBands(profile: Lab[], hPx: number, denoms: DenomRef[], reject: number): Band[] {
    const bands: Band[] = [];
    let start = 0;
    const flush = (end: number) => {
      const slice = profile.slice(start, end);
      const lab = dominantLab(slice);
      if (!lab) return;
      const heightPx = end - start;
      if (heightPx / hPx < MIN_BAND_CHIPS && bands.length) {   // merge sliver into previous
        return;
      }
      const m = nearestDenom(lab, denoms, reject);
      const raw = rawBandCount(heightPx, hPx);
      const roundness = 1 - 2 * Math.abs(raw - Math.round(raw));
      bands.push({
        denomValue: m.value, lab, heightPx,
        count: bandCount(heightPx, hPx),
        confidence: 1, colorMargin: m.margin, roundness: Math.max(0, roundness),
      });
    };
    for (let y = 1; y < profile.length; y++) {
      if (labDist(profile[y], profile[y - 1]) > BAND_DELTA_E) { flush(y); start = y; }
    }
    flush(profile.length);
    return bands;
  }
}

// ---- small pure-ish CV helpers (kept in this impure file on purpose) ----
function labDist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }

// ---- OpenCV.js helper contracts ----
// cv-Lab is scaled 0..255 per channel; real Lab = (L*100/255, a-128, b-128).

/**
 * Foreground mask via Otsu on brightness (chips vs surface), forcing the border
 * majority to background so foreground = chips whether the surface is darker OR
 * lighter than the chips. Far more robust than a fixed colour-distance-to-felt
 * threshold under dark, textured, or coloured-lit surfaces (which produced one
 * frame-sized blob). Open+close with a 5×5 kernel to de-noise.
 */
function foregroundMask(cv: any, gray: any, W: number, H: number): any {
  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  const mask = new cv.Mat();
  cv.threshold(blur, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  blur.delete();

  const d = mask.data as Uint8Array;
  let borderFg = 0, borderN = 0;
  for (let x = 0; x < W; x++) { borderFg += (d[x] ? 1 : 0) + (d[(H - 1) * W + x] ? 1 : 0); borderN += 2; }
  for (let y = 0; y < H; y++) { borderFg += (d[y * W] ? 1 : 0) + (d[y * W + W - 1] ? 1 : 0); borderN += 2; }
  if (borderN > 0 && borderFg / borderN > 0.5) cv.bitwise_not(mask, mask);

  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  kernel.delete();
  return mask;
}

/** External contours taller than 0.15·H, as bounding boxes sorted by x. */
function segmentColumns(cv: any, mask: any, W: number, H: number): { x0: number; x1: number; topY: number; bottomY: number }[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const boxes: { x0: number; x1: number; topY: number; bottomY: number }[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const rect = cv.boundingRect(c);
    c.delete();
    if (rect.height > 0.15 * H) {
      boxes.push({
        x0: Math.max(0, rect.x), x1: Math.min(W, rect.x + rect.width),
        topY: rect.y, bottomY: rect.y + rect.height,
      });
    }
  }
  contours.delete();
  hierarchy.delete();
  boxes.sort((a, b) => a.x0 - b.x0);
  return boxes;
}

interface FittedEllipse { major: number; minor: number; cx: number; cy: number; angle: number }

/**
 * Fit an ellipse to the column's TOP RIM — the topmost foreground pixel in each
 * column x. Fitting the top EDGE (not the filled top band, which includes the
 * straight column sides and inflates the minor axis, causing a ~2× overcount)
 * recovers the true top-face aspect ratio, hence the correct per-chip scale.
 * (Also avoids cv.findNonZero, which is absent in @techstark/opencv-js.)
 */
function fitTopEllipse(
  cv: any, mask: any,
  reg: { x0: number; x1: number; topY: number; bottomY: number },
): FittedEllipse | null {
  const x0 = Math.max(0, Math.round(reg.x0));
  const x1 = Math.min(mask.cols, Math.round(reg.x1));
  const top = Math.max(0, Math.round(reg.topY));
  // Scan down at most half the column looking for each column's top edge.
  const maxScan = Math.min(mask.rows, top + Math.max(6, Math.round((reg.bottomY - reg.topY) * 0.5)));
  if (x1 - x0 < 5 || maxScan <= top) return null;

  const coords: number[] = [];
  for (let x = x0; x < x1; x++) {
    for (let y = top; y < maxScan; y++) {
      if (mask.ucharPtr(y, x)[0] !== 0) { coords.push(x - x0, y - top); break; }
    }
  }
  if (coords.length < 10) return null; // fewer than 5 rim points

  const pts = cv.matFromArray(coords.length / 2, 1, cv.CV_32SC2, coords);
  const rot = cv.fitEllipse(pts);
  pts.delete();
  return {
    major: Math.max(rot.size.width, rot.size.height),
    minor: Math.min(rot.size.width, rot.size.height),
    cx: x0 + rot.center.x, cy: top + rot.center.y, angle: rot.angle,
  };
}

/**
 * Per-row dominant Lab from the ellipse's bottom edge down to bottomY, sampled
 * across the column width and shifted along the top→bottom lean axis when
 * `useAxis` is set. `cv` isn't needed here (Mat instance methods only) — kept
 * in the signature to match the call site.
 */
function colourProfile(
  _cv: any, lab: any, mask: any,
  reg: { x0: number; x1: number; topY: number; bottomY: number },
  ellipse: { cy: number; minor: number } | null,
  useAxis: boolean, topCx: number, botCx: number,
): Lab[] {
  const top = Math.round(reg.topY), bottom = Math.round(reg.bottomY);
  const startY = Math.min(bottom, Math.max(top, Math.round(
    ellipse ? ellipse.cy + ellipse.minor / 2 : top + (bottom - top) * 0.25,
  )));
  const w = Math.max(1, reg.x1 - reg.x0);
  const span = Math.max(1, bottom - top);
  const profile: Lab[] = [];
  let last: Lab = [50, 0, 0];
  for (let y = startY; y < bottom; y++) {
    const dx = useAxis ? (botCx - topCx) * (y - top) / span : 0;
    const sx0 = Math.max(0, Math.round(reg.x0 + dx));
    const sx1 = Math.min(mask.cols, Math.round(reg.x0 + dx + w));
    const px: Lab[] = [];
    for (let x = sx0; x < sx1; x++) {
      if (mask.ucharPtr(y, x)[0] === 0) continue;
      const p = lab.ucharPtr(y, x);
      px.push([(p[0] * 100) / 255, p[1] - 128, p[2] - 128]);
    }
    const d = dominantLab(px.length ? px : [last]);
    last = d ?? last;
    profile.push(last);
  }
  return profile;
}

/** Mean x of masked pixels in the bottom 10% of the region. */
function bottomCentre(_cv: any, mask: any, reg: { x0: number; x1: number; topY: number; bottomY: number }): number {
  const top = Math.round(reg.topY), bottom = Math.round(reg.bottomY);
  const bandTop = Math.max(top, Math.round(bottom - (bottom - top) * 0.1));
  const x0 = Math.max(0, Math.round(reg.x0)), x1 = Math.min(mask.cols, Math.round(reg.x1));
  let sum = 0, n = 0;
  for (let y = bandTop; y < bottom; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask.ucharPtr(y, x)[0] !== 0) { sum += x; n++; }
    }
  }
  return n > 0 ? sum / n : (x0 + x1) / 2;
}

/** Fraction of masked pixels with real L* > 96 (blown-out highlights). */
function saturatedRatio(lab: any, mask: any, W: number, H: number): number {
  const src = lab.data as Uint8Array;
  const m = mask.data as Uint8Array;
  let sat = 0, total = 0;
  for (let p = 0, i = 0; p < W * H; p++, i += 3) {
    if (m[p] === 0) continue;
    total++;
    if ((src[i] * 100) / 255 > 96) sat++;
  }
  return total > 0 ? sat / total : 0;
}
