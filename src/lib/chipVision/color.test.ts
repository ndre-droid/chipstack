import assert from 'node:assert/strict';
import { rgbToLab, hexToLab, labDistance, isGoldDeco, dominantLab, nearestDenom, buildDenomRefs } from './color.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('white RGB → L*≈100, a*,b*≈0', () => {
  const [L, a, b] = rgbToLab(255, 255, 255);
  assert.ok(Math.abs(L - 100) < 0.5, `L=${L}`);
  assert.ok(Math.abs(a) < 1 && Math.abs(b) < 1, `a=${a} b=${b}`);
});

ok('black RGB → L*≈0', () => {
  assert.ok(rgbToLab(0, 0, 0)[0] < 0.5);
});

ok('labDistance is symmetric and zero on equal', () => {
  const x: [number, number, number] = [50, 10, -20];
  assert.equal(labDistance(x, x), 0);
  assert.ok(labDistance([0, 0, 0], [100, 0, 0]) === 100);
});

ok('gold deco detected, chip body colours not', () => {
  assert.equal(isGoldDeco(hexToLab('#E9CC7A')), true);   // bright yellow deco line
  assert.equal(isGoldDeco(hexToLab('#0C0C10')), false);  // navy body
  assert.equal(isGoldDeco(hexToLab('#C0392B')), false);  // red body
});

ok('dominantLab ignores deco pixels and returns the median body colour', () => {
  const red = hexToLab('#C0392B');
  const deco = hexToLab('#E9CC7A');
  const px = [red, red, red, deco, red];
  const d = dominantLab(px)!;
  assert.ok(labDistance(d, red) < 3, `got ${d}`);
});

ok('nearestDenom matches the closest and rejects far colours', () => {
  const refs = buildDenomRefs([
    { value: 50, color: '#E0782B', enabled: true },
    { value: 5000, color: '#9A5228', enabled: true },
  ]);
  const orange = nearestDenom(hexToLab('#E0782B'), refs, 20);
  assert.equal(orange.value, 50);
  assert.ok(orange.margin > 0, 'orange should have a positive margin over brown');
  const green = nearestDenom(hexToLab('#2E9E52'), refs, 20);
  assert.equal(green.value, null, 'far-away green must be rejected');
});

ok('buildDenomRefs prefers calibrated colours when present', () => {
  const cal = { ratio: 0.085, colors: { 50: [60, 5, 5] as [number, number, number] }, createdAt: 0 };
  const refs = buildDenomRefs([{ value: 50, color: '#E0782B', enabled: true }], cal);
  assert.deepEqual(refs[0].lab, [60, 5, 5]);
});

ok('buildDenomRefs skips disabled denoms', () => {
  const refs = buildDenomRefs([{ value: 1, color: '#ECE4D0', enabled: false }]);
  assert.equal(refs.length, 0);
});

ok('no denom body colour is misclassified as gold deco', () => {
  const bodies = ['#ECE4D0','#C0392B','#31B6C9','#2E9E52','#E0782B','#0C0C10','#7A3D9C','#E4B41F','#9A5228'];
  for (const hex of bodies) assert.equal(isGoldDeco(hexToLab(hex)), false, hex + ' flagged as deco');
});

ok('nearestDenom respects the reject boundary (near-threshold)', () => {
  const refs = buildDenomRefs([{ value: 50, color: '#E0782B', enabled: true }]);
  const off = nearestDenom(hexToLab('#9A5228'), refs, 20);   // brown, ΔE≈28.6 from orange
  assert.equal(off.value, null, 'brown beyond reject=20 must be null');
  const loose = nearestDenom(hexToLab('#9A5228'), refs, 40);
  assert.equal(loose.value, 50, 'same colour within reject=40 matches');
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
