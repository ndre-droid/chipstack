import assert from 'node:assert/strict';
import { settleUp } from './settle.ts';
import type { PlayerBalance } from './settle.ts';

/**
 * Settlement is the last thing that happens on a poker night and the one number
 * everybody checks, so the properties that matter are asserted rather than eyeballed:
 * every payment is covered, nobody pays more than they lost, and the list is short.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n * 100) / 100;

/** What each player is left owing/owed once the transfers are applied. */
function afterTransfers(balances: PlayerBalance[]) {
  const net = new Map(balances.map((b) => [b.name, b.net]));
  for (const t of settleUp(balances)) {
    net.set(t.from, round((net.get(t.from) ?? 0) + t.amount));
    net.set(t.to, round((net.get(t.to) ?? 0) - t.amount));
  }
  return net;
}

function settlesEveryone(label: string, balances: PlayerBalance[]) {
  console.log(`\n${label}`);
  const transfers = settleUp(balances);
  console.log(
    '  ' + (transfers.map((t) => `${t.from} → ${t.to} €${t.amount}`).join(' · ') || '(nothing to settle)'),
  );

  const left = afterTransfers(balances);
  const worst = Math.max(...[...left.values()].map((n) => Math.abs(n)), 0);
  check('everyone ends up square', worst < 0.02, `worst leftover €${worst}`);

  const losers = balances.filter((b) => b.net < 0).length;
  const winners = balances.filter((b) => b.net > 0).length;
  // the greedy match needs at most one payment per player bar one
  check(
    'no more payments than players',
    transfers.length <= Math.max(0, losers + winners - 1),
    `${transfers.length} payments for ${losers} losers / ${winners} winners`,
  );

  check(
    'a loser never pays out more than they lost',
    balances
      .filter((b) => b.net < 0)
      .every((b) => sum(transfers.filter((t) => t.from === b.name).map((t) => t.amount)) <= -b.net + 0.02),
  );
  check(
    'a winner is never asked to pay',
    balances.filter((b) => b.net > 0).every((b) => !transfers.some((t) => t.from === b.name)),
  );
  return transfers;
}

settlesEveryone('one loser, one winner', [
  { name: 'Jana', net: -33 },
  { name: 'Tom', net: 33 },
]);

settlesEveryone('a normal night', [
  { name: 'Christoph', net: -20 },
  { name: 'Jana', net: -12.5 },
  { name: 'Tom', net: 5.5 },
  { name: 'Bea', net: 27 },
]);

settlesEveryone('one big winner, four small losers', [
  { name: 'A', net: -10 },
  { name: 'B', net: -10 },
  { name: 'C', net: -10 },
  { name: 'D', net: -10 },
  { name: 'E', net: 40 },
]);

const noneNeeded = settlesEveryone('everybody broke even', [
  { name: 'A', net: 0 },
  { name: 'B', net: 0 },
]);
check('nothing to pay when everyone is even', noneNeeded.length === 0, `${noneNeeded.length} payments`);

// Cents: the pot does not always divide nicely, and a stray cent must not become a
// payment of its own or go missing from someone's total.
const cents = settlesEveryone('amounts with cents', [
  { name: 'A', net: -13.34 },
  { name: 'B', net: -6.66 },
  { name: 'C', net: 20 },
]);
check('every payment is a whole number of cents', cents.every((t) => Math.abs(t.amount * 100 - Math.round(t.amount * 100)) < 1e-9));

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} settlement check(s) failed`);
