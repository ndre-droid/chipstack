import type { Denomination, SessionConfig } from '../types.ts';
import { liveBaseValue, startingStackOf } from './startingStack.ts';

/**
 * The small change nobody wants to count.
 *
 * An hour into the night the blinds are 25/50 and the 1s and 5s that made the
 * opening stack work compose nothing anybody can bet. They are the majority of the
 * physical chips in front of a player and a rounding error of the money, so a
 * colour-by-colour count spends most of its taps on the part that matters least.
 *
 * "Count the big chips only" folds those colours into a single assumed figure. The
 * threshold is not a number invented here: `liveBaseValue` already knows the
 * smallest chip still in play at a given blind level — it is the line the stack
 * builder itself works to — so this asks the same question and reuses the answer.
 * Anything below the base is small change; anything at or above it gets counted.
 *
 * Two consequences worth knowing, both deliberate:
 *
 * At the STARTING level the base is the smallest chip the opening stack uses, so
 * nothing is below it and there is no small change. The feature is inert until the
 * blinds have actually left those chips behind, which is the honest answer rather
 * than a disabled-looking toggle.
 *
 * The assumed figure is ONE opening stack's worth, however many times someone has
 * rebought. A mid-game top-up is built at the level being played (see `handoutStack`)
 * and therefore contains no small chips at all — the small change on the table came
 * from the first buy-in, so that is what gets assumed back.
 */
export interface SmallChange {
  /** the colours being treated as small change, smallest first */
  denoms: Denomination[];
  /** what they are assumed to still be worth, in chip-units */
  units: number;
  /** the smallest chip still in play — the line that was drawn */
  baseValue: number;
}

const NONE: SmallChange = { denoms: [], units: 0, baseValue: 0 };

/**
 * `levelIdx` is the blind level being played right now. Leave it out and the line
 * is drawn at the level the stack was planned for, where — by the note above —
 * there is nothing below it.
 */
export function smallChangeOf(
  denominations: Denomination[],
  session: SessionConfig,
  unitValue: number,
  levelIdx?: number | null,
): SmallChange {
  const baseValue = liveBaseValue(denominations, session, levelIdx);
  if (!(baseValue > 0)) return NONE;

  const start = startingStackOf(denominations, session, unitValue);
  const denoms = start.denomsUsed
    .filter((d) => d.value < baseValue && (start.counts[d.id] ?? 0) > 0)
    .sort((a, b) => a.value - b.value);
  if (!denoms.length) return { ...NONE, baseValue };

  const units = denoms.reduce((s, d) => s + (start.counts[d.id] ?? 0) * d.value, 0);
  return { denoms, units, baseValue };
}
