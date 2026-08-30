import assert from 'node:assert/strict';
import { poolLeft, suggestedShare, difference, settleDifference } from './passRound.ts';

/**
 * The pass-around round drops the "cannot drift" guarantee on purpose, so what is
 * tested here is the other half: the pool always reports the truth about what is
 * left, and settling the difference puts the table back on the total exactly.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const sum = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);

const ORDER = ['a', 'b', 'c', 'd'];
const TOTAL = 12000; // €120 at the default unit value

console.log('\nwhat is left as the phone goes round');
check('nobody counted yet: the whole table is open', poolLeft(TOTAL, {}, []) === TOTAL);
check(
  'two counted: only their entries are gone',
  poolLeft(TOTAL, { a: 4700, b: 2500 }, ['a', 'b']) === TOTAL - 7200,
);
check(
  'the player at the machine does not spend their own last answer',
  poolLeft(TOTAL, { a: 4700, b: 2500 }, ['a', 'b'], 'b') === TOTAL - 4700,
  'a re-count must start from the pool as it was before that player',
);
check(
  'a table that counted too much reports a negative pool',
  poolLeft(TOTAL, { a: 9000, b: 9000 }, ['a', 'b']) === -6000,
);

console.log('\nwhere the bar starts');
check('four to go: an even quarter, on the grid', suggestedShare(12000, 4, 500) === 3000);
check('the last player opens on the whole remainder', suggestedShare(2350, 1, 500) === 2350);
check('never below zero', suggestedShare(-600, 3, 500) === 0);
check('rounded to the drag step, not to the cent', suggestedShare(10000, 3, 500) % 500 === 0);

console.log('\nthe difference at the end');
check('a table that adds up has none', difference(TOTAL, { a: 4700, b: 2500, c: 3300, d: 1500 }) === 0);
check('counted too much is positive', difference(TOTAL, { a: 4700, b: 2500, c: 3300, d: 1800 }) === 300);
check('counted too little is negative', difference(TOTAL, { a: 4700, b: 2500, c: 3300, d: 1000 }) === -500);

console.log('\nsettling it');
const off = { a: 4700, b: 2500, c: 3300, d: 1800 };
const fixed = settleDifference(off, ORDER, TOTAL, 500);
check('lands on the table exactly', sum(fixed) === TOTAL, `got ${sum(fixed)}`);
check('order is kept', Object.keys(fixed).join(',') === ORDER.join(','));
check(
  'the biggest counted stack stays the biggest',
  fixed.a === Math.max(...Object.values(fixed)),
);
check('nobody goes negative', Object.values(fixed).every((v) => v >= 0));

const short = settleDifference({ a: 1000, b: 1000, c: 1000, d: 1000 }, ORDER, TOTAL, 500);
check('counting far too little scales UP to the table', sum(short) === TOTAL, `got ${sum(short)}`);
check('an even count stays even', new Set(Object.values(short)).size === 1);

const none = settleDifference({}, ORDER, TOTAL, 500);
check('nothing counted at all still splits the table', sum(none) === TOTAL);

console.log(`\npassRound: ${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`);
assert.equal(failures, 0);
