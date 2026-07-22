import { suggestBlindLadder, colorUpEvents } from './planning.ts';
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

console.log('\nDone.');
