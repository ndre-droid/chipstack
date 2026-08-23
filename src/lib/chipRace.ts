/**
 * Colouring up, live at the table.
 *
 * The Plan tab already says WHEN a chip should be retired. This is the other half:
 * standing at the table with the 10s in a pile, working out what each player gets
 * back and who wins the odd chips that don't divide.
 *
 * The casino rule is that leftovers are "raced off" with cards rather than rounded,
 * because rounding either invents money or destroys it. That is modelled exactly:
 * whole exchanges first, then the remainders decide who gets the chips that are left.
 */
export interface RaceEntry {
  id: string;
  name: string;
  /** how many of the retiring chip this player is holding */
  count: number;
}

export interface RacePlayerResult {
  id: string;
  name: string;
  count: number;
  /** big chips handed over for the whole multiples */
  exchange: number;
  /** retiring chips left over after the exchange — these go into the race */
  leftover: number;
  /** value of those leftovers, which is what the race ranks on */
  leftoverValue: number;
  /** big chips won in the race */
  won: number;
  /** exchange + won */
  total: number;
}

export interface RaceResult {
  players: RacePlayerResult[];
  /** how many retiring chips the table holds in total */
  totalChips: number;
  /** big chips handed out for whole multiples */
  exchanged: number;
  /** big chips still to distribute after the exchange — the race itself */
  raced: number;
  /** value that cannot be represented at all and stays with the shortest holders */
  remainderValue: number;
  /** how many of the retiring chip make one of the new chip, when it is exact */
  ratio: number;
  ratioClean: boolean;
}

/**
 * Work out the colour-up.
 *
 * `order` decides ties — pass a shuffled list of ids (that is the deck of cards) so
 * two players with the same leftover don't always resolve the same way. Without one,
 * ties fall to the order the players were given, which is at least stable.
 */
export function raceOff(entries: RaceEntry[], fromValue: number, toValue: number, order?: string[]): RaceResult {
  const ratio = fromValue > 0 ? toValue / fromValue : 0;
  const clean = ratio > 0 && Math.abs(ratio - Math.round(ratio)) < 1e-9;
  const live = entries.filter((e) => e.count > 0);
  const totalChips = live.reduce((s, e) => s + e.count, 0);

  if (fromValue <= 0 || toValue <= 0 || toValue <= fromValue) {
    return { players: [], totalChips, exchanged: 0, raced: 0, remainderValue: 0, ratio, ratioClean: clean };
  }

  const base: RacePlayerResult[] = live.map((e) => {
    const value = e.count * fromValue;
    const exchange = Math.floor(value / toValue);
    const leftover = e.count - Math.round((exchange * toValue) / fromValue);
    return {
      id: e.id,
      name: e.name,
      count: e.count,
      exchange,
      leftover,
      leftoverValue: leftover * fromValue,
      won: 0,
      total: exchange,
    };
  });

  const exchanged = base.reduce((s, p) => s + p.exchange, 0);
  const leftoverValue = base.reduce((s, p) => s + p.leftoverValue, 0);
  const raced = Math.floor(leftoverValue / toValue);
  const remainderValue = leftoverValue - raced * toValue;

  /* Award the raced chips biggest-remainder-first — the same order a real race
     produces on average, and the one nobody argues with. `order` breaks ties. */
  const tie = new Map((order ?? live.map((e) => e.id)).map((id, i) => [id, i]));
  const ranked = [...base].sort(
    (a, b) => b.leftoverValue - a.leftoverValue || (tie.get(a.id) ?? 0) - (tie.get(b.id) ?? 0),
  );
  for (let i = 0; i < raced; i++) {
    const p = ranked[i % ranked.length];
    p.won += 1;
    p.total = p.exchange + p.won;
  }

  return { players: base, totalChips, exchanged, raced, remainderValue, ratio, ratioClean: clean };
}

/** A shuffled list of ids, for the tie-break. Deterministic when `rand` is. */
export function drawOrder(ids: string[], rand: () => number = Math.random): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
