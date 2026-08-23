import assert from 'node:assert/strict';
import { seasonStats, headToHead } from './leagueStats.ts';
import type { LeagueGame } from '../types.ts';

/**
 * Season statistics are bragging material, which means somebody WILL check them
 * against their own memory of the night. The counting has to be exactly right.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const night = (date: number, players: [string, number, number][]): LeagueGame => ({
  id: `g${date}`,
  date,
  mode: 'cash',
  currency: '€',
  players: players.map(([name, buyIn, cashOut]) => ({ name, buyIn, cashOut })),
});

// Three nights. Ann wins two, Ben wins one, Cid never wins.
const league: LeagueGame[] = [
  night(1, [['Ann', 20, 45], ['Ben', 20, 10], ['Cid', 20, 5]]),
  night(2, [['Ann', 20, 40], ['Ben', 20, 15], ['Cid', 20, 5]]),
  night(3, [['Ann', 20, 5], ['Ben', 20, 50], ['Cid', 20, 5]]),
];

console.log('\nseason totals');
const s = seasonStats(league);
const ann = s.players.find((p) => p.name === 'Ann')!;
const ben = s.players.find((p) => p.name === 'Ben')!;
const cid = s.players.find((p) => p.name === 'Cid')!;
check('every night is counted', s.nights === 3);
check('the pot adds up', s.totalPot === 180, `${s.totalPot}`);
check('nets are right', ann.net === 30 && ben.net === 15 && cid.net === -45, `${ann.net}/${ben.net}/${cid.net}`);
check('the table sums to zero', ann.net + ben.net + cid.net === 0);
check('nights played are counted', ann.nights === 3 && cid.nights === 3);
check('wins go to whoever finished top that night', ann.wins === 2 && ben.wins === 1 && cid.wins === 0);
check('the season winner is the biggest net', s.shark?.name === 'Ann');
check('the biggest loser is named', s.donor?.name === 'Cid');
check('ROI is net over what went in', Math.abs(ann.roi - 30 / 60) < 1e-9);
check('the average is per night', ann.average === 10);

console.log('\nbest and worst nights');
check('best night found', ann.best?.net === 25 && ann.best?.date === 1);
check('worst night found', ann.worst?.net === -15 && ann.worst?.date === 3);
check('the biggest single night in the season', s.biggestNight?.name === 'Ben' && s.biggestNight?.net === 30);

console.log('\nstreaks');
check('a run of winning nights', ann.streak === -1, `${ann.streak}`); // Ann lost the last one
check('the best winning run is remembered', ann.bestStreak === 2, `${ann.bestStreak}`);
check('a losing run reads negative', cid.streak === -3, `${cid.streak}`);

console.log('\nhead to head');
const h = headToHead(league, 'Ann', 'Ben');
check('only shared nights count', h.nights === 3);
check('who finished ahead', h.aAhead === 2 && h.bAhead === 1);
check('the swing is the difference in their totals', h.swing === 15, `${h.swing}`);
const none = headToHead(league, 'Ann', 'Nobody');
check('a player who never played shares no nights', none.nights === 0);

console.log('\nempty season');
const empty = seasonStats([]);
check('no players, no crash', empty.players.length === 0 && empty.nights === 0);
check('nobody is named the shark', empty.shark === null && empty.donor === null);

console.log('\nnames are matched case-insensitively');
const mixed = seasonStats([night(1, [['ann', 20, 30]]), night(2, [['Ann', 20, 10]])]);
check('one player, not two', mixed.players.length === 1 && mixed.players[0].nights === 2);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} league check(s) failed`);
