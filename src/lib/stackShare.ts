/**
 * The counting round as a division of ONE known pot.
 *
 * The old round asked for six independent numbers and then told you they didn't add
 * up. But the money on the table is not unknown — it is exactly what was bought in
 * minus what was cashed out. So the only real question is how that pot is *split*,
 * and a split can be dragged instead of typed: push one player's bar up and the
 * others give way. The sum then cannot drift, which is why there is no difference
 * check anywhere near this file.
 *
 * Everything here works in chip units (integers) so the total is hit exactly, never
 * "off by a cent" after a rounding pass.
 */

/**
 * Split `amount` over `weights` proportionally, in whole units, so the parts add up
 * to exactly `amount`. Largest-remainder: the leftovers go to the rows that were
 * cut hardest, biggest first, so nobody loses a unit twice.
 *
 * All-zero weights split evenly — the sensible reading of "nobody has anything yet".
 */
function spread(weights: readonly number[], amount: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const raw =
    sum > 0 ? weights.map((w) => (Math.max(0, w) / sum) * amount) : weights.map(() => amount / n);

  const out = raw.map(Math.floor);
  let left = amount - out.reduce((s, v) => s + v, 0);
  const byFraction = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < byFraction.length; k++, left--) out[byFraction[k].i]++;
  return out;
}

/**
 * The same split, but landing on whole drag steps.
 *
 * A share worked out to the cent reads as noise on a screen whose whole premise is
 * an eyeballed estimate — "€28.92" claims a precision nobody measured. So the rows
 * are handed out in step-sized blocks and the odd remainder goes to the biggest
 * stack, where it is proportionally smallest. The sum is still exact.
 */
export function spreadOnStep(weights: readonly number[], amount: number, step: number): number[] {
  if (step <= 1 || weights.length === 0) return spread(weights, amount);
  const out = spread(weights, Math.floor(amount / step)).map((b) => b * step);
  const left = amount - out.reduce((s, v) => s + v, 0);
  if (left > 0) {
    let biggest = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[biggest]) biggest = i;
    out[biggest] += left;
  }
  return out;
}

/**
 * Re-split the pot so the rows add up to `total` again.
 *
 * - `driver` is the row the finger is on: it gets what it asked for (clamped to what
 *   is actually left) and everyone else absorbs the rest.
 * - Pinned rows are the ones already set this round; they keep their value and the
 *   movement is taken out of the untouched rows instead.
 * - `step` keeps the rows on round money instead of on cent-exact fractions.
 * - When there is nowhere else to give — every other row pinned, or the pins already
 *   claim more than the table holds — the pins yield rather than the total breaking.
 *   The total is the one invariant here; a pin is only a preference.
 *
 * Called on every drag frame, so it stays O(n) with n = players at the table.
 */
export function rebalance(
  shares: Readonly<Record<string, number>>,
  order: readonly string[],
  pinned: ReadonlySet<string>,
  total: number,
  driver?: string,
  step = 1,
): Record<string, number> {
  const pot = Math.max(0, Math.round(total));
  const at = (id: string) => Math.max(0, Math.round(shares[id] ?? 0));
  if (order.length === 0) return {};

  const others = order.filter((id) => id !== driver);
  let pool = others.filter((id) => !pinned.has(id));
  if (pool.length === 0) pool = others;
  let fixed = others.filter((id) => !pool.includes(id));
  let fixedSum = fixed.reduce((s, id) => s + at(id), 0);
  // the pins want more than exists: drop them all rather than miss the total
  if (fixedSum > pot) {
    pool = others;
    fixed = [];
    fixedSum = 0;
  }

  const room = pot - fixedSum;
  const out: Record<string, number> = {};
  for (const id of fixed) out[id] = at(id);

  if (driver) {
    // a lone row holds the whole table by definition — there is nobody to give to
    out[driver] = pool.length === 0 ? room : Math.min(at(driver), room);
  }
  const rest = room - (driver ? out[driver] : 0);
  const parts = spreadOnStep(pool.map(at), rest, Math.max(1, Math.round(step)));
  pool.forEach((id, i) => {
    out[id] = parts[i];
  });
  return out;
}

/** Nice round money amounts a person would say out loud. */
const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000];

/**
 * How far one drag step moves a bar. Aimed at roughly 120 stops across the whole
 * table, then rounded to a money amount that reads as a number rather than as an
 * artefact — €5 on a €340 table, not €2.83. The round is an overview; a finer step
 * would only promise a precision the eyeball estimate behind it does not have.
 */
export function shareStep(totalUnits: number, unitValue: number): number {
  const money = Math.max(0, totalUnits) * (unitValue > 0 ? unitValue : 0.01);
  if (money <= 0) return 1;
  const target = money / 120;
  const nice = NICE_STEPS.find((n) => n >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];
  return Math.max(1, Math.round(nice / (unitValue > 0 ? unitValue : 0.01)));
}
