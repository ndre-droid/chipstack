export interface PlayerBalance {
  name: string;
  net: number; // positive = is owed money, negative = owes money
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
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
