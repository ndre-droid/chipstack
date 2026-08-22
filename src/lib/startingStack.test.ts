import assert from 'node:assert/strict';
import { handoutStack, stacksNeededOf, startingStackOf, stackBasisKey, activeOverride } from './startingStack.ts';
import { moneyToUnits } from './distribution.ts';
import type { Denomination, SessionConfig } from '../types.ts';

/**
 * The chips actually pushed across the table: a full buy-in must equal the stack the
 * Plan tab promises (fine-tuning included), and a smaller top-up must not come back
 * as a fistful of small change.
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

const set = (value: number, count: number): Denomination => ({
  id: String(value),
  value,
  color: '#888',
  accent: '#fff',
  count,
  enabled: true,
});

const denoms: Denomination[] = [set(10, 80), set(25, 80), set(50, 80), set(100, 80), set(500, 40), set(1000, 20)];

const unit = 0.01; // €1 = 100 points

const session: SessionConfig = {
  playerCount: 4,
  buyIn: 20,
  earlyRebuys: 2,
  lateRebuyAmount: 30,
  blindLevels: [
    { smallBlind: 10, bigBlind: 20 },
    { smallBlind: 20, bigBlind: 40 },
    { smallBlind: 50, bigBlind: 100 },
  ],
  startLevelIdx: 0,
  smallBias: 0.9,
  maxDenoms: 0,
  useAllChips: false,
  excludedDenoms: [],
} as SessionConfig;

const valueOf = (counts: Record<string, number>) =>
  Object.entries(counts).reduce((sum, [id, n]) => sum + Number(id) * n, 0);
const chipsIn = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

console.log('\nstacks the inventory has to serve');
check(
  'players plus the planned early rebuys',
  stacksNeededOf(session) === 6,
  String(stacksNeededOf(session)),
);
check('never zero, even with an empty table', stacksNeededOf({ ...session, playerCount: 0, earlyRebuys: 0 }) === 1);

console.log('\na full buy-in is dealt the starting stack');
const starting = startingStackOf(denoms, session, unit);
const full = handoutStack(denoms, session, unit, session.buyIn);
check(
  'same chips as the Plan tab shows',
  JSON.stringify(full.counts) === JSON.stringify(starting.counts),
  `${JSON.stringify(full.counts)} vs ${JSON.stringify(starting.counts)}`,
);
check(
  'and it is worth exactly the buy-in',
  valueOf(full.counts) === moneyToUnits(session.buyIn, unit),
  `${valueOf(full.counts)} vs ${moneyToUnits(session.buyIn, unit)}`,
);

console.log('\na mid-game top-up gets the fewest chips');
const topUp = handoutStack(denoms, session, unit, 5);
check('worth exactly what was paid', valueOf(topUp.counts) === moneyToUnits(5, unit), String(valueOf(topUp.counts)));
check(
  'fewer pieces than a quarter of a full stack would suggest',
  chipsIn(topUp.counts) < chipsIn(starting.counts) / 2,
  `${chipsIn(topUp.counts)} chips for €5 vs ${chipsIn(starting.counts)} for €20`,
);

console.log('\na bigger buy-in still gets small chips to post blinds');
const big = handoutStack(denoms, session, unit, 50);
check('worth exactly what was paid', valueOf(big.counts) === moneyToUnits(50, unit), String(valueOf(big.counts)));
check('includes the blind-posting chip', (big.counts['10'] ?? 0) > 0, JSON.stringify(big.counts));

console.log('\nhand-tuned counts only survive while their inputs do');
const counts = { '10': 10, '25': 12, '50': 10, '100': 11 };
const tuned: SessionConfig = {
  ...session,
  stackOverride: { key: stackBasisKey(denoms, session, unit), counts },
} as SessionConfig;
check('an override matching the inputs is used', activeOverride(denoms, tuned, unit) !== null);
check('and the dealt stack is the tuned one', JSON.stringify(startingStackOf(denoms, tuned, unit).counts) === JSON.stringify(counts));
check(
  'changing the buy-in drops it instead of misapplying it',
  activeOverride(denoms, { ...tuned, buyIn: 30 }, unit) === null,
);
check(
  'so does changing the chip inventory',
  activeOverride([set(10, 80), set(25, 80), set(50, 80), set(100, 80)], tuned, unit) === null,
);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} starting-stack check(s) failed`);
