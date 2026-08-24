import { spliceLeaving, COL_IN_MS, COL_OUT_MS, type Column } from './columnFlow.ts';

/**
 * Whole piles arriving and leaving the spread.
 *
 * Two things have to hold, and the first version of this got both wrong when the
 * chip-mix slider was dragged hard: a denomination must never be drawn twice, and a
 * pile on its way out must never be left on screen — not even if the timer that was
 * supposed to remove it is lost. Everything past its deadline is dropped at render
 * time, so the next frame cleans up whatever the clock missed.
 *
 * The third rule is cosmetic but matters: a pile keeps the slot it had while it folds
 * away, or it slides across the row on the way out.
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

const NOW = 10_000;
const col = (id: string, state: Column<string>['state'] = 'idle'): Column<string> => ({ id, item: id, state });
const ids = (list: Column<string>[]) => list.map((c) => c.id).join(',');
const ghost = (at: number, item = 'g', expires = NOW + 100) => ({ at, item, expires });
const ghosts = (entries: [string, ReturnType<typeof ghost>][]) => new Map(entries);

console.log('\nnothing leaving: the row is what it is');
{
  const live = [col('a'), col('b')];
  eq('same list back', ids(spliceLeaving(live, ghosts([]), NOW)), 'a,b');
  eq('and the same array', spliceLeaving(live, ghosts([]), NOW), live);
}

console.log('\na pile leaving keeps the slot it had');
{
  const live = [col('a'), col('c')];
  const out = spliceLeaving(live, ghosts([['b', ghost(1, 'b')]]), NOW);
  eq('back between its neighbours', ids(out), 'a,b,c');
  eq('still on its way out', out[1].state, 'out');
  eq('carrying the count it had', out[1].item, 'b');
}

console.log('\nthe ends of the row work too');
{
  eq('leaving from the front', ids(spliceLeaving([col('b')], ghosts([['a', ghost(0)]]), NOW)), 'a,b');
  eq('leaving from the back', ids(spliceLeaving([col('a')], ghosts([['b', ghost(1)]]), NOW)), 'a,b');
  eq('past the end lands at the end', ids(spliceLeaving([col('a')], ghosts([['z', ghost(9)]]), NOW)), 'a,z');
}

console.log('\ntwo going at once');
{
  const out = spliceLeaving(
    [col('a'), col('d')],
    ghosts([
      ['c', ghost(2, 'c')],
      ['b', ghost(1, 'b')],
    ]),
    NOW,
  );
  eq('both back in their own slots, in order', ids(out), 'a,b,c,d');
}

console.log('\nnothing stale survives a render');
{
  // the bug this exists to stop: a fast drag left folded-up columns on screen for good
  const stale = ghosts([['b', ghost(1, 'b', NOW - 1)]]);
  eq('a ghost past its deadline is not drawn', ids(spliceLeaving([col('a')], stale, NOW)), 'a');
  const mixed = ghosts([
    ['b', ghost(1, 'b', NOW - 1)],
    ['c', ghost(2, 'c', NOW + 100)],
  ]);
  eq('the expired one goes, the live one stays', ids(spliceLeaving([col('a')], mixed, NOW)), 'a,c');
}

console.log('\na denomination is never drawn twice');
{
  // it left, then came back before its fold-up finished
  const out = spliceLeaving([col('a'), col('b')], ghosts([['b', ghost(1, 'b')]]), NOW);
  eq('the live pile wins, no duplicate', ids(out), 'a,b');
  eq('and it is a live pile, not a departing one', out[1].state, 'idle');
}

console.log('\nquick enough to read as one movement');
{
  check('arriving is under a third of a second', COL_IN_MS <= 300, `${COL_IN_MS}ms`);
  check('leaving is quicker still', COL_OUT_MS < COL_IN_MS, `${COL_OUT_MS}ms`);
}

console.log(`\n${failures === 0 ? 'columnFlow: all checks passed' : `columnFlow: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
