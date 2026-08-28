import type { Denomination, SessionConfig } from '../types.ts';
import { baseChipValue, computeStack, moneyToUnits } from './distribution.ts';
import type { StackResult } from './distribution.ts';

/**
 * THE starting stack — one place, so the Plan tab, the Table card, the counting
 * round and the TV all show the same chips.
 *
 * Everything that shapes the stack (the small-chip slider, excluded chips, which
 * blind level it starts at and any manual fine-tuning) lives in `SessionConfig`,
 * which is part of `LiveData` — so tuning it on the phone reaches the big screen
 * automatically. Before this, `excluded` / `startLevelIdx` / the fine-tune editor
 * were React state local to PlanScreen and the TV kept recomputing its own,
 * different stack.
 */

/** The blind level the starting stack is built for. */
export function startBlindOf(session: SessionConfig) {
  const { blindLevels, startLevelIdx } = session;
  if (!blindLevels.length) return null;
  return blindLevels[Math.min(Math.max(0, startLevelIdx), blindLevels.length - 1)] ?? null;
}

/** Stacks the inventory must serve: everyone at the table plus the planned early rebuys. */
export function stacksNeededOf(session: SessionConfig) {
  return Math.max(1, session.playerCount + Math.max(0, session.earlyRebuys));
}

export function excludedSetOf(session: SessionConfig) {
  return new Set(session.excludedDenoms ?? []);
}

/** The auto-computed stack — no manual overrides applied. */
export function autoStartingStack(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
): StackResult {
  return computeStack(moneyToUnits(session.buyIn, unitValue), denominations, {
    smallBias: session.smallBias,
    excluded: excludedSetOf(session),
    blind: startBlindOf(session),
    stacksNeeded: stacksNeededOf(session),
    maxDenoms: session.maxDenoms,
    useAllChips: session.useAllChips,
  });
}

/**
 * The blind level a mid-game handout should be built for.
 *
 * Not the starting level: an hour in, the blinds are 25/50 and the 5s and 10s that
 * made the opening stack work are dead weight — nobody can post anything with them,
 * they only make the pile taller. Feeding the level actually being played into
 * `computeStack` drops them on its own (`selectPool` keeps the pool blind-compatible),
 * which is the whole mechanism behind "stop giving me the small chips".
 *
 * Never BELOW the level the stack was designed for, though: handing out chips finer
 * than the plan's own base chip would undo the plan rather than follow it.
 */
export function handoutBlindOf(session: SessionConfig, levelIdx: number | null | undefined) {
  const levels = session.blindLevels;
  if (!levels.length) return null;
  return levels[Math.min(levels.length - 1, handoutLevelOf(session, levelIdx))] ?? null;
}

/**
 * WHICH level the stack card is built for, as an index.
 *
 * Three answers, in order of who gets to speak: never below the level the plan
 * itself starts at, never below the level actually being played (chips finer than
 * the table needs are exactly the thing this all exists to stop), and above both of
 * those, whatever the user pinned with the level stepper on the card. The pin is
 * how "what does a €45 stack look like at level 7?" gets asked from the Plan tab,
 * where there is no clock to answer it — and because it lives in the session, the
 * Table tab and the big screen show the same stack rather than a second one.
 */
export function handoutLevelOf(session: SessionConfig, levelIdx?: number | null): number {
  const start = Math.max(0, session.startLevelIdx ?? 0);
  const playing = typeof levelIdx === 'number' ? Math.max(levelIdx, start) : start;
  const pinned = session.handoutLevelIdx;
  return typeof pinned === 'number' && pinned > playing ? pinned : playing;
}

/**
 * The hard floor on a mid-game handout's chips: nothing smaller than the small blind.
 *
 * `selectPool` picks the largest chip that DIVIDES the small blind, which is the right
 * answer for a stack that has to post blinds — but it still lands on a 5 at 25/50 when
 * there is no 25 in the set (or when "use all my chips" is on). Nobody wants five 5s
 * for a 25 in a rebuy: the small change for posting is already on the felt, and a
 * top-up should be the biggest chips that make the number.
 *
 * Zero while the handout is still built for the STARTING blind — there the plan's own
 * base chip has the final word, so the Plan tab and a late arrival's full stack are
 * untouched by this.
 */
export function handoutMinChipValue(session: SessionConfig, levelIdx?: number | null): number {
  const blind = handoutBlindOf(session, levelIdx);
  if (!blind || blind === startBlindOf(session)) return 0;
  return Math.max(0, blind.smallBlind);
}

/**
 * The smallest chip still in play at `levelIdx` — anything below it is dead weight.
 *
 * The stack builder already drops those chips (see `handoutBlindOf` and
 * `handoutMinChipValue`); this is the same answer for screens that show the whole chip
 * set rather than one stack, so the TV legend can grey out the 5s at 25/50 instead of
 * still offering them.
 */
