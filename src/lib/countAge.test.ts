import { ageLabel, oldestCountedAt, rowAgeOf, STALE_MS } from './countAge.ts';
import type { LedgerPlayer } from '../types.ts';

/**
 * The age of a stack figure — the number that lets the table be counted a player at
 * a time. Two properties carry the whole design: a row goes quiet while its stack is
 * fresh, and the table reports its OLDEST stack rather than its newest.
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

/** a fixed "now" — the clock is stubbed rather than waited on */
const NOW = 1_700_000_000_000;
const MIN = 60_000;

let seq = 0;
function mk(p: Partial<LedgerPlayer> = {}): LedgerPlayer {
  return { id: `p${++seq}`, name: `Player ${seq}`, buyIn: 20, cashOut: 0, ...p };
}

console.log('a row stays quiet while its stack is believable');
{
  eq('never counted says so', rowAgeOf(mk(), NOW), 'never');
  eq('counted five minutes ago', rowAgeOf(mk({ countedAt: NOW - 5 * MIN }), NOW), 'hidden');
  eq(
    'counted forty minutes ago',
    rowAgeOf(mk({ countedAt: NOW - 40 * MIN }), NOW),
    40 * MIN,
  );
  /* The boundary belongs to the visible side: `age < STALE_MS` hides, so a stack
     that has just reached the limit is the first one to speak. */
  eq('exactly at the limit', rowAgeOf(mk({ countedAt: NOW - STALE_MS }), NOW), STALE_MS);
  eq('one ms short of it', rowAgeOf(mk({ countedAt: NOW - STALE_MS + 1 }), NOW), 'hidden');
}

console.log('\nsomebody who left the table has no age at all');
{
  eq('busted', rowAgeOf(mk({ out: true, countedAt: NOW - 90 * MIN }), NOW), 'hidden');
  eq('cashed out', rowAgeOf(mk({ cashOut: 25, countedAt: NOW - 90 * MIN }), NOW), 'hidden');
  /* Leaving outranks never being counted. The other way round the roster would ask
     to go and count a chair. */
  eq('busted and never counted', rowAgeOf(mk({ out: true }), NOW), 'hidden');
}

console.log('\na clock that ran backwards does not invent an age');
{
  // live sync can hand back a timestamp from a device a few seconds ahead
  eq('counted in the future', rowAgeOf(mk({ countedAt: NOW + 30_000 }), NOW), 'hidden');
}

console.log('\nthe table is as current as its stalest stack');
{
  const ledger = [
    mk({ countedAt: NOW - 5 * MIN }),
    mk({ countedAt: NOW - 70 * MIN }),
    mk({ countedAt: NOW - 20 * MIN }),
  ];
  eq('the oldest one wins', oldestCountedAt(ledger), NOW - 70 * MIN);
}

console.log('\nplayers who left do not lend the table their freshness');
{
  const ledger = [
    mk({ out: true, countedAt: NOW }),
    mk({ cashOut: 25, countedAt: NOW }),
    mk({ countedAt: NOW - 70 * MIN }),
  ];
  eq('only the ones in play count', oldestCountedAt(ledger), NOW - 70 * MIN);
  /* ...and an uncounted player who has already left must not drag the table to
     "never": they are not going to be counted now. */
  const withGoneUncounted = [mk({ out: true }), mk({ countedAt: NOW - 30 * MIN })];
  eq('a busted uncounted player is ignored', oldestCountedAt(withGoneUncounted), NOW - 30 * MIN);
}

console.log('\nnever counted outranks every timestamp');
{
  /* Without this a table with one uncounted player would report the others'
     freshness as its own — the exact overclaim this replaces. */
  const ledger = [mk({ countedAt: NOW - 2 * MIN }), mk(), mk({ countedAt: NOW - 9 * MIN })];
  eq('one uncounted player sinks the lot', oldestCountedAt(ledger), null);
}

console.log('\nnothing in play, nothing to report');
{
  eq('an empty ledger', oldestCountedAt([]), null);
  eq('everybody out', oldestCountedAt([mk({ out: true, countedAt: NOW }), mk({ cashOut: 5 })]), null);
}

console.log('\nminutes up to an hour, whole hours after that');
{
  const l = (ms: number) => `${ageLabel(ms).n}${ageLabel(ms).unit}`;
  eq('fifty-nine minutes', l(59 * MIN), '59min');
  eq('sixty minutes', l(60 * MIN), '1h');
  eq('sixty-one minutes', l(61 * MIN), '1h');
  eq('two hours', l(120 * MIN), '2h');
  eq('two hours and a half', l(150 * MIN), '2h');
  eq('nothing yet', l(0), '0min');
  // clamped, so a skewed clock cannot print "-3 min old"
  eq('a negative age', l(-5 * MIN), '0min');
}

console.log(`\n${failures === 0 ? 'countAge: all checks passed' : `countAge: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
