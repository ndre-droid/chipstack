/**
 * Content score of a downscaled luma grid: standard deviation normalized to 0..1.
 * A blank/empty table is near-uniform (~0); chips add edges/contrast (higher).
 * Pure — used to gate auto-capture so it won't fire at nothing.
 */
export function contentScore(luma: number[]): number {
  const n = luma.length;
  if (!n) return 0;
  let mean = 0; for (const v of luma) mean += v; mean /= n;
  let varSum = 0; for (const v of luma) varSum += (v - mean) ** 2;
  return Math.min(1, Math.sqrt(varSum / n) / 128);
}
