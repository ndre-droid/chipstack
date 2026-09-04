import type { BlindLevel, Denomination, SessionConfig } from '../types.ts';
import { computeStack, moneyToUnits } from './distribution.ts';

/**
 * What one chip-unit is worth in money — chosen for the box that is actually on
 * the table.
 *
 * The app's default, one point per cent, is right for a 500-piece ceramic set that
 * runs 1 to 5000. It is wrong for a 300-piece dice case that stops at 100: a €20
 * buy-in is 2000 points, and eight stacks of 2000 points cannot be built out of
 * fifty hundreds and fifty twenty-fives. The engine says so, honestly and in red —
 * "closest stack is 1000 (target 2000)" — but that is the first thing a new user
 * sees, and it is not their mistake. It is a unit that was chosen for somebody
 * else's chips.
 *
 * The rule here is deliberately conservative, and it is one sentence:
 *
 *   Keep the unit that is already in use if the box can build the buy-in exactly
 *   with it. Only when it cannot, take the standard unit whose stack comes out
 *   closest to a comfortable pile of chips.
 *
 * Never "improve" a setup that works. A unit value is the meaning of every number
 * in the app — the ledger, the blinds, the stack on the big screen — and a table
 * that has been playing 2000-point stacks for a year should not find them turned
 * into 1000-point stacks because a search preferred the look of it.
 */

/** The units the money mapping offers, finest first. */
export const UNIT_VALUES = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1] as const;

/** A stack this size looks and plays like a poker stack: enough to make change
 *  with, few enough to see over. Used only to CHOOSE between candidates that all
 *  work; nothing is rejected for being outside it. */
const IDEAL_CHIPS = 30;

export interface UnitFit {
  unitValue: number;
  /** the box can hand every player exactly the buy-in at this unit */
  works: boolean;
  /** physical chips in one player's stack */
  chipCount: number;
}

/** Can this box build this buy-in, at this unit? */
export function fitAtUnit(
  denominations: Denomination[],
  session: Pick<SessionConfig, 'buyIn' | 'smallBias' | 'maxDenoms' | 'useAllChips' | 'excludedDenoms'>,
  stacksNeeded: number,
  blind: BlindLevel | null,
  unitValue: number,
): UnitFit {
  const res = computeStack(moneyToUnits(session.buyIn, unitValue), denominations, {
    smallBias: session.smallBias,
    excluded: new Set(session.excludedDenoms ?? []),
    blind,
    stacksNeeded: Math.max(1, stacksNeeded),
    maxDenoms: session.maxDenoms,
    useAllChips: session.useAllChips,
  });
  return { unitValue, works: res.exact && res.feasible, chipCount: res.chipCount };
}

/**
 * The unit to use for this box and this buy-in.
 *
 * `blind` is the level the opening stack is built for; pass null before a ladder
 * exists and every owned chip is eligible, which is the right answer at first run —
 * the ladder is derived from the chips a moment later anyway.
 */
export function suggestUnitValue(
  denominations: Denomination[],
  session: Pick<SessionConfig, 'buyIn' | 'smallBias' | 'maxDenoms' | 'useAllChips' | 'excludedDenoms'>,
  stacksNeeded: number,
  blind: BlindLevel | null,
  currentUnit: number,
): number {
  if (!(session.buyIn > 0) || !denominations.some((d) => d.enabled && d.count > 0)) return currentUnit;

  // what is already in use wins as long as it works
  if (fitAtUnit(denominations, session, stacksNeeded, blind, currentUnit).works) return currentUnit;

  const fits = UNIT_VALUES.map((u) => fitAtUnit(denominations, session, stacksNeeded, blind, u)).filter(
    (f) => f.works,
  );
  if (!fits.length) return currentUnit; // nothing fits; leave it alone and let the warning speak

  /* Closest to a comfortable pile. Ties go to the FINER unit: bigger point numbers
     read as poker (1000, not 100), and the finer unit is the one that leaves room
     to make change later in the night. */
  return fits.reduce((best, f) =>
    Math.abs(f.chipCount - IDEAL_CHIPS) < Math.abs(best.chipCount - IDEAL_CHIPS) ? f : best,
  ).unitValue;
}
