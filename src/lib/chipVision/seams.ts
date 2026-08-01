/**
 * Interior seam positions for a stack of identical chips. The chips are uniform
 * (same SLOWPLAY ceramic), so seams are evenly spaced: divide the stack span
 * [yTop, yBottom] into `count` equal chips and return the count-1 boundaries.
 * count <= 1 yields no interior seams.
 */
export function seamLines(span: [number, number], count: number): number[] {
  if (!Number.isFinite(count) || count <= 1) return [];
  const [top, bottom] = span;
  const step = (bottom - top) / count;
  const out: number[] = [];
  for (let i = 1; i < count; i++) out.push(top + step * i);
  return out;
}
