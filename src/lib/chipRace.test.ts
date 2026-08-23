import assert from 'node:assert/strict';
import { raceOff, drawOrder } from './chipRace.ts';

/**
 * A colour-up moves real money between real people, so the property that matters is
 * conservation: the value on the table before the race is the value after it, give
 * or take the one remainder that genuinely cannot be represented in the new chip.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function show(label: string, counts: number[], from: number, to: number) {
  console.log(`\n${label}`);
  const entries = counts.map((count, i) => ({ id: `p${i}`, name: `P${i + 1}`, count }));
  const r = raceOff(entries, from, to);
  for (const p of r.players)
    console.log(`  ${p.name}: ${p.count}x${from} -> ${p.exchange}x${to} + race ${p.leftover} -> won ${p.won}`);
  console.log(`  raced ${r.raced} chips, remainder ${r.remainderValue}`);
  return r;
}

const clean = show('five 10s make a 50 — everyone divides evenly', [10, 15, 20], 10, 50);
check('nothing is left to race', clean.raced === 0 && clean.remainderValue === 0);
check('the exchange is exact', clean.players.map((p) => p.exchange).join() === '2,3,4');
check('value is conserved', clean.players.reduce((s, p) => s + p.total * 50, 0) === 450);

const odd = show('the same chips, but nobody divides evenly', [7, 13, 4], 10, 50);
const beforeOdd = (7 + 13 + 4) * 10;
const afterOdd = odd.players.reduce((s, p) => s + p.total * 50, 0);
check('the race hands out every chip it can', odd.raced === Math.floor((beforeOdd - odd.exchanged * 50) / 50));
check('value in equals value out, bar the remainder', afterOdd + odd.remainderValue === beforeOdd, `${afterOdd} + ${odd.remainderValue} vs ${beforeOdd}`);
check('the remainder is smaller than one new chip', odd.remainderValue < 50);
check('nobody ends up with fewer chips than their whole exchanges', odd.players.every((p) => p.total >= p.exchange));

console.log('\nthe biggest leftover wins the odd chip');
const race = raceOff(
  [
    { id: 'a', name: 'Ann', count: 4 }, // 40 left over
    { id: 'b', name: 'Ben', count: 1 }, // 10 left over
  ],
  10,
  50,
);
check('one chip is raced', race.raced === 1);
check('Ann wins it', race.players.find((p) => p.id === 'a')?.won === 1);
check('Ben wins nothing', race.players.find((p) => p.id === 'b')?.won === 0);

console.log('\nties are broken by the draw, not by luck of the array');
const tieA = raceOff(
  [
    { id: 'a', name: 'Ann', count: 2 },
    { id: 'b', name: 'Ben', count: 2 },
    { id: 'c', name: 'Cid', count: 1 },
  ],
  10,
  50,
  ['b', 'a', 'c'],
);
check('the drawn order decides', tieA.players.find((p) => p.id === 'b')?.won === 1);

console.log('\nuneven ratios still conserve value');
const uneven = show('25s raced off into 100s', [3, 7, 5], 25, 100);
const beforeU = (3 + 7 + 5) * 25;
const afterU = uneven.players.reduce((s, p) => s + p.total * 100, 0);
check('value in equals value out, bar the remainder', afterU + uneven.remainderValue === beforeU);
check('the ratio is reported as clean', uneven.ratioClean && uneven.ratio === 4);

console.log('\nnonsense input is refused rather than guessed at');
check('a "bigger" chip that is smaller', raceOff([{ id: 'a', name: 'A', count: 5 }], 100, 25).players.length === 0);
check('a zero-value chip', raceOff([{ id: 'a', name: 'A', count: 5 }], 0, 25).players.length === 0);
check('nobody holding anything', raceOff([], 10, 50).players.length === 0);

console.log('\nthe draw is a real shuffle');
const ids = ['a', 'b', 'c', 'd', 'e'];
const shuffled = drawOrder(ids, (() => { let n = 0; return () => ((n = (n * 9301 + 49297) % 233280) / 233280); })());
check('everybody is still in the draw', [...shuffled].sort().join() === ids.join());

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} chip-race check(s) failed`);
