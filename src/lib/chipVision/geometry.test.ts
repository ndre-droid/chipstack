import assert from 'node:assert/strict';
import { DEFAULT_RATIO, tiltSinTheta, singleChipHeightPx, bandCount, rawBandCount, leanAngleDeg } from './geometry.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('DEFAULT_RATIO ≈ 0.0846', () => assert.ok(Math.abs(DEFAULT_RATIO - 3.3 / 39) < 1e-9));

ok('tiltSinTheta: circle (top view) → 0, line (side view) → 1', () => {
  assert.ok(Math.abs(tiltSinTheta(100, 100) - 0) < 1e-9);
  assert.ok(Math.abs(tiltSinTheta(0, 100) - 1) < 1e-9);
});

ok('singleChipHeightPx uses h = ratio·a·sinθ', () => {
  // a=200, b/a=0.6 → sinθ=0.8; ratio 0.0846 → h = 0.0846*200*0.8 = 13.53
  const h = singleChipHeightPx(200, 120, DEFAULT_RATIO);
  assert.ok(Math.abs(h - 13.53) < 0.1, `h=${h}`);
});

ok('bandCount rounds to nearest chip, min 1', () => {
  const h = 13.5;
  assert.equal(bandCount(13.5 * 12, h), 12);
  assert.equal(bandCount(13.5 * 11.6, h), 12);
  assert.equal(bandCount(1, h), 1);      // never zero for a real band
});

ok('rawBandCount is unrounded (for roundness confidence)', () => {
  assert.ok(Math.abs(rawBandCount(27, 13.5) - 2) < 1e-9);
});

ok('leanAngleDeg: perfectly vertical stack → 0°', () => {
  assert.ok(Math.abs(leanAngleDeg(100, 0, 100, 400)) < 1e-9);
});

ok('leanAngleDeg: leaning stack → non-zero', () => {
  // top shifted 40px over a 400px height → atan(40/400) ≈ 5.7°
  assert.ok(Math.abs(leanAngleDeg(140, 0, 100, 400) - 5.71) < 0.1);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
