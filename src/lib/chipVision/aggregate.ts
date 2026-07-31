import type { ColumnResult, CountResult, DenomTotal, Anomaly } from './types.ts';

/** Combine the three confidence signals into 0..1. */
export function bandConfidence(band: { colorMargin: number; roundness: number }, frameAgreement: number): number {
  const color = Math.min(1, band.colorMargin / 20);       // ΔE margin ≥20 → full marks
  return Math.max(0, Math.min(1, 0.45 * color + 0.35 * band.roundness + 0.20 * frameAgreement));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/**
 * Align columns across frames by left-to-right order and take, per band slot,
 * the median count. Frame agreement (1 − spread) feeds each band's confidence.
 * The frame with the most columns defines the slot layout.
 */
export function reconcileColumns(frames: ColumnResult[][]): ColumnResult[] {
  if (frames.length === 0) return [];
  const ordered = frames.map((f) => [...f].sort((a, b) => a.x0 - b.x0));
  const base = ordered.reduce((m, f) => (f.length > m.length ? f : m), ordered[0]);
  return base.map((col, ci) => {
    const bands = col.bands.map((b, bi) => {
      const counts = ordered
        .map((f) => f[ci]?.bands[bi]?.count)
        .filter((c): c is number => typeof c === 'number');
      const count = counts.length ? median(counts) : b.count;
      const spread = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
      const agreement = spread === 0 ? 1 : Math.max(0, 1 - spread / Math.max(1, count));
      return { ...b, count, confidence: bandConfidence(b, agreement) };
    });
    return { ...col, bands };
  });
}

/** Sum bands per denomination across ALL columns; roll up overall confidence. */
export function aggregate(reconciled: ColumnResult[], anomalies: Anomaly[], frameCount: number): CountResult {
  const byDenom = new Map<number, { count: number; conf: number[] }>();
  const allConf: number[] = [];
  let hasUnknown = false;

  for (const col of reconciled) {
    for (const b of col.bands) {
      allConf.push(b.confidence);
      if (b.denomValue == null) { hasUnknown = true; continue; }
      const cur = byDenom.get(b.denomValue) ?? { count: 0, conf: [] };
      cur.count += b.count;
      cur.conf.push(b.confidence);
      byDenom.set(b.denomValue, cur);
    }
  }

  const totals: DenomTotal[] = [...byDenom.entries()]
    .map(([value, v]) => ({ value, count: v.count, confidence: v.conf.reduce((s, c) => s + c, 0) / v.conf.length }))
    .sort((a, b) => a.value - b.value);

  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  let confidence = allConf.length ? allConf.reduce((s, c) => s + c, 0) / allConf.length : 0;
  if (hasUnknown) confidence = Math.min(confidence, 0.4);
  if (anomalies.some((x) => x.severity === 'blocking')) confidence = Math.min(confidence, 0.3);

  const outAnomalies = hasUnknown
    ? [...anomalies, { code: 'unknownChips', severity: 'warn' as const, autoFixed: false }]
    : anomalies;
  return { totals, totalValue, anomalies: outAnomalies, frames: frameCount, confidence };
}
