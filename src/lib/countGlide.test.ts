import { glideStep, glideDistance, GLIDE_STEPS, GLIDE_STEP_MS, GLIDE_MAX_LAG } from './countGlide.ts';

/**
 * The big screen following the phone's chip-mix slider.
 *
 * The rules that make it read as smooth rather than laggy: never stand still while
 * there is a difference left, never move a pile past the number the phone sent,
 * settle inside the gap between two pushes, and leave departing denominations to the
 * column flow instead of grinding them down to zero.
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

/** Walk all the way there the way the hook does, and say how many steps it took. */
function settle(from: Record<string, number>, to: Record<string, number>, cap = 200) {
  let at = from;
  let steps = 0;
  let budget = GLIDE_STEPS;
  while (steps < cap) {
    const next = glideStep(at, to, budget);
    budget = Math.max(1, budget - 1);
    if (next === at) break;
    at = next;
    steps++;
  }
  return { at, steps };
}

console.log('\nnothing to do');
{
  const a = { x: 4, y: 2 };
  eq('the same object back', glideStep(a, { x: 4, y: 2 }), a);
  eq('distance is zero', glideDistance(a, { x: 4, y: 2 }), 0);
}

console.log('\none chip at a time for a small change');
{
  eq('grows by one', show(glideStep({ x: 4 }, { x: 5 })), 'x=5');
  eq('shrinks by one', show(glideStep({ x: 4 }, { x: 3 })), 'x=3');
  eq('never overshoots', show(glideStep({ x: 4 }, { x: 6 })), 'x=5');
}

console.log('\na big lump is spread out, not dumped');
{
  const one = glideStep({ x: 0 }, { x: 24 });
  check('a 24-chip jump moves a fraction of it', one.x > 0 && one.x < 24, `moved to ${one.x}`);
  eq('and no faster than the spread allows', one.x, Math.ceil(24 / GLIDE_STEPS));
}

console.log('\nit always arrives, and inside the gap between two pushes');
{
  for (const [from, to] of [
    [0, 1],
    [3, 11],
    [11, 3],
    [0, 40],
    [40, 0],
    [7, GLIDE_MAX_LAG],
  ] as const) {
    const { at, steps } = settle({ x: from }, { x: to });
    eq(`${from} → ${to} lands exactly`, at.x, to);
    check(
      `${from} → ${to} settles in ${steps * GLIDE_STEP_MS}ms`,
      steps <= GLIDE_STEPS && steps * GLIDE_STEP_MS < 700,
      `${steps} steps`,
    );
  }
}

console.log('\nevery pile moves together');
{
  const next = glideStep({ a: 10, b: 2, c: 7 }, { a: 8, b: 5, c: 7 });
  eq('the ones that changed moved, the one that did not held', show(next), 'a=9,b=3,c=7');
}

console.log('\na new denomination builds from nothing');
{
  const next = glideStep({ a: 4 }, { a: 4, b: 6 });
  check('it starts arriving rather than appearing whole', next.b > 0 && next.b < 6, `b=${next.b}`);
  const { at } = settle({ a: 4 }, { a: 4, b: 6 });
  eq('and gets there', show(at), 'a=4,b=6');
}

console.log('\na departing denomination is left to the column flow');
{
  const next = glideStep({ a: 4, b: 6 }, { a: 4 });
  eq('it is dropped, not ground down to zero', show(next), 'a=4');
  check('and that counts as a change', next !== ({ a: 4, b: 6 } as Record<string, number>));
}

console.log('\ndistance is what decides when to give up and jump');
{
  eq('sums every pile', glideDistance({ a: 10, b: 0 }, { a: 4, b: 3 }), 9);
  check('a whole fresh spread is past the limit', glideDistance({}, { a: 40, b: 40, c: 40 }) > GLIDE_MAX_LAG);
  check('a hard drag of the slider is not', glideDistance({ a: 12, b: 9 }, { a: 20, b: 4 }) <= GLIDE_MAX_LAG);
}

console.log(`\n${failures === 0 ? 'countGlide: all checks passed' : `countGlide: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
