import assert from 'node:assert/strict';
import {
  activeOverride,
  handoutAmountOf,
  handoutBlindOf,
  handoutLevelOf,
  handoutStack,
  liveBaseValue,
  stacksNeededOf,
  stackBasisKey,
  startingStackOf,
} from './startingStack.ts';
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

console.log('\nmid-game the handout follows the blinds being played');
{
  // Level 3 is 50/100: the 10s and 25s cannot post anything any more, and a €40
  // rebuy paid out in them is a pile nobody can bet with.
  const late = handoutStack(denoms, session, unit, 40, 2);
  check('worth exactly what was paid', valueOf(late.counts) === moneyToUnits(40, unit), String(valueOf(late.counts)));
  check('the dead small chips are gone', !(late.counts['10'] > 0) && !(late.counts['25'] > 0), JSON.stringify(late.counts));
  // …but the same amount at the opening blinds still needs the small ones.
  const early = handoutStack(denoms, session, unit, 40, 0);
  check('at the starting level the small chips stay', (early.counts['10'] ?? 0) > 0, JSON.stringify(early.counts));
  check(
    'and the same money is far fewer pieces once the blinds have moved',
    chipsIn(late.counts) < chipsIn(early.counts) / 2,
    `${chipsIn(late.counts)} at 50/100 vs ${chipsIn(early.counts)} at 10/20`,
  );

  /* The level in play is never allowed to take the stack BELOW the level it was
     designed for — that would undo the plan rather than follow it. */
  const fromLvl2: SessionConfig = { ...session, startLevelIdx: 1 } as SessionConfig;
  check('never below the level the stack was built for', handoutBlindOf(fromLvl2, 0)?.smallBlind === 20);
  check('and it follows the clock upward', handoutBlindOf(fromLvl2, 2)?.smallBlind === 50);
  check('past the top level it stops at the top', handoutBlindOf(session, 99)?.smallBlind === 50);

  // A full buy-in at the opening blinds is still exactly the starting stack…
  const full = handoutStack(denoms, session, unit, session.buyIn, 0);
  const start = startingStackOf(denoms, session, unit);
  check('a full buy-in at the start is the starting stack', JSON.stringify(full.counts) === JSON.stringify(start.counts));
  // …and the same money later is not: it is a top-up in big chips.
  const fullLate = handoutStack(denoms, session, unit, session.buyIn, 2);
  check(
    'the same money later is a top-up, not a fresh stack',
    chipsIn(fullLate.counts) < chipsIn(start.counts),
    `${chipsIn(fullLate.counts)} vs ${chipsIn(start.counts)}`,
  );
}

console.log('\nthe amount the card is showing chips for');
{
  check('nothing chosen means the buy-in', handoutAmountOf(session) === session.buyIn);
  check('a chosen amount wins', handoutAmountOf({ ...session, handoutAmount: 40 } as SessionConfig) === 40);
  check(
    'a nonsense amount falls back to the buy-in',
    handoutAmountOf({ ...session, handoutAmount: 0 } as SessionConfig) === session.buyIn,
  );
}

console.log('\nthe chip legend follows the blinds too');
{
  // What the TV greys out: at 10/20 nothing is dead yet, at 50/100 the 10s and 25s are.
  const excluded = { ...session, excludedDenoms: ['10'] } as SessionConfig;
  check('at the opening blinds the smallest chip is still the base', liveBaseValue(denoms, session, 0) === 10);
  check(
    'at 50/100 the base has moved up',
    liveBaseValue(denoms, session, 2) === 50,
    String(liveBaseValue(denoms, session, 2)),
  );
  // "Use all my chips" says which chips the PLAN may use; it cannot make a 10 postable
  // at 50/100, so mid-game it does not drag the base back under the blind.
  check(
    '"use all my chips" still stops below the blind mid-game',
    liveBaseValue(denoms, { ...session, useAllChips: true } as SessionConfig, 2) === 50,
    String(liveBaseValue(denoms, { ...session, useAllChips: true } as SessionConfig, 2)),
  );
  check(
    'but at the opening blinds it keeps every value in play',
    liveBaseValue(denoms, { ...session, useAllChips: true } as SessionConfig, 0) === 10,
  );
  check('an excluded chip is never the base', liveBaseValue(denoms, excluded, 0) !== 10, String(liveBaseValue(denoms, excluded, 0)));
}

console.log('\nno chip smaller than the small blind, once the blinds have moved');
{
  // The 25 is gone from the set, so `selectPool` used to fall back to the 10 (it
  // divides a 50 small blind). A rebuy at 50/100 must not arrive as ten-point change.
  const noTwentyFive = [set(10, 80), set(50, 80), set(100, 80), set(500, 40), set(1000, 20)];
  const r = handoutStack(noTwentyFive, session, unit, 20, 2);
  check(
    'a €20 rebuy at 50/100 has nothing under the blind',
    r.denomsUsed.every((d) => d.value >= 50),
    r.denomsUsed.map((d) => `${d.value}x${r.counts[d.id]}`).join(' '),
  );
  check('and it still adds up exactly', r.exact && r.totalValue === moneyToUnits(20, unit));
  check('the legend agrees with it', liveBaseValue(noTwentyFive, session, 2) === 50);

  // …unless the floor is what makes the amount impossible: 30 points cannot be built
  // from 50s, so the blind-compatible base comes back rather than shorting the player.
  const odd = handoutStack(noTwentyFive, session, unit, 0.3, 2);
  check(
    'an amount the big chips cannot make falls back',
    odd.exact && odd.totalValue === 30,
    odd.denomsUsed.map((d) => `${d.value}x${odd.counts[d.id]}`).join(' '),
  );
}

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

console.log('\nthe level the stack card is built for');
{
  // No pin: the starting level on the Plan tab, the clock's level on the Table tab.
  check('unpinned, no clock = the starting level', handoutLevelOf(session, null) === 0);
  check('unpinned, mid-game = the level being played', handoutLevelOf(session, 2) === 2);
  const pinned = { ...session, handoutLevelIdx: 2 } as SessionConfig;
  check('a pin looks further ahead', handoutLevelOf(pinned, null) === 2);
  check('and still wins while the clock is behind it', handoutLevelOf(pinned, 1) === 2);
  /* The one thing a pin may NOT do: hand out chips finer than the table needs. Past
     the pinned level, the level being played wins again. */
  const early = { ...session, handoutLevelIdx: 0 } as SessionConfig;
  check('but never drags the stack below the level being played', handoutLevelOf(early, 2) === 2);
  check(
    'the pinned blind is the one the chips are built for',
    handoutBlindOf(pinned, null) === session.blindLevels[2],
  );
  check(
    'and a pinned level colours the stack up',
    handoutStack(denoms, pinned, unit, session.buyIn, null).baseValue === 50,
    String(handoutStack(denoms, pinned, unit, session.buyIn, null).baseValue),
  );
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} starting-stack check(s) failed`);
