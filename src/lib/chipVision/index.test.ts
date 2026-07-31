import assert from 'node:assert/strict';
import { analyzeColumns } from './index.ts';
import type { ColumnResult, Band } from './types.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

const band = (v: number | null, c: number): Band => ({ denomValue: v, lab: [50, 0, 0], heightPx: c * 13, count: c, confidence: 1, colorMargin: 25, roundness: 1 });
const col = (x0: number, bands: Band[]): ColumnResult => ({ x0, x1: x0 + 40, topY: 0, bottomY: 100, hPx: 13, bands });

ok('one frame, two same-colour stacks → summed total', () => {
  const res = analyzeColumns([[col(10, [band(10, 12)]), col(80, [band(10, 8)])]], []);
  assert.equal(res.totalValue, 200);
  assert.equal(res.totals[0].count, 20);
});

ok('three frames reconcile to the median count', () => {
  const frames = [
    [col(10, [band(100, 5)])],
    [col(10, [band(100, 6)])],
    [col(10, [band(100, 5)])],
  ];
  const res = analyzeColumns(frames, []);
  assert.equal(res.totalValue, 500);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
