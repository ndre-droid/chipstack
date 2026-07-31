import type { ColumnResult, CountResult, Anomaly, ChipCalibration } from './types.ts';
import { reconcileColumns, aggregate } from './aggregate.ts';
import { pickSharpestFrame } from './anomaly.ts';
import { buildDenomRefs } from './color.ts';
import { DEFAULT_RATIO } from './geometry.ts';
import { extractColumns, type Box } from './extract.ts';

export const REJECT_DELTA_E = 24;   // ΔE beyond which a band is "unknown"

export { type Box };

/** Pure core: reconcile + aggregate already-extracted columns. */
export function analyzeColumns(frames: ColumnResult[][], anomalies: Anomaly[]): CountResult {
  const reconciled = reconcileColumns(frames);
  return aggregate(reconciled, anomalies, frames.length);
}

/** Full pipeline over captured frames. */
export async function analyzeFrames(
  frames: (ImageBitmap | HTMLCanvasElement)[],
  box: Box,
  denoms: { value: number; color: string; enabled: boolean }[],
  cal: ChipCalibration | undefined,
  _sharpnessVariances: number[],
): Promise<CountResult> {
  const refs = buildDenomRefs(denoms, cal);
  const ratio = cal?.ratio ?? DEFAULT_RATIO;

  const extracted = await Promise.all(
    frames.map((f) => extractColumns(f, box, refs, ratio, REJECT_DELTA_E)),
  );
  // Drop the blurriest frame if we have 3+ and it lags badly.
  const variances = extracted.map((e) => e.laplacianVariance);
  const sharpest = pickSharpestFrame(variances);
  const kept = extracted.filter((_, i) => variances[i] >= variances[sharpest] * 0.5);

  const cols = kept.map((e) => e.columns);
  const anomalies = dedupeAnomalies(kept.flatMap((e) => e.anomalies));
  return analyzeColumns(cols, anomalies);
}

function dedupeAnomalies(list: Anomaly[]): Anomaly[] {
  const seen = new Map<string, Anomaly>();
  for (const a of list) {
    const key = a.code + ':' + (a.columnIndex ?? '');
    const prev = seen.get(key);
    if (!prev || (a.severity === 'blocking' && prev.severity !== 'blocking')) seen.set(key, a);
  }
  return [...seen.values()];
}
