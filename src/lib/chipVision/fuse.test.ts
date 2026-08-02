import { tally, median, flaggedStackIds, parseRead } from './fuse.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`FAIL ${label}: got ${g}, want ${w}`); }
  else console.log(`ok   ${label}`);
}

// tally: majority, ties toward smaller
eq('tally majority', tally([3, 4, 4]), { count: 4, agreement: 2 / 3 });
eq('tally unanimous', tally([6, 6, 6]), { count: 6, agreement: 1 });
eq('tally split -> smaller, low agreement', tally([6, 7, 8]), { count: 6, agreement: 1 / 3 });
eq('tally tie -> smaller', tally([2, 3]), { count: 2, agreement: 0.5 });
eq('median odd', median([3, 1, 2]), 2);
eq('median even', median([1, 2, 3, 4]), 2.5);
eq('median empty', median([]), null);

// flaggedStackIds: below 0.6 = genuine split; a 2/3 majority stays clean
eq('flagged only genuine split', flaggedStackIds([
  { id: 'unanimous', confidence: 1 },
  { id: 'majority', confidence: 2 / 3 },
  { id: 'split', confidence: 1 / 3 },
]), ['split']);

// parseRead: count + extent (geometry ratio dropped)
eq('parseRead full', parseRead({ count: 5, extent: [0.1, 0.5] }), { count: 5, extent: [0.1, 0.5] });
eq('parseRead no extent', parseRead({ count: 3 }), { count: 3, extent: null });
eq('parseRead rounds count', parseRead({ count: 4.4, extent: [0.2, 0.8] }), { count: 4, extent: [0.2, 0.8] });
eq('parseRead bad count', parseRead({ count: -1 }), null);
eq('parseRead rejects inverted extent', parseRead({ count: 2, extent: [0.8, 0.2] }).extent, null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
