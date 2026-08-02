/** A stack is "flagged" (shown as ⚠ needs-a-look) when its cross-channel confidence is below this. */
export const FLAG_THRESHOLD = 0.85;

export interface SeamVote { count: number; agreement: number }

/** Majority vote over a list of counts. Ties break toward the smaller count. */
export function tally(counts: number[]): SeamVote {
  const m = new Map<number, number>();
  let best = counts[0], bestN = 0;
  for (const c of counts) {
    const n = (m.get(c) ?? 0) + 1; m.set(c, n);
    if (n > bestN || (n === bestN && c < best)) { best = c; bestN = n; }
  }
  return { count: best, agreement: bestN / counts.length };
}

/** Median of a numeric list, or null if empty. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface StackFuseInput {
  seam: SeamVote;                                   // pooled seam vote (all angles/samples)
  geo: number | null;                               // geometry count = round(ratio / k), or null
  dsp: { count: number; strength: number } | null;  // on-device DSP read, or null
}

/**
 * Fuse the seam-vote, geometry, and DSP channels for one stack into a count +
 * a cross-channel confidence. DSP is CONFIRM-ONLY: it must have strong periodicity
 * (strength >= 0.45) and land exactly on a candidate, else it abstains.
 */
export function fuseStack(inp: StackFuseInput): { count: number; confidence: number } {
  const { seam, geo, dsp } = inp;
  const nSeam = seam.count, a = seam.agreement, nGeo = geo;
  const dspBacks = (n: number) => !!dsp && dsp.strength >= 0.45 && dsp.count === n;

  if (!nSeam && nGeo == null) return { count: 0, confidence: 0 };
  if (nGeo == null) {
    if (dspBacks(nSeam)) return { count: nSeam, confidence: Math.max(a, 0.9) };
    return { count: nSeam, confidence: a };
  }
  if (!nSeam) return { count: nGeo, confidence: 0.55 };

  if (nSeam === nGeo) {
    // Two independent channels landing on the SAME count is strong evidence: clear the flag
    // regardless of stack height. A tall stack both channels agree on is not "uncertain" — and
    // the old height penalty (0.8) sat below FLAG_THRESHOLD, so every 5+ stack flagged forever,
    // and a second angle that re-agreed could never clear it. DSP confirmation nudges a touch higher.
    const conf = dspBacks(nSeam) ? 0.95 : 0.9;
    return { count: nSeam, confidence: conf };
  }
  if (Math.abs(nSeam - nGeo) === 1 && a >= 0.8) {
    if (dspBacks(nSeam)) return { count: nSeam, confidence: 0.9 };
    if (dspBacks(nGeo)) return { count: nGeo, confidence: 0.6 };
    return { count: nSeam, confidence: 0.6 };
  }
  if (dspBacks(nSeam)) return { count: nSeam, confidence: 0.75 };
  if (dspBacks(nGeo)) return { count: nGeo, confidence: 0.75 };
  return { count: a >= 0.8 ? nSeam : nGeo, confidence: 0.5 };
}

/** Pool a second angle's votes/ratios into the first angle's for re-fusing. */
export function mergeAngles(
  a: { votes: number[]; ratios: number[] },
  b: { votes: number[]; ratios: number[] },
): { votes: number[]; ratios: number[] } {
  return { votes: [...a.votes, ...b.votes], ratios: [...a.ratios, ...b.ratios] };
}

/** Ids of stacks whose confidence is below the flag threshold. */
export function flaggedStackIds(stacks: { id: string; confidence: number }[], threshold = FLAG_THRESHOLD): string[] {
  return stacks.filter((s) => s.confidence < threshold).map((s) => s.id);
}

type Box = [number, number, number, number];
const cx = (b: Box) => (b[0] + b[2]) / 2, cy = (b: Box) => (b[1] + b[3]) / 2;

/**
 * Match prior (angle-1) stacks to freshly detected (angle-2) boxes of the SAME
 * denomination, choosing the nearest center. Returns prior-id -> fresh box for
 * every prior stack that found a same-denom match.
 */
export function matchStacks(
  prior: { id: string; value: number; box: Box }[],
  fresh: { value: number; box: Box }[],
): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const p of prior) {
    let best: Box | null = null, bestD = Infinity;
    for (const f of fresh) {
      if (f.value !== p.value) continue;
      const d = (cx(f.box) - cx(p.box)) ** 2 + (cy(f.box) - cy(p.box)) ** 2;
      if (d < bestD) { bestD = d; best = f.box; }
    }
    if (best) out.set(p.id, best);
  }
  return out;
}

export interface StackRead {
  count: number;
  r: number | null;                    // height:diameter ratio, or null
  extent: [number, number] | null;     // [yTop, yBottom] 0..1 in the crop, or null
}

/** Parse one model stack object into a StackRead (or null when unusable). */
export function parseRead(obj: any): StackRead | null {
  const n = Math.round(Number(obj?.count));
  if (!Number.isFinite(n) || n < 0) return null;
  const h = Number(obj?.stackHeight), d = Number(obj?.chipDiameter);
  const rr = Number.isFinite(h) && Number.isFinite(d) && d > 0.01 && h > 0 ? h / d : NaN;
  const r = Number.isFinite(rr) && rr >= 0.03 && rr <= 4 ? rr : null;
  const ex = Array.isArray(obj?.extent) && obj.extent.length >= 2
    ? [Number(obj.extent[0]), Number(obj.extent[1])] : null;
  const extent = ex && ex.every(Number.isFinite) && ex[1] > ex[0] ? [ex[0], ex[1]] as [number, number] : null;
  return { count: n, r, extent };
}
