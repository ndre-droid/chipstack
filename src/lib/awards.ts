import type { LedgerPlayer, TimelineEvent } from '../types.ts';
import { netOf } from './settle.ts';

/**
 * The titles handed out at the end of a night.
 *
 * Every one of these is already sitting in data the app collects anyway — the
 * ledger, the counting-round trail, the timeline — and none of it was ever being
 * read back. A leaderboard says who won; this says what happened.
 */
export interface Award {
  id: string;
  icon: string;
  /** i18n key for the title */
  key: string;
  name: string;
  emoji?: string;
  /** i18n key for the one-line reason, with {amount}/{n} filled from `value` */
  detailKey: string;
  /** money for profit-shaped awards, a count for the rest */
  value: number;
}

interface Input {
  ledger: LedgerPlayer[];
  timeline: TimelineEvent[];
  unitValue: number;
  /** knockout bounty is only a thing when it is switched on */
  bounty: boolean;
}

const nameOf = (p: LedgerPlayer) => p.name || 'Player';

export function nightAwards({ ledger, timeline, unitValue, bounty }: Input): Award[] {
  if (ledger.length < 2) return [];
  const out: Award[] = [];
  const add = (a: Award) => out.push(a);

  /* Winner: the biggest result of the night. Uses the same `netOf` as the settle-up
     tab, so the trophy and the money can never disagree. */
  const byNet = [...ledger].sort((a, b) => netOf(b, unitValue) - netOf(a, unitValue));
  const winner = byNet[0];
  if (winner && netOf(winner, unitValue) > 0) {
    add({
      id: 'winner',
      icon: '🏆',
      key: 'award.winner',
      name: nameOf(winner),
      emoji: winner.emoji,
      detailKey: 'award.winnerDetail',
      value: Math.round(netOf(winner, unitValue) * 100) / 100,
    });
  }

  /* Comeback: the biggest climb from a low point, measured on the counting-round
     trail. Needs at least three counts to mean anything — two points is a line, not
     a comeback. */
  let comeback: { player: LedgerPlayer; climb: number } | null = null;
  for (const p of ledger) {
    const trail = p.chipHistory ?? [];
    if (trail.length < 3) continue;
    let low = Infinity;
    let climb = 0;
    for (const point of trail) {
      low = Math.min(low, point.chips);
      climb = Math.max(climb, point.chips - low);
    }
    const money = climb * unitValue;
    if (money > 0 && (!comeback || money > comeback.climb)) comeback = { player: p, climb: money };
  }
  if (comeback && comeback.climb > 0) {
    add({
      id: 'comeback',
      icon: '🚀',
      key: 'award.comeback',
      name: nameOf(comeback.player),
      emoji: comeback.player.emoji,
      detailKey: 'award.comebackDetail',
      value: Math.round(comeback.climb * 100) / 100,
    });
  }

  /* Most rebuys — counted from the timeline, which records every buy-in that was
     not the first one. */
  const rebuys = new Map<string, number>();
  for (const e of timeline) {
    if (e.kind !== 'buyin' || !e.name) continue;
    rebuys.set(e.name, (rebuys.get(e.name) ?? 0) + 1);
  }
  const topRebuy = [...rebuys.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRebuy && topRebuy[1] >= 2) {
    add({
      id: 'banker',
      icon: '🏦',
      key: 'award.banker',
      name: topRebuy[0],
      emoji: ledger.find((p) => nameOf(p) === topRebuy[0])?.emoji,
      detailKey: 'award.bankerDetail',
      value: topRebuy[1],
    });
  }

  /* The rock: the smallest swing across the night, for the player who barely moved.
     Only meaningful with a real trail behind it. */
  let rock: { player: LedgerPlayer; range: number } | null = null;
  for (const p of ledger) {
    const trail = p.chipHistory ?? [];
    if (trail.length < 3) continue;
    const values = trail.map((x) => x.chips);
    const range = (Math.max(...values) - Math.min(...values)) * unitValue;
    if (!rock || range < rock.range) rock = { player: p, range };
  }
  if (rock) {
    add({
      id: 'rock',
      icon: '🪨',
      key: 'award.rock',
      name: nameOf(rock.player),
      emoji: rock.player.emoji,
      detailKey: 'award.rockDetail',
      value: Math.round(rock.range * 100) / 100,
    });
  }

  /* First out. A bust event, not a cash-out: leaving early with money is not the
     same as losing it all. */
  const firstBust = timeline.find((e) => e.kind === 'bust');
  if (firstBust?.name) {
    add({
      id: 'firstout',
      icon: '💀',
      key: 'award.firstOut',
      name: firstBust.name,
      emoji: firstBust.emoji,
      detailKey: 'award.firstOutDetail',
      value: 0,
    });
  }

  /* Bounty hunter — only when bounties are switched on, otherwise the count is
     meaningless. */
  if (bounty) {
    const hunter = [...ledger].sort((a, b) => (b.knockouts || 0) - (a.knockouts || 0))[0];
    if (hunter && (hunter.knockouts || 0) > 0) {
      add({
        id: 'hunter',
        icon: '🎯',
        key: 'award.hunter',
        name: nameOf(hunter),
        emoji: hunter.emoji,
        detailKey: 'award.hunterDetail',
        value: hunter.knockouts || 0,
      });
    }
  }

  /* Deliberately NOT one title per person. Winning the night AND having clawed back
     from nothing is the best story a home game produces, and hiding half of it to
     spread the trophies around would be inventing a fairness nobody asked for. The
     order above is marquee-first, so the list reads as a story. */
  return out;
}
