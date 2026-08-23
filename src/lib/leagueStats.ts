import type { LeagueGame } from '../types';

/**
 * What the saved nights add up to.
 *
 * The league table already ranks people by profit. This is the rest of the story —
 * the biggest night, the longest run of wins, who has funded whom — because that is
 * what actually gets talked about, and every one of those numbers is already sitting
 * in the saved games waiting to be counted.
 */
export interface PlayerStats {
  key: string;
  name: string;
  nights: number;
  buyIn: number;
  cashOut: number;
  net: number;
  roi: number;
  wins: number;
  /** best and worst single night, by net */
  best: { net: number; date: number } | null;
  worst: { net: number; date: number } | null;
  /** current run, positive for winning nights, negative for losing ones */
  streak: number;
  /** longest winning run this season */
  bestStreak: number;
  /** average result per night */
  average: number;
}

export interface SeasonStats {
  players: PlayerStats[];
  nights: number;
  totalPot: number;
  /** the player who has lost the most across the season — said kindly */
  donor: PlayerStats | null;
  /** the player who has won the most */
  shark: PlayerStats | null;
  /** most nights played */
  mostLoyal: PlayerStats | null;
  /** single biggest night anybody has had */
  biggestNight: { name: string; net: number; date: number } | null;
}

const key = (name: string) => name.trim().toLowerCase() || 'player';
const round = (n: number) => Math.round(n * 100) / 100;

export function seasonStats(league: LeagueGame[]): SeasonStats {
  const games = [...league].sort((a, b) => a.date - b.date);
  const by = new Map<string, PlayerStats>();

  for (const g of games) {
    // the night's winner is whoever came out furthest ahead — used for the streaks
    const nets = g.players.map((p) => ({ name: p.name, net: (p.cashOut || 0) - (p.buyIn || 0) }));
    const top = nets.reduce<{ name: string; net: number } | null>((b, n) => (!b || n.net > b.net ? n : b), null);

    for (const p of g.players) {
      const k = key(p.name);
      const s =
        by.get(k) ??
        ({
          key: k,
          name: p.name || 'Player',
          nights: 0,
          buyIn: 0,
          cashOut: 0,
          net: 0,
          roi: 0,
          wins: 0,
          best: null,
          worst: null,
          streak: 0,
          bestStreak: 0,
          average: 0,
        } satisfies PlayerStats);

      const net = round((p.cashOut || 0) - (p.buyIn || 0));
      s.nights += 1;
      s.buyIn = round(s.buyIn + (p.buyIn || 0));
      s.cashOut = round(s.cashOut + (p.cashOut || 0));
      s.net = round(s.cashOut - s.buyIn);
      if (!s.best || net > s.best.net) s.best = { net, date: g.date };
      if (!s.worst || net < s.worst.net) s.worst = { net, date: g.date };
      if (top && key(top.name) === k && top.net > 0) s.wins += 1;

      // a run of winning nights, or of losing ones — sign carries which
      if (net > 0) s.streak = s.streak > 0 ? s.streak + 1 : 1;
      else if (net < 0) s.streak = s.streak < 0 ? s.streak - 1 : -1;
      else s.streak = 0;
      s.bestStreak = Math.max(s.bestStreak, s.streak);

      by.set(k, s);
    }
  }

  const players = [...by.values()];
  for (const s of players) {
    s.roi = s.buyIn > 0 ? s.net / s.buyIn : 0;
    s.average = s.nights > 0 ? round(s.net / s.nights) : 0;
  }
  players.sort((a, b) => b.net - a.net);

  const biggestNight = players.reduce<SeasonStats['biggestNight']>((best, s) => {
    if (!s.best) return best;
    return !best || s.best.net > best.net ? { name: s.name, net: s.best.net, date: s.best.date } : best;
  }, null);

  return {
    players,
    nights: games.length,
    totalPot: round(games.reduce((sum, g) => sum + g.players.reduce((a, p) => a + (p.buyIn || 0), 0), 0)),
    shark: players.length && players[0].net > 0 ? players[0] : null,
    donor: players.length && players[players.length - 1].net < 0 ? players[players.length - 1] : null,
    mostLoyal: players.length ? [...players].sort((a, b) => b.nights - a.nights)[0] : null,
    biggestNight,
  };
}

export interface HeadToHead {
  nights: number;
  /** how many of the shared nights each finished ahead of the other */
  aAhead: number;
  bAhead: number;
  /** the difference in their totals across the nights they both played */
  swing: number;
}

/** Two players, only across the nights they both played. */
export function headToHead(league: LeagueGame[], nameA: string, nameB: string): HeadToHead {
  const a = key(nameA);
  const b = key(nameB);
  let nights = 0;
  let aAhead = 0;
  let bAhead = 0;
  let swing = 0;
  for (const g of league) {
    const pa = g.players.find((p) => key(p.name) === a);
    const pb = g.players.find((p) => key(p.name) === b);
    if (!pa || !pb) continue;
    nights++;
    const na = (pa.cashOut || 0) - (pa.buyIn || 0);
    const nb = (pb.cashOut || 0) - (pb.buyIn || 0);
    if (na > nb) aAhead++;
    else if (nb > na) bAhead++;
    swing = round(swing + na - nb);
  }
  return { nights, aAhead, bAhead, swing };
}
