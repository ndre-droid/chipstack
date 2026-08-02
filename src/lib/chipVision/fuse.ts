/**
 * A stack is "flagged" (soft ⚠ needs-a-look) when the independent samples didn't reach a
 * clear majority — i.e. the model was inconsistent about it. This is NOT a hard error and
 * never forces a re-shoot; it just marks the read as worth a glance in the review editor.
 * 0.6 keeps it quiet: 3/3 or 2/3 agreement stays clean, only a genuine split (all-different)
 * flags.
 */
export const FLAG_THRESHOLD = 0.6;

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

/** Ids of stacks whose confidence is below the flag threshold. */
export function flaggedStackIds(stacks: { id: string; confidence: number }[], threshold = FLAG_THRESHOLD): string[] {
  return stacks.filter((s) => s.confidence < threshold).map((s) => s.id);
}

export interface StackRead {
  count: number;
  extent: [number, number] | null;     // [yTop, yBottom] 0..1 in the crop, or null
}

/** Parse one model stack object into a StackRead (or null when unusable). */
export function parseRead(obj: any): StackRead | null {
  const n = Math.round(Number(obj?.count));
  if (!Number.isFinite(n) || n < 0) return null;
  const ex = Array.isArray(obj?.extent) && obj.extent.length >= 2
    ? [Number(obj.extent[0]), Number(obj.extent[1])] : null;
  const extent = ex && ex.every(Number.isFinite) && ex[1] > ex[0] ? [ex[0], ex[1]] as [number, number] : null;
  return { count: n, extent };
}
