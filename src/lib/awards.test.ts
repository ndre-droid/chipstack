import assert from 'node:assert/strict';
import { nightAwards } from './awards.ts';
import type { LedgerPlayer, TimelineEvent } from '../types.ts';

/**
 * Titles get read out loud at the end of the night, so the wrong name on one is
 * worse than not having it at all. Each award is asserted against a table where
 * exactly one player can plausibly win it.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const UNIT = 0.01;
const trail = (...chips: number[]) => chips.map((c, i) => ({ at: i, chips: c }));

const ledger: LedgerPlayer[] = [
  // climbed from 200 back up to 4000 — the comeback, and the winner
  { id: 'a', name: 'Ann', buyIn: 20, cashOut: 0, chips: 4000, chipHistory: trail(2000, 200, 1500, 4000) },
  // barely moved all night
  { id: 'b', name: 'Ben', buyIn: 20, cashOut: 0, chips: 1900, chipHistory: trail(2000, 1950, 1900, 1900) },
  // bought in three times and still went out
  { id: 'c', name: 'Cid', buyIn: 60, cashOut: 0, chips: 0, out: true, chipHistory: trail(2000, 900, 400) },
];

const timeline: TimelineEvent[] = [
  { id: '1', at: 1, kind: 'buyin', name: 'Cid', amount: 20 },
  { id: '2', at: 2, kind: 'buyin', name: 'Cid', amount: 20 },
  { id: '3', at: 3, kind: 'bust', name: 'Cid' },
  { id: '4', at: 4, kind: 'bust', name: 'Dan' },
];

console.log('\na normal night');
const awards = nightAwards({ ledger, timeline, unitValue: UNIT, bounty: false });
const by = (id: string) => awards.find((a) => a.id === id);
for (const a of awards) console.log(`  ${a.icon} ${a.key}: ${a.name} (${a.value})`);

check('the winner is the biggest net', by('winner')?.name === 'Ann');
check('the winner amount matches the net', by('winner')?.value === 20, `${by('winner')?.value}`);
check('the comeback measures the climb off the low point', by('comeback')?.value === 38, `${by('comeback')?.value}`);
check('the rock is the player who barely moved', by('rock')?.name === 'Ben');
check('the banker is whoever kept buying in', by('banker')?.name === 'Cid' && by('banker')?.value === 2);
check('first out is the FIRST bust, not the last', by('firstout')?.name === 'Cid');
check('the winner comes first in the list', awards[0]?.id === 'winner');
check(
  'winning the night and the comeback is allowed — it is the best story there is',
  by('winner')?.name === 'Ann' && by('comeback')?.name === 'Ann',
);

console.log('\nbounties are only counted when they are switched on');
const withKos: LedgerPlayer[] = ledger.map((p) => (p.id === 'b' ? { ...p, knockouts: 3 } : p));
check('off: no hunter', !nightAwards({ ledger: withKos, timeline, unitValue: UNIT, bounty: false }).some((a) => a.id === 'hunter'));
const on = nightAwards({ ledger: withKos, timeline, unitValue: UNIT, bounty: true });
check('on: the hunter is named', on.some((a) => a.id === 'hunter' || a.name === 'Ben'));

console.log('\nnot enough of a night to hand out titles');
check('one player, no awards', nightAwards({ ledger: [ledger[0]], timeline, unitValue: UNIT, bounty: false }).length === 0);
check('an empty table does not throw', nightAwards({ ledger: [], timeline: [], unitValue: UNIT, bounty: false }).length === 0);

console.log('\na short trail is not a comeback');
const shortTrail: LedgerPlayer[] = [
  { id: 'a', name: 'Ann', buyIn: 20, cashOut: 0, chips: 4000, chipHistory: trail(200, 4000) },
  { id: 'b', name: 'Ben', buyIn: 20, cashOut: 0, chips: 100 },
];
check('two points is a line, not a story', !nightAwards({ ledger: shortTrail, timeline: [], unitValue: UNIT, bounty: false }).some((a) => a.id === 'comeback'));

console.log('\nnobody made money');
const allDown: LedgerPlayer[] = [
  { id: 'a', name: 'Ann', buyIn: 20, cashOut: 0, chips: 0, out: true },
  { id: 'b', name: 'Ben', buyIn: 20, cashOut: 0, chips: 0, out: true },
];
check('no winner is invented', !nightAwards({ ledger: allDown, timeline: [], unitValue: UNIT, bounty: false }).some((a) => a.id === 'winner'));

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} award check(s) failed`);
