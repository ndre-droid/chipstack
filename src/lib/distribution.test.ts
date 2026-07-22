import { computeStack, moneyToUnits } from './distribution.ts';
import type { Denomination } from '../types.ts';

// SLOWPLAY Nash-style set (face values in chip-units)
const set = (value: number, count: number, id = String(value)): Denomination => ({
  id,
  value,
  color: '#888',
  accent: '#fff',
  count,
  enabled: true,
});

const denoms: Denomination[] = [
  set(1, 100),
  set(5, 100),
  set(10, 100),
  set(25, 100),
  set(50, 80),
  set(100, 80),
  set(500, 50),
  set(1000, 40),
];

function show(label: string, r: ReturnType<typeof computeStack>) {
  const parts = r.denomsUsed.map((d) => `${r.counts[d.id]}×${d.value}`).join('  ');
  const flag = r.exact ? 'exact' : 'INEXACT';
  const feas = r.feasible ? 'feasible' : 'SHORT';
  const blind = r.blindOk ? 'blindOK' : 'BLIND!!';
  console.log(
    `${label.padEnd(30)} base=${String(r.baseValue).padStart(3)} [${blind}] value=${String(r.totalValue).padStart(5)} chips=${String(r.chipCount).padStart(3)} [${flag}/${feas}]  ${parts}`,
  );
  r.warnings.forEach((w) => console.log('      ! ' + w));
  r.notes.forEach((n) => console.log('      · ' + n));
}

// Buy-in €20 at 1c/unit = 2000 units, 6 players, blinds 5/10
const buyin = moneyToUnits(20, 0.01);
console.log(`\n== Buy-in €20 => ${buyin} units, 6 players, blind 5/10 ==`);
const blind = { id: 'l1', smallBlind: 5, bigBlind: 10, ante: 0 };
for (const bias of [0, 0.25, 0.5, 0.75, 1]) {
  show(`bias=${bias}`, computeStack(buyin, denoms, { smallBias: bias, blind, stacksNeeded: 6 }));
}

// Rebuy €20 at a later, higher blind level (color-up expected: fewer small chips)
console.log(`\n== Rebuy €20 at blind 50/100 (late), low bias ==`);
const lateBlind = { id: 'l4', smallBlind: 50, bigBlind: 100, ante: 0 };
show('bias=0.2 late', computeStack(buyin, denoms, { smallBias: 0.2, blind: lateBlind, stacksNeeded: 6 }));

// Small buy-in €5, blind 1/2
console.log(`\n== Buy-in €5 => 500 units, 8 players, blind 1/2 ==`);
const smallBlind = { id: 'l0', smallBlind: 1, bigBlind: 2, ante: 0 };
for (const bias of [0.3, 0.6, 0.9]) {
  show(`bias=${bias}`, computeStack(500, denoms, { smallBias: bias, blind: smallBlind, stacksNeeded: 8 }));
}

// Inventory pressure: only 20 of the 5-chip, 10 players
console.log(`\n== Inventory-constrained: 10 players, few small chips ==`);
const tight: Denomination[] = [set(1, 30), set(5, 20), set(25, 60), set(100, 60), set(500, 40)];
show('tight bias=0.6', computeStack(2000, tight, { smallBias: 0.6, blind, stacksNeeded: 10 }));

// ---- Blind-compatibility (the 10/20 problem) ----
console.log(`\n== Blind 10/20: must use 10 (or 5s), NOT 25 as the base chip ==`);
const b1020 = { id: 'x', smallBlind: 10, bigBlind: 20, ante: 0 };
show('full set @10/20', computeStack(2000, denoms, { smallBias: 0.6, blind: b1020, stacksNeeded: 6 }));

console.log(`\n== Blind 10/20 with a 5-based set (1,5,25,100): base should be 5, 25 stays ==`);
const fiveBase: Denomination[] = [set(1, 60), set(5, 100), set(25, 100), set(100, 80)];
show('5-based @10/20', computeStack(2000, fiveBase, { smallBias: 0.6, blind: b1020, stacksNeeded: 6 }));

console.log(`\n== Blind 10/20 but smallest owned chip is 25 (unplayable) — must warn ==`);
const noSmall: Denomination[] = [set(25, 100), set(100, 80), set(500, 40)];
show('25-min @10/20', computeStack(2000, noSmall, { smallBias: 0.6, blind: b1020, stacksNeeded: 6 }));

console.log(`\n== Same 25-min set but blinds raised to 25/50 — now fine ==`);
const b2550 = { id: 'y', smallBlind: 25, bigBlind: 50, ante: 0 };
show('25-min @25/50', computeStack(2000, noSmall, { smallBias: 0.6, blind: b2550, stacksNeeded: 6 }));

console.log('\nDone.');
