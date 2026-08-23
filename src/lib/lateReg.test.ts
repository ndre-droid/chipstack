import { lateRegState } from './lateReg.ts';

/**
 * "Can I still buy in?" — asked every night, and the whole point is that the answer
 * on the wall is right without anybody doing arithmetic. The number it prints is
 * "minutes until the door shuts", which spans the rest of this level plus every
 * whole level still inside the window.
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

console.log('\nno window configured: the line does not appear at all');
{
  const s = lateRegState(0, 0, 600, 20);
  eq('not enabled', s.enabled, false);
  eq('nothing to say about being open', s.open, false);
  eq('and no countdown', s.minutesLeft, null);
  eq('a negative setting is the same as off', lateRegState(-3, 0, 600, 20).enabled, false);
}

console.log('\ninside the window: how long is left, in whole minutes');
{
  // level 1 of 3, 10:00 left → 10 + two more full 20s
  const s = lateRegState(3, 0, 600, 20);
  eq('enabled', s.enabled, true);
  eq('open', s.open, true);
  eq('this level plus the two after it', s.minutesLeft, 50);
  eq('not the last level yet', s.lastLevel, false);

  // level 2 of 3, 5:00 left → 5 + one more full 20
  eq('one level further in', lateRegState(3, 1, 300, 20).minutesLeft, 25);
  eq('part-minutes round UP, never down', lateRegState(1, 0, 61, 20).minutesLeft, 2);
  eq('a level about to end still reads as open', lateRegState(1, 0, 1, 20).open, true);
}

console.log('\nthe last level of the window says so');
{
  const s = lateRegState(3, 2, 300, 20);
  eq('open', s.open, true);
  eq('last chance', s.lastLevel, true);
  eq('only what is left of this level', s.minutesLeft, 5);
  eq('a one-level window is the last level immediately', lateRegState(1, 0, 600, 20).lastLevel, true);
}

console.log('\npast the window: closed, and it stays closed');
{
  const s = lateRegState(3, 3, 600, 20);
  eq('still enabled — the line reads "closed"', s.enabled, true);
  eq('closed', s.open, false);
  eq('no countdown to a door that has shut', s.minutesLeft, null);
  eq('not the last level either', s.lastLevel, false);
  eq('and much later is still just closed', lateRegState(3, 40, 600, 20).open, false);
}

console.log('\nnonsense inputs do not produce a nonsense number');
{
  eq('a zero-length level counts as one minute', lateRegState(3, 0, 0, 0).minutesLeft, 2);
  eq('a level already at zero is still this level', lateRegState(2, 0, 0, 20).minutesLeft, 20);
  check('the countdown is never negative', (lateRegState(5, 0, 600, 20).minutesLeft ?? 0) > 0);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