export function liveBaseValue(
  denominations: Denomination[],
  session: SessionConfig,
  levelIdx?: number | null,
): number {
  const floor = handoutMinChipValue(session, levelIdx);
  const base = baseChipValue(denominations, handoutBlindOf(session, levelIdx), {
    excluded: excludedSetOf(session),
    useAllChips: session.useAllChips,
    minDenomValue: floor,
  });
  // Nothing at or above the blind? Then the floor is unusable and the poker-correct
  // base stands — the legend must not grey out every chip on the table.
  return base || baseChipValue(denominations, handoutBlindOf(session, levelIdx), {
    excluded: excludedSetOf(session),
    useAllChips: session.useAllChips,
  });
}

/** The amount the stack card is showing chips for — the buy-in unless overridden. */
export function handoutAmountOf(session: SessionConfig): number {
  const set = session.handoutAmount;
  return typeof set === 'number' && set > 0 ? set : session.buyIn;
}

/**
 * The chips to hand over for ANY amount of money, built with the same rules as the
 * starting stack. A €5 late buy-in gets €5 worth of chips — not a full stack.
 *
 * `levelIdx` is the blind level being played right now (from the clock); leave it out
 * and the stack is built for the starting level, which is what the Plan tab wants.
 *
 * A full buy-in at the starting blinds returns exactly the starting stack (manual
 * fine-tuning included), so a new player is dealt what the Plan tab promises. Anything
 * else gets the FEWEST chips (`smallBias` 0): mid-game nobody wants 25 pieces for €5,
 * and the small chips they need for blinds are already in front of them.
 */
export function handoutStack(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
  amount: number,
  levelIdx?: number | null,
): StackResult {
  const blind = handoutBlindOf(session, levelIdx);
  const atStart = blind === startBlindOf(session);
  if (atStart && Math.abs(amount - session.buyIn) < 0.005) {
    return startingStackOf(denominations, session, unitValue);
  }
  const opts = {
    // A full buy-in handed out at higher blinds is still a top-up, not an opening
    // stack: few chips, big ones.
    smallBias: atStart && amount > session.buyIn ? session.smallBias : 0,
    excluded: excludedSetOf(session),
    blind,
    stacksNeeded: stacksNeededOf(session),
    maxDenoms: session.maxDenoms,
    useAllChips: session.useAllChips,
  };
  const units = moneyToUnits(amount, unitValue);
  const floor = handoutMinChipValue(session, levelIdx);
  if (!floor) return computeStack(units, denominations, opts);

  // Chips below the blind are refused first; the floor is only lifted again when it is
  // what stopped the amount coming out exactly (odd money, or no big chips left).
  const floored = computeStack(units, denominations, { ...opts, minDenomValue: floor });
  if (floored.exact) return floored;
  const free = computeStack(units, denominations, opts);
  return free.exact ? free : floored.denomsUsed.length ? floored : free;
}

/**
 * Signature of every input the auto stack depends on. A saved manual override is
 * only honoured while this matches — change the buy-in or the slider and the
 * hand-tuned counts are quietly dropped instead of silently misapplied.
 */
export function stackBasisKey(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
): string {
  const blind = startBlindOf(session);
  return JSON.stringify([
    moneyToUnits(session.buyIn, unitValue),
    session.smallBias,
    session.maxDenoms,
    session.useAllChips,
    stacksNeededOf(session),
    blind ? [blind.smallBlind, blind.bigBlind] : null,
    [...(session.excludedDenoms ?? [])].sort(),
    denominations.map((d) => [d.id, d.value, d.enabled, d.count, d.maxPerPlayer ?? null]),
  ]);
}

/** The manual counts currently in force, or null when there is no live override. */
export function activeOverride(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
): Record<string, number> | null {
  const ov = session.stackOverride;
  if (!ov) return null;
  return ov.key === stackBasisKey(denominations, session, unitValue) ? ov.counts : null;
}

/**
 * The stack every player is actually dealt: the auto stack with any still-valid
 * manual fine-tuning folded in. This is what every screen should render.
 */
export function startingStackOf(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
): StackResult & { edited: boolean } {
  const auto = autoStartingStack(denominations, session, unitValue);
  const counts = activeOverride(denominations, session, unitValue);
  if (!counts) return { ...auto, edited: false };

  const byId = new Map(denominations.map((d) => [d.id, d]));
  const denomsUsed = Object.keys(counts)
    .filter((id) => (counts[id] ?? 0) > 0 && byId.has(id))
    .map((id) => byId.get(id) as Denomination)
    .sort((a, b) => a.value - b.value);
  const totalValue = denomsUsed.reduce((s, d) => s + counts[d.id] * d.value, 0);
  const chipCount = denomsUsed.reduce((s, d) => s + counts[d.id], 0);

  return {
    ...auto,
    edited: true,
    counts: { ...counts },
    denomsUsed,
    totalValue,
    chipCount,
    exact: totalValue === auto.targetValue,
    baseValue: denomsUsed[0]?.value ?? 0,
  };
}
