import type { Denomination, SessionConfig } from '../types';
import { computeStack, moneyToUnits } from './distribution';
import type { StackResult } from './distribution';

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
 * The chips to hand over for ANY amount of money, built with the same rules as the
 * starting stack. A €5 late buy-in gets €5 worth of chips — not a full stack.
 *
 * A full buy-in returns exactly the starting stack (manual fine-tuning included), so
 * a new player is dealt what the Plan tab promises. A smaller top-up instead gets
 * the FEWEST chips (`smallBias` 0): mid-game nobody wants 25 pieces for €5, and the
 * small chips they need for blinds are already in front of them.
 */
export function handoutStack(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
  amount: number,
): StackResult {
  if (Math.abs(amount - session.buyIn) < 0.005) return startingStackOf(denominations, session, unitValue);
  return computeStack(moneyToUnits(amount, unitValue), denominations, {
    smallBias: amount > session.buyIn ? session.smallBias : 0,
    excluded: excludedSetOf(session),
    blind: startBlindOf(session),
    stacksNeeded: stacksNeededOf(session),
    maxDenoms: session.maxDenoms,
    useAllChips: session.useAllChips,
  });
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
