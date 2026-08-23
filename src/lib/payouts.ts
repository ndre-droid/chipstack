/**
 * How the prize pool is split in a tournament.
 *
 * Lives here rather than inside the big screen because the phone needs the same
 * answer — the person holding the cash is looking at the phone, not the TV — and
 * because the split is now editable: how many places get paid, and what each gets.
 */
export interface Payout {
  /** 1-based finishing position */
  place: number;
  /** share of the pool, 0..1 */
  pct: number;
  amount: number;
}

/** The usual home-game splits: more runners, more places paid. */
export function defaultSplit(entrants: number): number[] {
  if (entrants <= 3) return [1];
  if (entrants <= 5) return [0.65, 0.35];
  if (entrants <= 8) return [0.5, 0.3, 0.2];
  return [0.45, 0.27, 0.18, 0.1];
}

/** Force a list of shares to be positive and add up to exactly 1. */
export function normaliseSplit(split: number[]): number[] {
  const clean = split.map((p) => Math.max(0, p)).filter((p) => p > 0);
  const total = clean.reduce((s, p) => s + p, 0);
  if (!clean.length || total <= 0) return [1];
  return clean.map((p) => p / total);
}

/**
 * Turn a pool into what each place actually receives.
 *
 * The lower places are rounded and FIRST place takes the remainder, so the figures
 * on screen always add up to the pool. Rounding each share on its own left a euro
 * unaccounted for at the table (€65 as 33/20/13 = €66), and the person holding the
 * pot is the one who has to explain the difference.
 */
export function payoutsFor(pool: number, entrants: number, custom?: number[] | null): Payout[] {
  const split = normaliseSplit(custom?.length ? custom : defaultSplit(Math.max(1, entrants)));
  const rest = split.slice(1).map((p) => Math.round(pool * p * 100) / 100);
  const first = Math.round((pool - rest.reduce((s, a) => s + a, 0)) * 100) / 100;
  return [first, ...rest].map((amount, i) => ({ place: i + 1, pct: split[i], amount }));
}

/**
 * The bubble: the best finish that wins nothing. Null when everybody is paid (or
 * when there is nobody left to bubble).
 */
export function bubblePlace(entrants: number, paidPlaces: number): number | null {
  return paidPlaces < entrants ? paidPlaces + 1 : null;
}

/** Resize a split to `places`, keeping the existing shape where it can. */
export function resizeSplit(split: number[], places: number): number[] {
  const n = Math.max(1, Math.min(9, Math.round(places)));
  if (n === split.length) return normaliseSplit(split);
  if (n < split.length) return normaliseSplit(split.slice(0, n));
  // new places come in at half the smallest existing share — a long tail, not a
  // sudden equal cut that would rewrite what first place gets
  const out = [...split];
  while (out.length < n) out.push(Math.max(0.02, out[out.length - 1] / 2));
  return normaliseSplit(out);
}
