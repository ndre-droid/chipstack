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
 * Does "use all my chips" still have a say at this level?
 *
 * The switch means "don't leave chip types sitting in the box" — a wish about the
 * INVENTORY, and about the one stack it is spent on: the opening one. It was being
 * applied to every level instead, and `selectPool` reads it as "skip the blind check
 * entirely", so with it on the base chip stays the smallest chip OWNED for the whole
 * night: 1s and 5s offered at 25/50, at 50/100, at 200/400, on the TV legend and in
 * every handout, no matter what the clock says. That is the setting quietly cancelling
 * the blind structure, not a preference being honoured.
 *
 * So it holds at the starting blind and stops there. Above it, the blinds decide.
 */
function wholeSetAllowedAt(session: SessionConfig, levelIdx?: number | null): boolean {
  return !!session.useAllChips && handoutBlindOf(session, levelIdx) === startBlindOf(session);
}

/**
 * The smallest chip still in play at `levelIdx` — anything below it is dead weight.
 *
 * This is `selectPool`'s own choice: the largest owned chip that DIVIDES the small
 * blind. That rule is not a heuristic, it is what the table needs — at 200/400 the
 * 100s are exactly how a 200 gets posted, and at 25/50 a 5 composes nothing anybody
 * can bet, so it is clutter. The stack builder already works to this line; exposing it
 * here lets screens that show the whole chip set draw the same one.
 *
 * An earlier version of this floored the base at the SMALL BLIND itself, on the theory
 * that a mid-game top-up should never be small change. That was wrong twice over: it
 * retired the 100s at 200/400, leaving nothing that could post the blind, and it never
 * addressed the case it was written for — a set with no chip that divides the small
 * blind, where the 5 genuinely IS the only way to make a 25.
 */
export function liveBaseValue(
  denominations: Denomination[],
  session: SessionConfig,
  levelIdx?: number | null,
): number {
  return baseChipValue(denominations, handoutBlindOf(session, levelIdx), {
    excluded: excludedSetOf(session),
    useAllChips: wholeSetAllowedAt(session, levelIdx),
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
 *
 * …with one guard on that first sentence. The planned stack is whatever the Plan tab
 * says, INCLUDING hand-tuned counts, and a hand-tuned stack answers to nobody: someone
 * who put fifteen 5s in it gets fifteen 5s back, and the shortcut hands that straight
 * over for any amount equal to the buy-in. On the TV's quick buy-in that is the default
 * amount, so a rebuy at 50/100 came back as the opening stack, small change and all —
 * which is what the photo of the big screen showed after three fixes aimed elsewhere.
 * So the shortcut now has to pass the same test as everything else: if the planned
 * stack contains a chip the blinds being played have retired, it is not what should be
 * pushed across the table, and the handout is built for the live blind instead.
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
    const planned = startingStackOf(denominations, session, unitValue);
    const live = liveBaseValue(denominations, session, levelIdx);
    if (!planned.denomsUsed.some((d) => d.value < live)) return planned;
  }
  const opts = {
    // A full buy-in handed out at higher blinds is still a top-up, not an opening
    // stack: few chips, big ones.
    smallBias: atStart && amount > session.buyIn ? session.smallBias : 0,
    excluded: excludedSetOf(session),
    blind,
    stacksNeeded: stacksNeededOf(session),
    maxDenoms: session.maxDenoms,
    // …and once the blinds have moved, "use all my chips" no longer overrides them.
    useAllChips: wholeSetAllowedAt(session, levelIdx),
  };
  /* No floor of our own on top of the blind. `computeStack` already refuses everything
     below the largest chip that divides the small blind, and that line is the real one:
     above it the chips can post and make change, below it they cannot. Adding a second,
     stricter floor at the small blind itself retired the 100s at 200/400 — the very
     chips a 200 is posted with. */
  return computeStack(moneyToUnits(amount, unitValue), denominations, opts);
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
