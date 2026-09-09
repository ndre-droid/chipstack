/**
 * How old a stack figure is — the number that lets the table be counted a player at
 * a time instead of all at once.
 *
 * A counting round is an event: it stops the game while the host walks the table, so
 * at a real night it does not happen. Counting ONE player costs nothing and can wait
 * for a hand you folded — but only if the app can say which stacks are old, and that
 * is the part `chipHistory` cannot answer.
 *
 * It cannot answer it because a count stamps a trail point onto every still-playing
 * player, not only the ones counted (see `LEDGER_SET_CHIPS_MANY`). That is right for
 * the sparkline — it keeps every trend line the same length and comparable — but it
 * means the newest trail point is the last BELIEF about a stack and not the last look
 * at one. `countedAt` is the look. Everything here reads that field and nothing here
 * reads the trail.
 */
import type { LedgerPlayer } from '../types';

/**
 * How long a stack figure stays believable. Twenty-five minutes is a couple of
 * orbits, which is about how long it takes for a stack to stop resembling itself.
 *
 * Per player now, where it used to describe the whole table. Not a setting: nobody
 * has played a night that asked for a different number, and a knob for an unmeasured
 * preference is a guess with a UI attached.
 */
export const STALE_MS = 25 * 60_000;

/** A player who has left the table has no age — their stack stopped moving. */
function gone(p: LedgerPlayer): boolean {
  return !!p.out || (p.cashOut || 0) > 0;
}

/**
 * What one roster row should say about its own age.
 *
 * Three outcomes rather than a nullable number, deliberately: "there is nothing to
 * show here" and "this stack has never been counted" are different facts, and
 * collapsing them into one `null` is exactly how an uncounted player ends up
 * rendering as silently fine.
 *
 * - `'hidden'` — nothing to say: the player has left the table, or their stack is
 *   still fresh. A table counted five minutes ago shows no age text at all.
 * - `'never'`  — no count has ever landed on this player.
 * - a number   — how many ms ago, past `STALE_MS`.
 */
export function rowAgeOf(p: LedgerPlayer, at: number): 'hidden' | 'never' | number {
  if (gone(p)) return 'hidden';
  if (p.countedAt === undefined) return 'never';
  const age = at - p.countedAt;
  return age < STALE_MS ? 'hidden' : Math.max(0, age);
}

/**
 * The freshness of the table as a whole — the OLDEST stack still in play, not the
 * newest.
 *
 * The newest is what the roster used to report, and it is the reading that made
 * ambient counting invisible: counting one player flipped the footer to "just now"
 * while five stacks were an hour old. A leaderboard is only as current as the
 * stalest number feeding it.
 *
 * Null means there is nothing honest to report — either nobody is in play, or
 * somebody in play has never been counted. Never-counted has to outrank every
 * timestamp here, otherwise a table with one uncounted player would quietly borrow
 * the others' freshness.
 */
export function oldestCountedAt(ledger: LedgerPlayer[]): number | null {
  let oldest: number | null = null;
  let seen = false;
  for (const p of ledger) {
    if (gone(p)) continue;
    if (p.countedAt === undefined) return null;
    seen = true;
    if (oldest === null || p.countedAt < oldest) oldest = p.countedAt;
  }
  return seen ? oldest : null;
}

/**
 * An age split into the parts a sentence needs, so the caller can put them through
 * i18n rather than receiving a pre-baked English string.
 *
 * Minutes up to an hour, whole hours after that. Counting a player at a time means a
 * stack can honestly be two hours old, and "143 min" is not a number anyone reads.
 */
export function ageLabel(ms: number): { unit: 'min' | 'h'; n: number } {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  return mins < 60 ? { unit: 'min', n: mins } : { unit: 'h', n: Math.floor(mins / 60) };
}
