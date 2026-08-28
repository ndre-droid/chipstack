import {
  advance,
  glideDistance,
  nextSpan,
  roundCounts,
  sameCounts,
  GLIDE_LEAD,
  GLIDE_MAX_LAG,
  GLIDE_MAX_SPAN_MS,
  GLIDE_MIN_SPAN_MS,
  GLIDE_START_SPAN_MS,
} from './countGlide.ts';

/**
 * The big screen following the phone's chip-mix slider.
 *
 * The rules that make it read as smooth rather than laggy: play the change back at
 * the pace it arrives at, at a constant speed, never past the number the phone sent,
 * still moving when the next spread lands, and leaving departing denominations to
 * the column flow instead of grinding them down to zero.
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

const show = (m: Record<string, number>) =>
  Object.keys(m)
    .sort()
    .map((k) => `${k}=${m[k]}`)
    .join(',');

/**
 * Play one change all the way through the way the hook does: frames of `dt` ms until
 * the deadline, advancing the fractional spread and rounding it for the screen.
 * Returns the drawn spread after every frame that changed it.
 */
function play(
  from: Record<string, number>,
  to: Record<string, number>,
  span: number,
  dt = 16.7,
): { frames: { at: number; counts: Record<string, number> }[]; final: Record<string, number> } {
  let pos = { ...from };
  let drawn = roundCounts(pos);
  const frames: { at: number; counts: Record<string, number> }[] = [];
  let left = span;
  let at = 0;
  // one frame past the deadline, which is where the last chips land
  for (let guard = 0; guard < 400 && left > -dt; guard++) {
    pos = advance(pos, to, dt, left);
    left -= dt;
    at += dt;
    const next = roundCounts(pos);
    if (!sameCounts(next, drawn)) frames.push({ at, counts: next });
    drawn = next;
  }
  return { frames, final: drawn };
}

console.log('\nnothing to do');
{
  const a = { x: 4, y: 2 };
  eq('distance is zero', glideDistance(a, { x: 4, y: 2 }), 0);
  eq('an unchanged spread does not move', show(advance(a, { x: 4, y: 2 }, 16, 500)), 'x=4,y=2');
  check('the same spread is recognised', sameCounts(a, { y: 2, x: 4 }));
  check('a taller pile is not', !sameCounts(a, { x: 5, y: 2 }));
  check('a different set of piles is not', !sameCounts(a, { x: 4, y: 2, z: 0 }));
}

console.log('\nthe pace is measured, not assumed');
{
  check('a slower link stretches the span', nextSpan(GLIDE_START_SPAN_MS, 1200) > GLIDE_START_SPAN_MS);
  check('…but not all the way in one reading', nextSpan(GLIDE_START_SPAN_MS, 1200) < 1200);
  eq('a freak gap cannot stall the pile', nextSpan(GLIDE_MAX_SPAN_MS, 60_000), GLIDE_MAX_SPAN_MS);
  eq('and a burst cannot make it a blur', nextSpan(GLIDE_MIN_SPAN_MS, 0), GLIDE_MIN_SPAN_MS);
  check('the average settles on a steady pace', Math.abs(nextSpan(nextSpan(nextSpan(700, 900), 900), 900) - 900) < 90);
}

console.log('\none change, played back at a constant speed');
{
  const span = 700;
  const { frames, final } = play({ x: 0 }, { x: 24 }, span);
  eq('it lands exactly', final.x, 24);
  check('and arrives a chip at a time', frames.length >= 20, `${frames.length} steps`);
  check('never overshooting', frames.every((f) => f.counts.x <= 24));
  check('and never going backwards', frames.every((f, i) => i === 0 || f.counts.x >= frames[i - 1].counts.x));
  /* The gaps between two chips LANDING are even — that is what constant speed means,
     and it is the whole difference between a pile being fed and a pile lurching. A
     chip can only land on a frame boundary, so one frame of slack is the floor. */
  const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
  const ideal = span / 24;
  check(
    `at an even rate (~${ideal.toFixed(0)}ms a chip)`,
    Math.max(...gaps) - Math.min(...gaps) <= 16.8 && Math.max(...gaps) <= ideal + 16.8,
    `gaps ${gaps.map((g) => g.toFixed(0)).join(',')}`,
  );
}

console.log('\nit is still moving when the next spread arrives');
{
  // A change is given slightly longer than the measured gap on purpose, so the pile
  // never stands still between two pushes.
  const span = 700 * GLIDE_LEAD;
  const { final } = play({ x: 0 }, { x: 20 }, span, 700 / 40);
  check('the lead is real', GLIDE_LEAD > 1);
  eq('and it still lands when the drag stops', final.x, 20);
  // interrupted after one measured gap: it is part-way there, not finished
  let pos: Record<string, number> = { x: 0 };
  let left = span;
  for (let t = 0; t < 700; t += 16.7) {
    pos = advance(pos, { x: 20 }, 16.7, left);
    left -= 16.7;
  }
  check('mid-drag it is still on its way', pos.x > 14 && pos.x < 20, `at ${pos.x.toFixed(1)}`);
}

console.log('\na late frame moves the pile by exactly what it earned');
{
  // The old timer fired in a burst after a busy moment and dumped several chips into
  // one frame. Elapsed time decides the stride, so a 100ms frame is one 100ms move.
  const one = advance({ x: 0 }, { x: 30 }, 100, 700);
  check('a 100ms frame is worth 100ms of movement', Math.abs(one.x - 30 * (100 / 700)) < 0.01, `moved ${one.x}`);
  const stalled = advance({ x: 10 }, { x: 30 }, 800, 700);
  eq('a frame past the deadline lands the lot', stalled.x, 30);
}

console.log('\nevery pile moves together');
{
  const { final } = play({ a: 10, b: 2, c: 7 }, { a: 8, b: 5, c: 7 }, 700);
  eq('the ones that changed arrived, the one that did not held', show(final), 'a=8,b=5,c=7');
  const mid = advance({ a: 10, b: 2, c: 7 }, { a: 8, b: 5, c: 7 }, 350, 700);
  eq('and they are halfway together', show(roundCounts(mid)), 'a=9,b=4,c=7');
}

console.log('\na new denomination builds from nothing');
{
  const next = advance({ a: 4 }, { a: 4, b: 6 }, 100, 700);
  check('it starts arriving rather than appearing whole', next.b > 0 && next.b < 6, `b=${next.b}`);
  const { final } = play({ a: 4 }, { a: 4, b: 6 }, 700);
  eq('and gets there', show(final), 'a=4,b=6');
}

console.log('\na departing denomination is left to the column flow');
{
  const next = advance({ a: 4, b: 6 }, { a: 4 }, 100, 700);
  eq('it is dropped, not ground down to zero', show(next), 'a=4');
}

console.log('\ndistance is what decides when to give up and jump');
{
  eq('sums every pile', glideDistance({ a: 10, b: 0 }, { a: 4, b: 3 }), 9);
  check('a whole fresh spread is past the limit', glideDistance({}, { a: 40, b: 40, c: 40 }) > GLIDE_MAX_LAG);
  check('a hard drag of the slider is not', glideDistance({ a: 12, b: 9 }, { a: 20, b: 4 }) <= GLIDE_MAX_LAG);
}

console.log(`\n${failures === 0 ? 'countGlide: all checks passed' : `countGlide: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
