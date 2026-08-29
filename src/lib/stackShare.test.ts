import assert from 'node:assert/strict';
import { rebalance, shareStep } from './stackShare.ts';

/**
 * The whole point of the slider round is that the table cannot stop adding up. So
 * the property under test is conservation: whatever the finger does, and in whatever
 * order, the rows sum to exactly the money on the table.
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
/** whole units cannot always split evenly — "even" means within one unit */
const even = (...v: number[]) => Math.max(...v) - Math.min(...v) <= 1;
const ORDER = ['a', 'b', 'c', 'd'];
const TOTAL = 34000; // €340 at the default unit value

console.log('\nopening a round on stacks that no longer add up');
const opened = rebalance({ a: 9000, b: 9000, c: 9000, d: 9000 }, ORDER, new Set(), TOTAL);
check('the pot is hit exactly', sum(opened) === TOTAL, String(sum(opened)));
check('an even table stays even', new Set(Object.values(opened)).size === 1);

console.log('\ndragging one bar up');
const dragged = rebalance({ ...opened, a: 17000 }, ORDER, new Set(), TOTAL, 'a');
check('the driver gets what it asked for', dragged.a === 17000);
check('the pot is still exact', sum(dragged) === TOTAL, String(sum(dragged)));
check('the others gave way evenly', even(dragged.b, dragged.c, dragged.d));

console.log('\na pinned row does not pay for someone else’s drag');
const pins = new Set(['b']);
const withPin = rebalance({ ...dragged, a: 20000 }, ORDER, pins, TOTAL, 'a');
check('the pinned row is untouched', withPin.b === dragged.b, `${withPin.b} vs ${dragged.b}`);
check('the pot is still exact', sum(withPin) === TOTAL, String(sum(withPin)));
check('only the unpinned rows moved', even(withPin.c, withPin.d) && withPin.c < dragged.c);

console.log('\ndragging past what the unpinned rows can give up');
const capped = rebalance({ a: TOTAL * 2, b: 5000, c: 9000 }, ['a', 'b', 'c'], new Set(['b']), TOTAL, 'a');
check('the driver takes everything the free rows had', capped.a === TOTAL - 5000, String(capped.a));
check('the free row is emptied, not driven negative', capped.c === 0);
check('the pinned row still holds', capped.b === 5000);
const tooMuch = rebalance({ ...capped, a: TOTAL * 2 }, ['a', 'b', 'c'], new Set(['b']), TOTAL, 'a');
check('asking for more than the table changes nothing', tooMuch.a === TOTAL - 5000, String(tooMuch.a));
check('the pot is still exact', sum(tooMuch) === TOTAL, String(sum(tooMuch)));

console.log('\nevery other row pinned — the pins yield, the total does not');
const allPinned = rebalance({ a: 1000, b: 11000, c: 11000, d: 11000 }, ORDER, new Set(ORDER), TOTAL, 'a');
check('the driver gets exactly what it asked for', allPinned.a === 1000, String(allPinned.a));
check('the pot is still exact', sum(allPinned) === TOTAL, String(sum(allPinned)));
check('the pins gave way together', even(allPinned.b, allPinned.c, allPinned.d));
const toTheEnd = rebalance({ a: TOTAL * 2, b: 1, c: 1, d: 1 }, ORDER, new Set(ORDER), TOTAL, 'a');
check('dragging to the end leaves the others on nothing', toTheEnd.a === TOTAL && toTheEnd.b === 0);

console.log('\npins that claim more than the table holds are dropped, not honoured');
const overPinned = rebalance({ a: 0, b: 30000, c: 30000, d: 0 }, ORDER, new Set(['b', 'c']), TOTAL, 'a');
check('the pot is still exact', sum(overPinned) === TOTAL, String(sum(overPinned)));
check('nobody is negative', Object.values(overPinned).every((v) => v >= 0));

console.log('\nheads-up down to one player');
const alone = rebalance({ a: 500 }, ['a'], new Set(), TOTAL, 'a');
check('the last stack is the whole table', alone.a === TOTAL);

console.log('\nan odd pot that does not divide');
const odd = rebalance({ a: 0, b: 0, c: 0 }, ['a', 'b', 'c'], new Set(), 10);
check('the remainder is handed out, not lost', sum(odd) === 10, JSON.stringify(odd));
check('the split is as even as whole units allow', Math.max(...Object.values(odd)) - Math.min(...Object.values(odd)) <= 1);

console.log('\na dead table');
const empty = rebalance({ a: 100, b: 100 }, ['a', 'b'], new Set(), 0);
check('nothing to split means nothing held', sum(empty) === 0);
check('no rows means no result', Object.keys(rebalance({}, [], new Set(), TOTAL)).length === 0);

console.log('\n200 random drags in a row');
let live = rebalance({ a: 0, b: 0, c: 0, d: 0 }, ORDER, new Set(), TOTAL);
const held = new Set<string>();
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 200; i++) {
  const id = ORDER[Math.floor(rnd() * ORDER.length)];
  if (rnd() < 0.15 && !held.delete(id)) held.add(id);
  live = rebalance({ ...live, [id]: Math.round(rnd() * TOTAL * 1.3) }, ORDER, held, TOTAL, id);
  held.add(id);
  if (sum(live) !== TOTAL || Object.values(live).some((v) => v < 0)) {
    check(`drag ${i} kept the table whole`, false, JSON.stringify(live));
    break;
  }
}
check('the table never drifted and never went negative', sum(live) === TOTAL, String(sum(live)));

console.log('\nthe split lands on whole drag steps');
const STEP = 500; // €5
const stepped = rebalance({ a: 2000, b: 3400, c: 900, d: 2000 }, ORDER, new Set(), TOTAL, undefined, STEP);
check('the pot is still exact', sum(stepped) === TOTAL, String(sum(stepped)));
check('at most one row is off the grid', Object.values(stepped).filter((v) => v % STEP !== 0).length <= 1);
const steppedDrag = rebalance({ ...stepped, a: 15000 }, ORDER, new Set(), TOTAL, 'a', STEP);
check('the dragged row keeps exactly what it asked for', steppedDrag.a === 15000);
check('the pot is still exact', sum(steppedDrag) === TOTAL, String(sum(steppedDrag)));
check(
  'the rows that gave way stay on round money',
  Object.entries(steppedDrag).filter(([id, v]) => id !== 'a' && v % STEP !== 0).length <= 1,
  JSON.stringify(steppedDrag),
);
const tinyRest = rebalance({ a: TOTAL - 300, b: 0, c: 0, d: 0 }, ORDER, new Set(), TOTAL, 'a', STEP);
check('a remainder smaller than one step is not lost', sum(tinyRest) === TOTAL, String(sum(tinyRest)));

console.log('\nthe drag step');
check('€340 drags in €5 steps', shareStep(34000, 0.01) === 500, String(shareStep(34000, 0.01)));
check('a €60 table drags in 50c steps', shareStep(6000, 0.01) === 50, String(shareStep(6000, 0.01)));
check('a big table stays on round numbers', shareStep(500000, 0.01) === 5000, String(shareStep(500000, 0.01)));
check('an empty table still has a usable step', shareStep(0, 0.01) === 1);
check('whole-euro units never step by less than one', shareStep(340, 1) >= 1);

console.log(failures === 0 ? '\nAll stack-share checks passed.' : `\n${failures} check(s) FAILED.`);
assert.equal(failures, 0);
