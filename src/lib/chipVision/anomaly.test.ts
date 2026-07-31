import assert from 'node:assert/strict';
import {
  detectView, detectTooTall, detectLean, detectCutOff,
  detectWeakContrast, detectGlare, splitMergedColumn, pickSharpestFrame,
} from './anomaly.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('view in the sweet spot → no anomaly', () => {
  // b/a = 0.42 (θ≈65°)
  assert.equal(detectView(84, 200, 0), null);
});

ok('too top-down (b/a>0.8) warns; >0.9 blocks', () => {
  assert.equal(detectView(170, 200, 0)!.severity, 'warn');
  assert.equal(detectView(185, 200, 0)!.severity, 'blocking');
  assert.equal(detectView(170, 200, 0)!.code, 'viewTooTopDown');
});

ok('too side-on (b/a<0.15) blocks with the no-ellipse code', () => {
  const a = detectView(20, 200, 1)!;
  assert.equal(a.severity, 'blocking');
  assert.equal(a.code, 'viewTooSideOn');
  assert.equal(a.columnIndex, 1);
});

ok('too tall warns over ~30', () => {
  assert.equal(detectTooTall(25, 0), null);
  assert.equal(detectTooTall(34, 0)!.code, 'tooTall');
});

ok('small lean → use principal axis, no user anomaly', () => {
  const r = detectLean(6, 0);
  assert.equal(r.useAxis, true);
  assert.equal(r.anomaly, null);
});

ok('extreme lean → blocking anomaly', () => {
  const r = detectLean(20, 2);
  assert.equal(r.anomaly!.code, 'leaning');
  assert.equal(r.anomaly!.severity, 'blocking');
});

ok('column touching the guide box edge → cut-off', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  assert.equal(detectCutOff(10, 90, 10, 90, box, 0), null);
  assert.equal(detectCutOff(10, 90, 1, 90, box, 0)!.code, 'cutOff');   // top touches
});

ok('weak mask coverage → contrast anomaly', () => {
  assert.equal(detectWeakContrast(0.4), null);
  assert.equal(detectWeakContrast(0.05)!.code, 'weakContrast');
});

ok('glare when many blown-out edge pixels', () => {
  assert.equal(detectGlare(0.02), null);
  assert.equal(detectGlare(0.2)!.code, 'glare');
});

ok('splitMergedColumn returns how many chips wide a region is', () => {
  assert.equal(splitMergedColumn(0, 210, 100), 2);   // ~2 diameters wide
  assert.equal(splitMergedColumn(0, 105, 100), 1);
});

ok('pickSharpestFrame returns the index of the max variance', () => {
  assert.equal(pickSharpestFrame([12, 40, 8]), 1);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
