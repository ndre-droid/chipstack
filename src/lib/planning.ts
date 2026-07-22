import type { Denomination, BlindLevel } from '../types';

const uid = () => Math.random().toString(36).slice(2, 9);

/**
 * Suggest a blind ladder that fits the chips you own.
 *
 * Each level's small blind is anchored to one of your denominations (so the base
 * chip is always a real chip you can post with), starting at a level that gives a
 * roughly `targetStartBB`-deep stack and climbing in clean, chip-friendly steps.
 */
export function suggestBlindLadder(
  denoms: Denomination[],
  buyInUnits: number,
  opts?: { targetStartBB?: number; maxLevels?: number },
): BlindLevel[] {
  const targetStartBB = opts?.targetStartBB ?? 100;
  const maxLevels = opts?.maxLevels ?? 9;
  const vals = [...new Set(denoms.filter((d) => d.enabled && d.value > 0).map((d) => d.value))].sort(
    (a, b) => a - b,
  );
  if (!vals.length || buyInUnits <= 0) return [];

  const smallest = vals[0];
  // Start level: the denomination whose starting depth is closest to the target.
  const depth = (v: number) => buyInUnits / (2 * v);
  const startSB = vals.reduce(
    (best, v) => (Math.abs(depth(v) - targetStartBB) < Math.abs(depth(best) - targetStartBB) ? v : best),
    smallest,
  );

  // Ceiling so blinds don't exceed ~half a buy-in of small blind (deep-late game).
  const ceiling = Math.max(startSB, buyInUnits / 4);
  const anchors = vals.filter((v) => v >= startSB && v <= ceiling);
  if (!anchors.length) anchors.push(startSB);

  const sbs: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    sbs.push(a);
    const b = anchors[i + 1];
    if (b) {
      const ratio = b / a;
      if (ratio >= 4) {
        for (const m of [2, 3]) if (a * m < b) sbs.push(a * m);
      } else if (ratio > 2.6) {
        if (a * 2 < b) sbs.push(a * 2);
      }
    }
  }
  // Continue past the top anchor with multiples of it, up to the ceiling / maxLevels.
  const top = anchors[anchors.length - 1];
  for (let m = 2; sbs.length < maxLevels && top * m <= ceiling; m++) sbs.push(top * m);

  const uniq = [...new Set(sbs)]
    .filter((v) => v >= smallest)
    .sort((a, b) => a - b)
    .slice(0, maxLevels);

  return uniq.map((sb) => ({ id: uid(), smallBlind: sb, bigBlind: sb * 2, ante: 0 }));
}

/** One denomination being coloured up (raced off) at a blind level. */
export interface Retirement {
  fromId: string;
  fromValue: number;
  toId: string | null;
  toValue: number;
  ratio: number; // how many `from` chips make one `to` chip (if clean)
  ratioClean: boolean;
  perPlayerCount: number;
  tableCount: number;
  tableValue: number;
  bigOut: number; // whole `to` chips handed out for the table's worth
  raceChips: number; // leftover `from` chips that go to the race
  bankHave: number;
  feasible: boolean;
}

export interface ColorUpEvent {
  levelIndex: number;
  blind: BlindLevel;
  retirements: Retirement[];
}

/**
 * Work out the colour-up / chip-race steps as blinds climb: at each later level,
 * any denomination now smaller than the small blind is retired and exchanged for
 * the smallest still-valid chip that it divides into cleanly.
 */
export function colorUpEvents(
  startCounts: Record<string, number>,
  denoms: Denomination[],
  blindLevels: BlindLevel[],
  startIdx: number,
  numPlayers: number,
): ColorUpEvent[] {
  // Running table-level counts, evolved as we race chips up. Chips created by an
  // earlier colour-up (e.g. 10s → 50s) are counted when that bigger chip is later
  // retired in turn.
  const onTable: Record<string, number> = {};
  denoms.forEach((d) => (onTable[d.id] = (startCounts[d.id] || 0) * numPlayers));

  const byValueAsc = [...denoms].sort((a, b) => a.value - b.value);
  const retired = new Set<string>();
  const events: ColorUpEvent[] = [];

  for (let i = startIdx + 1; i < blindLevels.length; i++) {
    const blind = blindLevels[i];
    const newSB = blind.smallBlind;
    const obsolete = byValueAsc.filter((d) => onTable[d.id] > 0 && !retired.has(d.id) && d.value < newSB);
    if (!obsolete.length) continue;

    const retirements: Retirement[] = obsolete.map((r) => {
      retired.add(r.id);
      const clean = denoms
        .filter((d) => d.value >= newSB && d.value % r.value === 0)
        .sort((a, b) => a.value - b.value);
      const any = denoms.filter((d) => d.value >= newSB).sort((a, b) => a.value - b.value);
      const t = clean[0] ?? any[0] ?? null;
      const toValue = t ? t.value : 0;
      const tableCount = onTable[r.id];
      const tableValue = tableCount * r.value;
      const bigOut = toValue > 0 ? Math.floor(tableValue / toValue) : 0;
      const raceValue = tableValue - bigOut * toValue;
      const raceChips = Math.round(raceValue / r.value);

      // bank must own enough of `t` beyond what's already on the table
      const onTableTargetBefore = t ? onTable[t.id] : 0;
      const feasible = t ? onTableTargetBefore + bigOut <= t.count : false;

      // evolve the table: small chips leave, big chips arrive
      onTable[r.id] = 0;
      if (t) onTable[t.id] += bigOut + Math.round(raceValue / toValue);

      return {
        fromId: r.id,
        fromValue: r.value,
        toId: t ? t.id : null,
        toValue,
        ratio: toValue > 0 ? toValue / r.value : 0,
        ratioClean: toValue > 0 && toValue % r.value === 0,
        perPlayerCount: startCounts[r.id],
        tableCount,
        tableValue,
        bigOut,
        raceChips,
        bankHave: t ? t.count : 0,
        feasible,
      };
    });

    events.push({ levelIndex: i, blind, retirements });
  }
  return events;
}
