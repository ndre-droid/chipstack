import { bubblePlace, defaultSplit, normaliseSplit, payoutsFor, resizeSplit } from './payouts.ts';

/**
 * The prize split. The one that matters is the last check in the first block: the
 * figures on the wall have to add up to the pot, because the person holding the
 * cash is the one who has to explain the missing euro. Rounding each share on its
 * own turned €65 into 33 + 20 + 13 = €66.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, Object.is(got, want), `got ${String(got)}, want ${String(want)}`);
const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;

console.log('\nthe split always pays out exactly the pool');
{
  eq('the €65 case that started this: 3 places', sum(payoutsFor(65, 6).map((p) => p.amount)), 65);
  for (const entrants of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 20]) {
    for (const pool of [0, 1, 13.37, 65, 100, 240, 1000.05]) {
      const paid = sum(payoutsFor(pool, entrants).map((p) => p.amount));
      if (paid !== Math.round(pool * 100) / 100) {
        check(`${entrants} runners, pool ${pool}`, false, `pays ${paid}`);
      }
    }
  }
  check('every entrant count × pool adds up', failures === 0);
  eq('and first place absorbs the rounding', payoutsFor(100, 6)[0].amount, 50);
}

console.log('\nhow many places get paid');
{
  eq('heads-up: winner takes all', defaultSplit(2).length, 1);
  eq('three: still winner takes all', defaultSplit(3).length, 1);
  eq('four: two places', defaultSplit(4).length, 2);
  eq('six: three places', defaultSplit(6).length, 3);
  eq('nine: four places', defaultSplit(9).length, 4);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 30]) {
    check(`${n} runners: the shares add to 1`, Math.abs(sum(defaultSplit(n)) - 1) < 1e-9);
    check(`${n} runners: never more places than players`, defaultSplit(n).length <= Math.max(1, n));
  }
}

console.log('\na custom split is cleaned up before it is trusted');
{
  check('halves stay halves', normaliseSplit([0.5, 0.5]).every((p) => p === 0.5));
  check('unnormalised is scaled', Math.abs(sum(normaliseSplit([2, 1, 1])) - 1) < 1e-9);
  eq('the biggest share stays the biggest', normaliseSplit([2, 1, 1])[0], 0.5);
  eq('zero shares are dropped', normaliseSplit([0.6, 0.4, 0]).length, 2);
  eq('so are negative ones', normaliseSplit([-1, 0.5, 0.5]).length, 2);
  eq('nothing usable means winner takes all', normaliseSplit([]).length, 1);
  eq('and so does all zeroes', normaliseSplit([0, 0])[0], 1);
  eq('a custom split is used over the default', payoutsFor(100, 9, [0.5, 0.5])[1].amount, 50);
  eq('an empty custom split falls back to the default', payoutsFor(100, 9, []).length, 4);
  eq('as does null', payoutsFor(100, 9, null).length, 4);
}

console.log('\nresizing keeps the shape it was given');
{
  eq('growing adds a place', resizeSplit([0.5, 0.3, 0.2], 4).length, 4);
  check('and still adds to 1', Math.abs(sum(resizeSplit([0.5, 0.3, 0.2], 4)) - 1) < 1e-9);
  check('the new place is the smallest', (() => {
    const r = resizeSplit([0.5, 0.3, 0.2], 4);
    return r[3] < r[2];
  })());
  check('first place is still first', (() => {
    const r = resizeSplit([0.5, 0.3, 0.2], 4);
    return r[0] > r[1] && r[1] > r[2];
  })());
  eq('shrinking drops from the bottom', resizeSplit([0.5, 0.3, 0.2], 2).length, 2);
  check('and re-normalises', Math.abs(sum(resizeSplit([0.5, 0.3, 0.2], 2)) - 1) < 1e-9);
  eq('never fewer than one place', resizeSplit([0.5, 0.5], 0).length, 1);
  eq('never more than nine', resizeSplit([1], 40).length, 9);
  eq('the same size is left alone', resizeSplit([0.6, 0.4], 2).length, 2);
}

console.log('\nthe bubble — the best finish that wins nothing');
{
  eq('six runners, three paid: fourth bubbles', bubblePlace(6, 3), 4);
  eq('everybody paid: nobody bubbles', bubblePlace(3, 3), null);
  eq('more places than players: still nobody', bubblePlace(3, 5), null);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
