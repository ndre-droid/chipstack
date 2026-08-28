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
  /* "Use all my chips" is a wish about the box and the opening stack, so it holds at
     the starting blind — and stops there. Left applying to every level it reads as
     "ignore the blind structure", which kept the smallest chip owned in play all
     night: 5s offered at 50/100 on the legend and in every handout. */
  const allChips = { ...session, useAllChips: true } as SessionConfig;
  check(
    '"use all my chips" keeps every value at the opening blinds',
    liveBaseValue(denoms, allChips, 0) === 10,
    String(liveBaseValue(denoms, allChips, 0)),
  );
  check(
    'but the blinds take over once they have moved',
    liveBaseValue(denoms, allChips, 2) === 50,
    String(liveBaseValue(denoms, allChips, 2)),
  );
  const allChipsLate = handoutStack(denoms, allChips, unit, 20, 2);
  check(
    'and no chip the blinds retired is handed out',
    allChipsLate.exact && allChipsLate.denomsUsed.every((d) => d.value >= 50),
    allChipsLate.denomsUsed.map((d) => `${d.value}x${allChipsLate.counts[d.id]}`).join(' '),
  );
  check('an excluded chip is never the base', liveBaseValue(denoms, excluded, 0) !== 10, String(liveBaseValue(denoms, excluded, 0)));
}

console.log('\nthe base chip is the one that can post the blind');
{
  /* The rule is `selectPool`'s: the largest owned chip that DIVIDES the small blind.
     Not the small blind itself — a floor there retires the 100s at 200/400, which are
     exactly the chips a 200 is posted with. */
  const wide = [set(5, 200), set(25, 200), set(100, 200), set(500, 100), set(1000, 60)];
  const deep = {
    ...session,
    blindLevels: [
      { smallBlind: 10, bigBlind: 20 },
      { smallBlind: 25, bigBlind: 50 },
      { smallBlind: 200, bigBlind: 400 },
    ],
  } as SessionConfig;
  check('at 25/50 the 5s are gone', liveBaseValue(wide, deep, 1) === 25, String(liveBaseValue(wide, deep, 1)));
  check(
    'but at 200/400 the 100s stay — they are how a 200 is posted',
    liveBaseValue(wide, deep, 2) === 100,
    String(liveBaseValue(wide, deep, 2)),
  );
  const late = handoutStack(wide, deep, unit, 40, 2);
  check(
    'and the handout can still make the blind',
    late.exact && late.denomsUsed.every((d) => d.value >= 100),
    late.denomsUsed.map((d) => `${d.value}x${late.counts[d.id]}`).join(' '),
  );

  // With no chip dividing the small blind there is no better answer than the small one:
  // a 25 blind is five 5s or nothing.
  const noDivider = [set(5, 200), set(10, 200), set(50, 200), set(100, 200)];
  check('no divider means the small chip is the only way to post', liveBaseValue(noDivider, deep, 1) === 5);
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

console.log('\na hand-tuned plan does not override the blinds being played');
{
  /* Straight off a photo of the big screen: chips 5/25/50/100/500, blinds 50/100, and
     the quick buy-in offering fifteen 5s for a EUR 20 rebuy. No auto stack produces
     those counts — it was the hand-tuned opening stack, handed over whole by the
     "full buy-in at the starting blinds" shortcut. A tuned stack answers to nobody, so
     the shortcut has to check that what it is about to hand over is still legal at the
     blinds in play. */
  const chips = [set(5, 100), set(25, 100), set(50, 60), set(100, 100), set(500, 50)];
  const levels = [
    { smallBlind: 10, bigBlind: 20 },
    { smallBlind: 25, bigBlind: 50 },
    { smallBlind: 50, bigBlind: 100 },
  ];
  const counts5 = { '5': 15, '25': 5, '50': 12, '100': 7, '500': 1 };
  const planAt = (startLevelIdx: number) => {
    const b = { ...session, playerCount: 6, earlyRebuys: 0, blindLevels: levels, startLevelIdx } as SessionConfig;
    return { ...b, stackOverride: { key: stackBasisKey(chips, b, unit), counts: counts5 } } as SessionConfig;
  };

  const late = handoutStack(chips, planAt(2), unit, 20, 2); // plan starts at 50/100, tuned with 5s
  check(
    'a tuned stack full of 5s is not handed over at 50/100',
    !late.denomsUsed.some((d) => d.value < 50),
    late.denomsUsed.map((d) => `${d.value}x${late.counts[d.id]}`).join(' '),
  );
  check('and the rebuy is still worth the money', late.exact && late.totalValue === moneyToUnits(20, unit));

  // …but a plan that really does start at 10/20 still deals a new player what it promises.
  const early = handoutStack(chips, planAt(0), unit, 20, 0);
  check(
    'the tuned opening stack survives where it belongs',
    JSON.stringify(early.counts) === JSON.stringify(counts5),
    JSON.stringify(early.counts),
  );
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} starting-stack check(s) failed`);
