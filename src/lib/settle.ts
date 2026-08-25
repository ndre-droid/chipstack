export interface PlayerBalance {
  name: string;
  net: number; // positive = is owed money, negative = owes money
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** The ledger fields settlement cares about — keeps this file free of the store. */
export interface SettlePlayer {
  name: string;
  buyIn: number;
  cashOut: number;
  chips?: number;
  out?: boolean;
  emoji?: string;
  /** stack held right after their last buy-in — see `sinceLastBuyIn` */
  stakeChips?: number;
}

/**
 * What a player is still holding in chips, in money. A player who is `out` has
 * left the table — busted or cashed out — so they hold nothing regardless of the
 * stale chip count that may still sit on the row.
 */
export function stackMoney(p: SettlePlayer, unitValue: number): number {
  return p.out ? 0 : (p.chips || 0) * unitValue;
}

/**
 * A player's result RIGHT NOW: what came off the table plus what they are still
 * holding, minus everything they put on it.
 *
 * This is the one definition of "net" in the app. The roster, the big screen and
 * the settle-up tab all use it, so the same player can never show +€12 on one
 * screen and −€20 on another — which is exactly what happened when the settle-up
 * tab counted only `cashOut − buyIn` and ignored the stack in front of them.
 */
export function netOf(p: SettlePlayer, unitValue: number): number {
  return (p.cashOut || 0) + stackMoney(p, unitValue) - (p.buyIn || 0);
}

/**
 * How a player stands against the money they put on the table MOST RECENTLY,
 * rather than against everything they ever put on it.
 *
 * `netOf` counts every buy-in — that is the honest figure and the one that settles
 * up. But somebody who busted €40 and rebought for €45 reads as −€40 all night even
 * while they are winning with the new stack, which is not what the table sees. This
 * is that second half of the story: their stack now, minus the stack they sat down
 * with after that last buy-in.
 *
 * Null when there is nothing to say: they have left the table, or the row predates
 * this being tracked.
 */
export function sinceLastBuyIn(p: SettlePlayer, unitValue: number): number | null {
  if (p.out || p.stakeChips === undefined) return null;
  return stackMoney(p, unitValue) - p.stakeChips * unitValue;
}

/**
 * Minimise the number of payments that settle everyone up: repeatedly match the
 * biggest debtor against the biggest creditor.
 */
export function settleUp(balances: PlayerBalance[]): Transfer[] {
  const eps = 0.005;
  const debtors = balances
    .filter((b) => b.net < -eps)
    .map((b) => ({ name: b.name, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = balances
    .filter((b) => b.net > eps)
    .map((b) => ({ name: b.name, amt: b.net }))
    .sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  let guard = 0;
  while (i < debtors.length && j < creditors.length && guard++ < 10000) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > eps) out.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(pay * 100) / 100 });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt <= eps) i++;
    if (creditors[j].amt <= eps) j++;
  }
  return out;
}

export interface Settlement {
  transfers: Transfer[];
  /** every player's net, in the ledger's order */
  nets: { name: string; emoji?: string; net: number; onTable: number; settled: boolean; carried: number }[];
  /** someone is still holding chips, so these figures move until they cash out */
  provisional: boolean;
  /** money still in front of the players */
  onTable: number;
  /** cash-outs minus buy-ins once nobody is holding chips — should be 0 */
  drift: number;
  /** the nets, added up. Non-zero means the transfer list cannot settle everyone —
   *  which happens when carried-over balances have been partly paid off outside the
   *  app. Surfaced rather than silently truncated by `settleUp`. */
  imbalance: number;
}

/**
 * The whole settle-up picture from the live ledger, counting an uncashed stack as
 * what that player would take off the table right now.
 *
 * Doing it this way means "who pays whom" is answerable at ANY point in the night
 * instead of only after the last cash-out — and, crucially, it can no longer show a
 * confidently wrong split built from balances that don't add up to zero.
 */
export function settleLedger(
  players: SettlePlayer[],
  unitValue: number,
  /** unsettled balances from earlier nights, keyed by name (case-insensitive) */
  carry?: Record<string, number>,
): Settlement {
  const carryOf = (name: string) => carry?.[name.trim().toLowerCase()] ?? 0;
  const nets = players.map((p) => {
    const name = p.name || 'Player';
    const carried = carryOf(name);
    return {
      name,
      emoji: p.emoji,
      net: Math.round((netOf(p, unitValue) + carried) * 100) / 100,
      onTable: stackMoney(p, unitValue),
      settled: !!p.out,
      carried,
    };
  });
  const onTable = nets.reduce((s, n) => s + n.onTable, 0);
  const totalIn = players.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = players.reduce((s, p) => s + (p.cashOut || 0), 0);
  return {
    transfers: settleUp(nets.map((n) => ({ name: n.name, net: n.net }))),
    nets,
    provisional: onTable > 0.005,
    onTable,
    drift: Math.round((totalOut + onTable - totalIn) * 100) / 100,
    imbalance: Math.round(nets.reduce((s, n) => s + n.net, 0) * 100) / 100,
  };
}
