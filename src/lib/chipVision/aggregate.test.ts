import assert from 'node:assert/strict';
import { bandConfidence, reconcileColumns, aggregate } from './aggregate.ts';
import type { ColumnResult, Band } from './types.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

const band = (denomValue: number | null, count: number, extra: Partial<Band> = {}): Band => ({
  denomValue, lab: [50, 0, 0], heightPx: count * 13, count,
  confidence: 1, colorMargin: 20, roundness: 1, ...extra,
});
const col = (x0: number, bands: Band[]): ColumnResult => ({ x0, x1: x0 + 40, topY: 0, bottomY: 100, hPx: 13, bands });

ok('bandConfidence rewards margin, roundness, agreement', () => {
  assert.ok(bandConfidence({ colorMargin: 30, roundness: 1 }, 1) > 0.9);
  assert.ok(bandConfidence({ colorMargin: 1, roundness: 0.2 }, 0.3) < 0.5);
});

ok('reconcileColumns takes the median band count across frames by x-order', () => {
  const frames: ColumnResult[][] = [
    [col(10, [band(10, 12)])],
    [col(10, [band(10, 13)])],
    [col(10, [band(10, 12)])],
  ];
  const r = reconcileColumns(frames);
  assert.equal(r[0].bands[0].count, 12);
});

ok('aggregate sums the SAME denom across multiple columns', () => {
  const cols = [col(10, [band(10, 12)]), col(80, [band(10, 8)]), col(150, [band(100, 3)])];
  const res = aggregate(cols, [], 3);
  const ten = res.totals.find((t) => t.value === 10)!;
  const hundred = res.totals.find((t) => t.value === 100)!;
  assert.equal(ten.count, 20);                 // 12 + 8 across two cyan columns
  assert.equal(hundred.count, 3);
  assert.equal(res.totalValue, 20 * 10 + 3 * 100);
});

ok('aggregate keeps unknown bands out of totals but lowers confidence', () => {
  const cols = [col(10, [band(null, 5, { confidence: 0.2 })])];
  const res = aggregate(cols, [], 1);
  assert.equal(res.totals.length, 0);
  assert.ok(res.confidence < 0.5);
  assert.ok(res.anomalies.some((a) => a.code === 'unknownChips' && a.severity === 'warn'));
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
