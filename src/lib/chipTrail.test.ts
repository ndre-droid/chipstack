import { pushTrail, TRAIL_MAX, type TrailPoint } from './chipTrail.ts';

/**
 * The stack trail behind the sparkline. The one property that matters: however long
 * the night runs, the trail still starts at the FIRST counting round — a graph that
 * silently becomes "the last dozen rounds" is the bug this replaces.
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

/** n rounds counted one minute apart, the stack rising by 100 each time */
function run(n: number, max = TRAIL_MAX): TrailPoint[] {
  let trail: TrailPoint[] = [];
  for (let i = 0; i < n; i++) trail = pushTrail(trail, { at: i * 60_000, chips: i * 100 }, max);
  return trail;
}

console.log('a short night keeps every point');
{
  const trail = run(5);
  eq('every round is there', trail.length, 5);
  eq('starts at the first round', trail[0].at, 0);
  eq('ends at the last', trail[4].chips, 400);
}

console.log('\na long night still reaches back to the first round');
{
  for (const n of [61, 100, 240, 1000]) {
    const trail = run(n);
    check(`${n} rounds: inside the cap`, trail.length <= TRAIL_MAX, `length ${trail.length}`);
    eq(`${n} rounds: still starts at round 1`, trail[0].at, 0);
    eq(`${n} rounds: still ends at the newest`, trail[trail.length - 1].chips, (n - 1) * 100);
  }
}

console.log('\nthinning never leaves too little to draw');
{
  const trail = run(1000);
  check('more than a line', trail.length > 2, `length ${trail.length}`);
  check('at least half the cap', trail.length >= TRAIL_MAX / 2, `length ${trail.length}`);
}

console.log('\npoints stay in time order and are never invented');
{
  const trail = run(300);
  check('ascending timestamps', trail.every((p, i) => i === 0 || p.at > trail[i - 1].at));
  check('every point is a real round', trail.every((p) => p.at % 60_000 === 0 && p.chips === (p.at / 60_000) * 100));
}

console.log('\nthe span covers the night even with a tiny cap');
{
  const trail = run(50, 4);
  eq('first round kept', trail[0].at, 0);
  eq('last round kept', trail[trail.length - 1].at, 49 * 60_000);
  check('cap respected', trail.length <= 4, `length ${trail.length}`);
}

console.log('\nan undefined trail starts one');
{
  const trail = pushTrail(undefined, { at: 1, chips: 7 });
  eq('one point', trail.length, 1);
  eq('the point given', trail[0].chips, 7);
}

console.log(`\n${failures === 0 ? 'chipTrail: all checks passed' : `chipTrail: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
