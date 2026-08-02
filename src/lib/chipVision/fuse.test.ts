import { tally, median, fuseStack, mergeAngles, flaggedStackIds, matchStacks, parseRead } from './fuse.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`FAIL ${label}: got ${g}, want ${w}`); }
  else console.log(`ok   ${label}`);
}

// tally: majority, ties toward smaller
eq('tally majority', tally([3, 4, 4]), { count: 4, agreement: 2 / 3 });
eq('tally tie -> smaller', tally([2, 3]), { count: 2, agreement: 0.5 });
eq('median odd', median([3, 1, 2]), 2);
eq('median even', median([1, 2, 3, 4]), 2.5);
eq('median empty', median([]), null);

// fuseStack parity with the current inline rules
eq('agree short -> 0.9', fuseStack({ seam: { count: 3, agreement: 1 }, geo: 3, dsp: null }), { count: 3, confidence: 0.9 });
eq('agree tall no dsp -> 0.9', fuseStack({ seam: { count: 9, agreement: 1 }, geo: 9, dsp: null }), { count: 9, confidence: 0.9 });
eq('agree tall dsp-backed -> 0.95', fuseStack({ seam: { count: 9, agreement: 1 }, geo: 9, dsp: { count: 9, strength: 0.5 } }), { count: 9, confidence: 0.95 });
eq('off-by-one confident -> seam 0.6', fuseStack({ seam: { count: 5, agreement: 0.9 }, geo: 6, dsp: null }), { count: 5, confidence: 0.6 });
eq('off-by-one dsp picks geo -> 0.6', fuseStack({ seam: { count: 5, agreement: 0.9 }, geo: 6, dsp: { count: 6, strength: 0.5 } }), { count: 6, confidence: 0.6 });
eq('geometry only -> 0.55', fuseStack({ seam: { count: 0, agreement: 0 }, geo: 7, dsp: null }), { count: 7, confidence: 0.55 });
eq('seam only no geo -> agreement', fuseStack({ seam: { count: 4, agreement: 0.8 }, geo: null, dsp: null }), { count: 4, confidence: 0.8 });
eq('seam only dsp-confirmed -> 0.9', fuseStack({ seam: { count: 4, agreement: 0.5 }, geo: null, dsp: { count: 4, strength: 0.5 } }), { count: 4, confidence: 0.9 });
eq('real disagree dsp abstain -> 0.5', fuseStack({ seam: { count: 3, agreement: 0.6 }, geo: 8, dsp: null }), { count: 8, confidence: 0.5 });
eq('no seam no geo -> 0,0', fuseStack({ seam: { count: 0, agreement: 0 }, geo: null, dsp: null }), { count: 0, confidence: 0 });
eq('off-by-one dsp backs seam -> 0.9', fuseStack({ seam: { count: 5, agreement: 0.9 }, geo: 6, dsp: { count: 5, strength: 0.5 } }), { count: 5, confidence: 0.9 });
eq('disagree dsp backs seam -> 0.75', fuseStack({ seam: { count: 3, agreement: 0.6 }, geo: 8, dsp: { count: 3, strength: 0.5 } }), { count: 3, confidence: 0.75 });
eq('disagree dsp backs geo -> 0.75', fuseStack({ seam: { count: 3, agreement: 0.6 }, geo: 8, dsp: { count: 8, strength: 0.5 } }), { count: 8, confidence: 0.75 });

// mergeAngles: a second, steeper angle that splits a merged seam wins the vote
eq('mergeAngles merged-seam win', tally(mergeAngles({ votes: [3, 3], ratios: [] }, { votes: [4, 4, 4], ratios: [] }).votes), { count: 4, agreement: 3 / 5 });
eq('mergeAngles concat ratios', mergeAngles({ votes: [], ratios: [0.3] }, { votes: [], ratios: [0.4, 0.5] }).ratios, [0.3, 0.4, 0.5]);

// flaggedStackIds: below threshold
eq('flagged below 0.85', flaggedStackIds([{ id: 'a', confidence: 0.9 }, { id: 'b', confidence: 0.5 }]), ['b']);

// matchStacks: same denom, nearest center
const fresh = matchStacks(
  [{ id: 's1', value: 25, box: [0.1, 0.1, 0.2, 0.5] }],
  [{ value: 100, box: [0.1, 0.1, 0.2, 0.5] }, { value: 25, box: [0.12, 0.12, 0.22, 0.52] }],
);
eq('matchStacks by denom+position', fresh.get('s1'), [0.12, 0.12, 0.22, 0.52]);

// parseRead: count + geometry ratio + extent
eq('parseRead full', parseRead({ count: 5, stackHeight: 0.4, chipDiameter: 0.2, extent: [0.1, 0.5] }),
  { count: 5, r: 2, extent: [0.1, 0.5] });
eq('parseRead no geometry', parseRead({ count: 3 }), { count: 3, r: null, extent: null });
eq('parseRead bad count', parseRead({ count: -1 }), null);
// diameter clears the d>0.01 floor, so the ratio IS computed (10) and then rejected by the 0.03..4 clamp.
eq('parseRead clamps insane ratio', parseRead({ count: 2, stackHeight: 5, chipDiameter: 0.5 }).r, null);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
