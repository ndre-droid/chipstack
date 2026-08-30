import { spreadOnStep } from './stackShare.ts';

/**
 * The counting round when the PHONE goes round the table.
 *
 * Different instrument, same night: on the slider round one person divides a known
 * pot (see lib/stackShare.ts, where the sum cannot drift). Here the phone is handed
 * to whoever wants it, each player picks their own name and counts their own pile —
 * so the sum is not guaranteed by construction any more and the last player is not
 * simply "the rest". That is on purpose: everybody counting is the point, and the
 * gap between what was counted and what is on the table is a fact worth seeing,
 * not a bug to be hidden.
 *
 * Everything is in chip units (integers), so nothing lands half a cent off.
 */

/**
 * What is left for the players who have not counted yet, before `current` enters
 * anything. Can go negative when the table has counted more than it bought in —
 * which is exactly the case the difference card exists for.
 */
export function poolLeft(
  total: number,
  entered: Readonly<Record<string, number>>,
  counted: Iterable<string>,
  current?: string,
): number {
  let used = 0;
  for (const id of counted) {
    if (id === current) continue;
    used += Math.max(0, Math.round(entered[id] ?? 0));
  }
  return Math.round(total) - used;
}

/**
 * Where the bar starts for the player now holding the phone: an even cut of what is
 * left, on the drag grid. The last player therefore opens on the whole remainder —
 * the number they would have been given automatically — and can then count it and
 * disagree.
 */
export function suggestedShare(pool: number, uncounted: number, step: number): number {
  if (uncounted <= 1) return Math.max(0, pool);
  const grid = Math.max(1, Math.round(step));
  const each = Math.max(0, pool) / uncounted;
  return Math.max(0, Math.round(each / grid) * grid);
}

/** Counted minus what is on the table. Positive: the table counted too much. */
export function difference(total: number, entered: Readonly<Record<string, number>>): number {
  const sum = Object.values(entered).reduce((s, v) => s + Math.max(0, Math.round(v)), 0);
  return sum - Math.round(total);
}

/**
 * Rub the difference out proportionally: everyone keeps their share of what was
 * counted, and the stacks add up to the table again. The alternative offered next to
 * it is to keep the counted numbers as they are — stacks are an overview figure and
 * never feed the settlement (see PlayerRoster), so a table that counted €3 too much
 * is allowed to say so.
 */
export function settleDifference(
  entered: Readonly<Record<string, number>>,
  order: readonly string[],
  total: number,
  step: number,
): Record<string, number> {
  const weights = order.map((id) => Math.max(0, Math.round(entered[id] ?? 0)));
  const parts = spreadOnStep(weights, Math.max(0, Math.round(total)), Math.max(1, Math.round(step)));
  return Object.fromEntries(order.map((id, i) => [id, parts[i]]));
}
