import { pushDelay, MIN_GAP_MS } from './pushPacing.ts';

/**
 * Pacing the pushes to the big screen.
 *
 * The rule the TV depends on: a change never waits for the burst to end. Dragging the
 * chip-mix slider has to move the stacks on the big screen while the finger is still
 * down, so changes go out spaced — not collapsed into one write at the end.
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

console.log('\nthe first change of a burst leaves at once');
{
  eq('nothing sent yet: go now', pushDelay(null, 10_000), 0);
  eq('and once the gap has passed: go now', pushDelay(10_000, 10_000 + MIN_GAP_MS), 0);
  eq('long idle, then a change: go now', pushDelay(10_000, 99_000), 0);
}

console.log('\nchanges inside the gap wait for it, they are not dropped');
{
  eq('a change right after a push waits a whole gap', pushDelay(10_000, 10_000), MIN_GAP_MS);
  eq('halfway through the gap, waits the rest', pushDelay(10_000, 10_000 + 200), MIN_GAP_MS - 200);
  eq('one tick short of the gap', pushDelay(10_000, 10_000 + MIN_GAP_MS - 1), 1);
}

console.log('\na drag becomes a trickle, not a flood or a single jump');
{
  // one second of dragging, a change every 16ms: how many writes does that cost?
  let last: number | null = null;
  let writes = 0;
  for (let t = 0; t <= 1000; t += 16) {
    if (pushDelay(last, t) === 0) {
      last = t;
      writes++;
    }
  }
  check('a second of dragging costs a handful of writes', writes >= 2 && writes <= 4, `${writes} writes`);
  check('and the screen is not left waiting for the drag to end', writes > 1);
}

console.log('\nthe clock going backwards cannot park a push in the future');
{
  const delay = pushDelay(50_000, 10_000); // device clock jumped back 40s
  check('never longer than one gap', delay <= MIN_GAP_MS, `${delay}ms`);
  check('and never negative', delay >= 0);
}

console.log(`\n${failures === 0 ? 'pushPacing: all checks passed' : `pushPacing: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
