import assert from 'node:assert/strict';
import { settleUp, settleLedger, netOf, sinceLastBuyIn } from './settle.ts';
import type { PlayerBalance, SettlePlayer } from './settle.ts';

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
// ---------------------------------------------------------------------------
// Mid-game settlement: a player who has not cashed out is still holding chips,
// and that stack is what they would take off the table right now. Ignoring it
// used to make every still-playing player look like a total loser AND produced a
// transfer list built from balances that did not add up to zero.
// ---------------------------------------------------------------------------
console.log('\nmid-game (nobody cashed out yet)');
const UNIT = 0.01;
const midGame: SettlePlayer[] = [
  { name: 'Nahuel', buyIn: 20, cashOut: 0, chips: 3200 },
  { name: 'Mika', buyIn: 20, cashOut: 0, chips: 1500 },
  { name: 'Jo', buyIn: 20, cashOut: 0, chips: 1300 },
];
const mid = settleLedger(midGame, UNIT);
check('a leading stack shows a profit, not minus the buy-in', netOf(midGame[0], UNIT) === 12);
check('the round is flagged provisional', mid.provisional === true);
check('money still on the table is counted', round(mid.onTable) === 60);
check('nets sum to zero', Math.abs(sum(mid.nets.map((n) => n.net))) < 0.005);
check(
  'every euro of the loss is paid to the winner',
  round(sum(mid.transfers.map((t) => t.amount))) === 12,
  mid.transfers.map((t) => `${t.from} to ${t.to} ${t.amount}`).join(' / '),
);

console.log('\none player cashed out, the rest still playing');
const partly: SettlePlayer[] = [
  { name: 'A', buyIn: 20, cashOut: 32, out: true },
  { name: 'B', buyIn: 20, cashOut: 0, chips: 1400 },
  { name: 'C', buyIn: 20, cashOut: 0, chips: 1400 },
];
const part = settleLedger(partly, UNIT);
check('a cashed-out player holds nothing more', part.nets[0].onTable === 0);
check('nets still sum to zero', Math.abs(sum(part.nets.map((n) => n.net))) < 0.005);
check('the cashed-out winner is owed exactly their profit', round(part.nets[0].net) === 12);

console.log('\nfully settled night');
const done: SettlePlayer[] = [
  { name: 'A', buyIn: 20, cashOut: 45, out: true },
  { name: 'B', buyIn: 20, cashOut: 15, out: true },
  { name: 'C', buyIn: 20, cashOut: 0, out: true },
];
const fin = settleLedger(done, UNIT);
check('a settled night is not provisional', fin.provisional === false);
check('no drift when the cash-outs match the buy-ins', fin.drift === 0);
check('a busted player owes their whole buy-in', round(fin.nets[2].net) === -20);

console.log('\nmiscounted night');
const off = settleLedger(
  [
    { name: 'A', buyIn: 20, cashOut: 50, out: true },
    { name: 'B', buyIn: 20, cashOut: 0, out: true },
  ],
  UNIT,
);
check('drift reports the missing or extra money', off.drift === 10);



console.log('\nrebought after busting');
/* 20 + 20 lost, then back in for 45. UNIT is what one chip-unit is worth, so 45 euro
   of chips is 45 / UNIT units - and that is exactly what they sat back down behind. */
const stake = 45 / UNIT;
const rebought: SettlePlayer = { name: 'A', buyIn: 85, cashOut: 0, chips: stake, stakeChips: stake };
check('the honest net counts every buy-in', round(netOf(rebought, UNIT)) === -40);
check('right after the rebuy the current stake is flat', round(sinceLastBuyIn(rebought, UNIT)!) === 0);
const won = { ...rebought, chips: 60 / UNIT };
check('winning with the new stack shows on the current stake', round(sinceLastBuyIn(won, UNIT)!) === 15);
check('and the honest net stays negative', round(netOf(won, UNIT)) === -25);
check('nothing to say once they leave', sinceLastBuyIn({ ...won, out: true }, UNIT) === null);
check('nor for a row from before this was tracked', sinceLastBuyIn({ name: 'B', buyIn: 20, cashOut: 0, chips: 10 }, UNIT) === null);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} settlement check(s) failed`);
