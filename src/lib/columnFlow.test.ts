import { spliceLeaving, COL_IN_MS, COL_OUT_MS, type Column } from './columnFlow.ts';

/**
 * Whole piles arriving and leaving the spread.
 *
 * The thing that has to hold: a pile on its way out keeps the slot it had. Put it back
 * anywhere else and it slides across the row on its way out, which reads as a chip
 * being moved rather than a denomination being dropped.
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

const col = (id: string, state: Column<string>['state'] = 'idle'): Column<string> => ({ id, item: id, state });
const ids = (list: Column<string>[]) => list.map((c) => c.id).join(',');

console.log('\nnothing leaving: the row is what it is');
{
  const live = [col('a'), col('b')];
  eq('same list back', ids(spliceLeaving(live, [])), 'a,b');
  eq('and the same array', spliceLeaving(live, []), live);
}

console.log('\na pile leaving keeps the slot it had');
{
  const live = [col('a'), col('c')];
  const out = spliceLeaving(live, [{ at: 1, column: col('b', 'out') }]);
  eq('back between its neighbours', ids(out), 'a,b,c');
  eq('still on its way out', out[1].state, 'out');
  eq('carrying the data it had', out[1].item, 'b');
}

console.log('\nthe ends of the row work too');
{
  eq('leaving from the front', ids(spliceLeaving([col('b')], [{ at: 0, column: col('a', 'out') }])), 'a,b');
  eq('leaving from the back', ids(spliceLeaving([col('a')], [{ at: 1, column: col('b', 'out') }])), 'a,b');
  eq('past the end lands at the end', ids(spliceLeaving([col('a')], [{ at: 9, column: col('z', 'out') }])), 'a,z');
}

console.log('\ntwo going at once');
{
  const out = spliceLeaving(
    [col('a'), col('d')],
    [
      { at: 2, column: col('c', 'out') },
      { at: 1, column: col('b', 'out') },
    ],
  );
  eq('both back in their own slots, in order', ids(out), 'a,b,c,d');
}

console.log('\nthe whole row emptying');
{
  const out = spliceLeaving([], [{ at: 0, column: col('a', 'out') }]);
  eq('the last pile still gets to fold away', ids(out), 'a');
}

console.log('\nquick enough to read as one movement');
{
  check('arriving is under a third of a second', COL_IN_MS <= 300, `${COL_IN_MS}ms`);
  check('leaving is quicker still', COL_OUT_MS < COL_IN_MS, `${COL_OUT_MS}ms`);
}

console.log(`\n${failures === 0 ? 'columnFlow: all checks passed' : `columnFlow: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
