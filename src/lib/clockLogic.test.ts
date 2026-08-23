import {
  cancelBreak,
  goLevel,
  initialClock,
  resetPeriod,
  secondsLeft,
  setMinutesPerLevel,
  startBreak,
  togglePlayPause,
  type ClockState,
} from './clockLogic.ts';

/**
 * The clock is the one thing at a live table nobody can eyeball as wrong — a level
 * that is quietly 40 seconds short just puts the blinds up early and everybody
 * blames the cards. These are pure state transitions, so they can be checked
 * exactly, which is the whole reason the logic was pulled out of the screens.
 *
 * `Date.now` is stubbed throughout: a deadline-based clock that is tested against
 * the wall clock is a test that fails on a slow machine.
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

/** The fake wall clock every case below runs against. */
let NOW = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;
/** move the fake clock forward */
const advance = (seconds: number) => {
  NOW += seconds * 1000;
};

console.log('\na fresh clock is paused with a full level in front of it');
{
  const c = initialClock(20);
  eq('level 1', c.levelIdx, 0);
  eq('not running', c.running, false);
  eq('no deadline while paused', c.periodEndsAt, null);
  eq('a full 20 minutes', secondsLeft(c), 1200);
}

console.log('\nrunning: the deadline is the truth, not a counted-down number');
{
  let c = togglePlayPause(initialClock(20));
  eq('running', c.running, true);
  eq('still 20:00 at the moment of the tap', secondsLeft(c), 1200);
  advance(75);
  eq('75s later, 18:45 — derived, not ticked', secondsLeft(c), 1125);
  /* The case a ticking counter gets wrong: the tab was frozen for half an hour. A
     deadline says the level is over; a counter would still be at 18:45. */
  advance(1800);
  eq('after a long freeze it is over, not merely behind', secondsLeft(c), 0);
  eq('never negative', secondsLeft({ ...c, periodEndsAt: NOW - 999_000 }), 0);
  c = togglePlayPause(c);
  eq('pausing an expired level freezes it at zero', c.remaining, 0);
}

console.log('\npause freezes what is left; resume turns it back into a deadline');
{
  let c = togglePlayPause(initialClock(20));
  advance(300);
  c = togglePlayPause(c); // pause at 15:00
  eq('paused', c.running, false);
  eq('frozen at 15:00', secondsLeft(c), 900);
  advance(3600); // an hour of standing around
  eq('a paused clock does not run down', secondsLeft(c), 900);
  c = togglePlayPause(c);
  eq('resumes from 15:00', secondsLeft(c), 900);
  advance(60);
  eq('and runs again', secondsLeft(c), 840);
}

console.log('\nchanging the level length ADJUSTS this level, it does not restart it');
{
  let c = togglePlayPause(initialClock(20));
  advance(948); // 4:12 left
  eq('4:12 on the clock', secondsLeft(c), 252);
  c = setMinutesPerLevel(c, 21);
  eq('+1 means one more minute, not a fresh 21:00', secondsLeft(c), 312);
  eq('and the new length applies from here on', c.minutesPerLevel, 21);
  eq('still running', c.running, true);

  // the old behaviour, for the record: this used to read 1260
  check('a single +1 tap no longer throws the level away', secondsLeft(c) !== 21 * 60);

  c = setMinutesPerLevel(c, 11); // −10 with 5:12 left
  eq('shortening past what is left floors at 10s', secondsLeft(c), 10);
  eq('the length itself still takes', c.minutesPerLevel, 11);
  check('it does not run to zero and put the blinds up', secondsLeft(c) > 0);
}

console.log('\n...and the same while paused, and never for a break');
{
  let c = setMinutesPerLevel(initialClock(20), 30);
  eq('a level that has not started takes the whole new length', secondsLeft(c), 1800);
  eq('no deadline is invented while paused', c.periodEndsAt, null);

  c = startBreak(initialClock(20), 5);
  const before = secondsLeft(c);
  c = setMinutesPerLevel(c, 45);
  eq('a break keeps its own length', secondsLeft(c), before);
  eq('but the level length is remembered for afterwards', c.minutesPerLevel, 45);

  const same = initialClock(20);
  check('asking for the length it already has is a no-op', setMinutesPerLevel(same, 20) === same);
  eq('and the range is clamped', setMinutesPerLevel(initialClock(20), 9999).minutesPerLevel, 180);
  eq('at both ends', setMinutesPerLevel(initialClock(20), 0).minutesPerLevel, 1);
}

console.log('\nreset puts the period back to full — which is now its own button');
{
  let c = togglePlayPause(initialClock(20));
  advance(948);
  eq('4:12 left', secondsLeft(c), 252);
  c = resetPeriod(c);
  eq('back to 20:00', secondsLeft(c), 1200);
  eq('and still running', c.running, true);

  const paused = resetPeriod({ ...initialClock(20), remaining: 30 });
  eq('a paused reset stays paused', paused.periodEndsAt, null);
  eq('with the full length frozen', secondsLeft(paused), 1200);

  const onBreak = startBreak(initialClock(20), 5);
  advance(200);
  check('a break is left alone when no break length is given', resetPeriod(onBreak) === onBreak);
  eq('and restored when one is', secondsLeft(resetPeriod(onBreak, 5)), 300);
}

console.log('\nmoving between levels');
{
  let c = togglePlayPause(initialClock(20));
  advance(600);
  c = goLevel(c, 1, 4);
  eq('level 2', c.levelIdx, 1);
  eq('starts full', secondsLeft(c), 1200);
  eq('and keeps running', c.running, true);
  eq('clamped at the top', goLevel(c, 99, 4).levelIdx, 4);
  eq('and at the bottom', goLevel(c, -99, 4).levelIdx, 0);

  const paused = goLevel(initialClock(20), 1, 4);
  eq('a paused clock does not start itself by changing level', paused.periodEndsAt, null);

  const fromBreak = goLevel(startBreak(initialClock(20), 5), 1, 4);
  eq('changing level ends a break', fromBreak.onBreak, false);
}

console.log('\nbreaks');
{
  const c = startBreak(initialClock(20), 5);
  eq('on break', c.onBreak, true);
  eq('a break always runs', c.running, true);
  eq('5 minutes', secondsLeft(c), 300);
  eq('a zero-length break is still a break', secondsLeft(startBreak(initialClock(20), 0)), 60);

  advance(100);
  const back = cancelBreak(c);
  eq('cancelling returns to the level', back.onBreak, false);
  eq('at its full length', secondsLeft(back), 1200);
  eq('still running, because the break was', back.running, true);

  const pausedBreak: ClockState = { ...c, running: false, periodEndsAt: null };
  eq('cancelling a paused break does not start the clock', cancelBreak(pausedBreak).periodEndsAt, null);
}

Date.now = realNow;

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
