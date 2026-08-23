/**
 * Side pots for an all-in.
 *
 * The one piece of poker arithmetic a home table reliably gets wrong: three players
 * all in for different amounts, and everybody argues about who can win what. The
 * rule is simple and mechanical — each pot is capped at the shortest remaining
 * stack, and only the players who could cover that cap are eligible for it — which
 * makes it exactly the kind of thing a phone should do instead of the table.
 */
export interface PotContender {
  id: string;
  name: string;
  /** everything this player has put in on this hand, in money or chips — one unit */
  committed: number;
  /** folded players still lose what they put in, but can't win any of it back */
  folded?: boolean;
}

export interface Pot {
  /** 0 = the main pot, then side pots outward */
  index: number;
  amount: number;
  /** names that can win this pot, in the order they were given */
  eligible: string[];
  /** what each contributing player put into THIS pot */
  perPlayer: number;
}

export interface SidePotResult {
  pots: Pot[];
  total: number;
  /** money a player put in that nobody could match, handed straight back */
  uncalled: { name: string; amount: number } | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Split what everyone committed into a main pot and its side pots.
 *
 * Contenders may include folded players: their chips are in the pot (and belong in
 * the layers they reached) but they can never be listed as eligible to win it.
 */
export function sidePots(contenders: PotContender[]): SidePotResult {
  const live = contenders.filter((c) => c.committed > 0);
  const total = round(live.reduce((s, c) => s + c.committed, 0));
  if (!live.length) return { pots: [], total: 0, uncalled: null };

  /* The last layer is uncalled when only ONE player reached it: nobody could match
     that bet, so it never becomes a pot — it goes straight back. Working this out
     first keeps it out of the layer loop, where it would look like a one-player
     side pot worth winning. */
  const sortedDesc = [...live].sort((a, b) => b.committed - a.committed);
  let uncalled: SidePotResult['uncalled'] = null;
  const contributions = new Map(live.map((c) => [c.id, c.committed]));
  if (sortedDesc.length > 1 && sortedDesc[0].committed > sortedDesc[1].committed) {
    const back = round(sortedDesc[0].committed - sortedDesc[1].committed);
    uncalled = { name: sortedDesc[0].name, amount: back };
    contributions.set(sortedDesc[0].id, sortedDesc[1].committed);
  } else if (sortedDesc.length === 1) {
    uncalled = { name: sortedDesc[0].name, amount: round(sortedDesc[0].committed) };
    contributions.set(sortedDesc[0].id, 0);
  }

  // every distinct commitment level is the cap of one pot layer
  const caps = [...new Set([...contributions.values()].filter((v) => v > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previous = 0;
  for (const cap of caps) {
    const layer = round(cap - previous);
    const inLayer = live.filter((c) => (contributions.get(c.id) ?? 0) >= cap);
    const amount = round(layer * inLayer.length);
    if (amount > 0) {
      pots.push({
        index: pots.length,
        amount,
        perPlayer: layer,
        eligible: inLayer.filter((c) => !c.folded).map((c) => c.name),
      });
    }
    previous = cap;
  }
  return { pots, total, uncalled };
}
