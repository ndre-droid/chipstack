import assert from 'node:assert/strict';
import { sidePots } from './sidePots.ts';
import type { PotContender } from './sidePots.ts';

/**
 * Side pots are settled out loud at a table full of people who disagree, so the
 * properties are asserted rather than eyeballed: every chip committed is either in a
 * pot or handed back, no pot lists somebody who cannot win it, and the shortest
 * stack caps the main pot.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

function show(label: string, cs: PotContender[]) {
  console.log(`\n${label}`);
  const r = sidePots(cs);
  for (const p of r.pots)
    console.log(`  ${p.index === 0 ? 'main' : `side ${p.index}`}: ${p.amount} (${p.eligible.join(', ') || 'nobody'})`);
  if (r.uncalled) console.log(`  back to ${r.uncalled.name}: ${r.uncalled.amount}`);
  return r;
}

// The textbook case: three all in for different amounts.
const three = show('three all-in for 20 / 50 / 100', [
  { id: 'a', name: 'Ann', committed: 20 },
  { id: 'b', name: 'Ben', committed: 50 },
  { id: 'c', name: 'Cid', committed: 100 },
]);
check('every committed chip is accounted for', sum(three.pots.map((p) => p.amount)) + (three.uncalled?.amount ?? 0) === 170);
check('the main pot is capped by the shortest stack', three.pots[0].amount === 60);
check('everyone can win the main pot', three.pots[0].eligible.length === 3);
check('the first side pot is only Ben and Cid', three.pots[1].amount === 60 && three.pots[1].eligible.join() === 'Ben,Cid');
check('the uncalled 50 goes back to Cid', three.uncalled?.name === 'Cid' && three.uncalled?.amount === 50);
check('no pot exists that only one player could win', three.pots.every((p) => p.eligible.length !== 1));

// Two players matched at the top: nothing is uncalled.
const matched = show('two matched at 100, one short at 20', [
  { id: 'a', name: 'Ann', committed: 20 },
  { id: 'b', name: 'Ben', committed: 100 },
  { id: 'c', name: 'Cid', committed: 100 },
]);
check('nothing is handed back when the bet was called', matched.uncalled === null);
check('the pots add up to the whole 220', sum(matched.pots.map((p) => p.amount)) === 220);
check('main pot is 60, side pot is 160', matched.pots[0].amount === 60 && matched.pots[1].amount === 160);

// A folded player's chips stay in the pot; the player does not.
const folded = show('Ben folded after putting in 50', [
  { id: 'a', name: 'Ann', committed: 100 },
  { id: 'b', name: 'Ben', committed: 50, folded: true },
  { id: 'c', name: 'Cid', committed: 100 },
]);
check("a folded player's chips are still in the pot", sum(folded.pots.map((p) => p.amount)) === 250);
check('a folded player can never win one', folded.pots.every((p) => !p.eligible.includes('Ben')));

// Everyone equal — one pot, no sides.
const even = show('everyone in for the same 30', [
  { id: 'a', name: 'Ann', committed: 30 },
  { id: 'b', name: 'Ben', committed: 30 },
]);
check('an even all-in makes exactly one pot', even.pots.length === 1 && even.pots[0].amount === 60);

// Degenerate inputs must not throw or invent money.
const alone = show('one player, nobody called', [{ id: 'a', name: 'Ann', committed: 40 }]);
check('an uncalled bet with no opponent comes straight back', alone.pots.length === 0 && alone.uncalled?.amount === 40);
check('nothing at all is handled', sidePots([]).pots.length === 0);

// Cents: a pot must not gain or lose a cent to rounding.
const cents = show('uneven amounts with cents', [
  { id: 'a', name: 'Ann', committed: 13.33 },
  { id: 'b', name: 'Ben', committed: 13.33 },
  { id: 'c', name: 'Cid', committed: 27.5 },
]);
const centsTotal = sum(cents.pots.map((p) => p.amount)) + (cents.uncalled?.amount ?? 0);
check('the cents balance', Math.abs(centsTotal - 54.16) < 0.005, `${centsTotal}`);
check('no pot is off by a stray cent', cents.pots.every((p) => Math.abs(p.amount * 100 - Math.round(p.amount * 100)) < 1e-6));

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} side-pot check(s) failed`);
