import assert from 'node:assert/strict';
import { suggestBlindLadder, colorUpEvents, ladderForDuration } from './planning.ts';
import { computeStack, moneyToUnits } from './distribution.ts';
import type { Denomination } from '../types.ts';

const set = (value: number, count: number): Denomination => ({
  id: String(value),
  value,
  color: '#888',
  accent: '#fff',
  count,
  enabled: true,
});

const denoms: Denomination[] = [
  set(1, 100), set(5, 100), set(10, 100), set(25, 100), set(50, 80),
  set(100, 100), set(500, 50), set(1000, 40),
];

function showLadder(label: string, buyin: number) {
  const units = moneyToUnits(buyin, 0.01);
  const ladder = suggestBlindLadder(denoms, units);
  console.log(`\n${label} (buy-in €${buyin} = ${units} pts): ` + ladder.map((l) => `${l.smallBlind}/${l.bigBlind}`).join('  '));
  return ladder;
}

showLadder('Ladder', 20);
showLadder('Ladder', 5);
showLadder('Ladder', 50);

// Colour-up walk for the €20 ladder
console.log('\n== Colour-up guide (€20, 5 players, start level 1) ==');
const units = moneyToUnits(20, 0.01);
const ladder = suggestBlindLadder(denoms, units);
const start = computeStack(units, denoms, { smallBias: 0.6, blind: ladder[0], stacksNeeded: 5 });
console.log('start stack: ' + start.denomsUsed.map((d) => `${start.counts[d.id]}×${d.value}`).join('  '));
const events = colorUpEvents(start.counts, denoms, ladder, 0, 5);
for (const e of events) {
  console.log(`\nLevel ${e.levelIndex + 1} — blinds ${e.blind.smallBlind}/${e.blind.bigBlind}:`);
  for (const r of e.retirements) {
    const trade = r.ratioClean ? `every ${r.ratio}×${r.fromValue} → one ${r.toValue}` : `${r.fromValue} → ${r.toValue} (uneven)`;
    console.log(
      `  retire ${r.fromValue}: ${trade} | table ${r.tableCount}×${r.fromValue}=${r.tableValue} → ${r.bigOut}×${r.toValue}` +
        (r.raceChips ? ` + race ${r.raceChips} odd` : '') +
        (r.feasible ? '' : `  [!] bank only has ${r.bankHave}×${r.toValue}`),
    );
  }
}

// ---------------------------------------------------------------------------
// "The night should be about three hours" — the input people actually have, as
// opposed to "how many levels of how many minutes", which is the same question
// asked backwards.
// ---------------------------------------------------------------------------
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n== Ladder for a target duration ==');
for (const target of [120, 180, 240]) {
  const r = ladderForDuration(denoms, 2000, target);
  console.log(`  ${target} min -> ${r.levels.length} levels x ${r.minutesPerLevel} min = ${r.totalMinutes} min`);
  check(`${target} min lands within 25 min of the target`, Math.abs(r.totalMinutes - target) <= 25,
    `off by ${Math.abs(r.totalMinutes - target)}`);
  check(`${target} min uses a sane level length`, r.minutesPerLevel >= 10 && r.minutesPerLevel <= 45);
  check(`${target} min keeps at least four levels`, r.levels.length >= 4);
  check(`${target} min blinds only ever go up`,
    r.levels.every((l, i) => i === 0 || l.smallBlind > r.levels[i - 1].smallBlind));
}

console.log('\n== Breaks count towards the running time ==');
const noBreaks = ladderForDuration(denoms, 2000, 180);
const withBreaks = ladderForDuration(denoms, 2000, 180, { breakMinutes: 10, breakEvery: 3 });
console.log(`  without breaks ${noBreaks.totalMinutes} min / with breaks ${withBreaks.totalMinutes} min`);
check('a night with breaks is not simply longer', withBreaks.totalMinutes <= noBreaks.totalMinutes + 12);

console.log('\n== No chips, no ladder ==');
check('degrades to an empty ladder instead of throwing', ladderForDuration([], 2000, 180).levels.length === 0);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} planning check(s) failed`);
