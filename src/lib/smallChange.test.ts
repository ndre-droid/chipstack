import assert from 'node:assert/strict';
import { smallChangeOf } from './smallChange.ts';
import { liveBaseValue, startingStackOf } from './startingStack.ts';
import type { Denomination, SessionConfig } from '../types.ts';

/**
 * "Count the big chips only" hides colours from the user, so the two things that
 * must hold are that it hides the RIGHT ones and that the figure it substitutes is
 * the one those colours are actually worth. A drifting threshold here would quietly
 * assume away real money.
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

const set = (value: number, count: number): Denomination => ({
  id: String(value),
  value,
  color: '#888',
  accent: '#fff',
  count,
  enabled: true,
});

const unit = 0.01; // €1 = 100 points

const denoms: Denomination[] = [
  set(5, 100),
  set(10, 100),
  set(25, 100),
  set(50, 60),
  set(100, 100),
  set(500, 50),
];

const session: SessionConfig = {
  playerCount: 6,
  buyIn: 20,
  earlyRebuys: 2,
  lateRebuyAmount: 20,
  blindLevels: [
    { smallBlind: 5, bigBlind: 10 },
    { smallBlind: 25, bigBlind: 50 },
    { smallBlind: 100, bigBlind: 200 },
  ],
  startLevelIdx: 0,
  smallBias: 0.6,
  maxDenoms: 0,
  useAllChips: false,
  excludedDenoms: [],
} as SessionConfig;

console.log('\nat the starting level nothing has been left behind yet');
{
  const sc = smallChangeOf(denoms, session, unit, 0);
  check('no colours folded away', sc.denoms.length === 0, JSON.stringify(sc.denoms.map((d) => d.value)));
  check('nothing assumed', sc.units === 0, String(sc.units));
  check('the line is still reported', sc.baseValue > 0, String(sc.baseValue));
  check('and it matches the stack builder', sc.baseValue === liveBaseValue(denoms, session, 0));
}

console.log('\nonce the blinds climb, the dead colours fold in');
{
  const sc = smallChangeOf(denoms, session, unit, 2);
  const base = liveBaseValue(denoms, session, 2);
  check('the blinds moved the line up', base > liveBaseValue(denoms, session, 0), `${base}`);
  check('something is folded away', sc.denoms.length > 0, String(sc.denoms.length));
  check('every folded colour is below the line', sc.denoms.every((d) => d.value < base));
  check('nothing at or above the line is folded', !sc.denoms.some((d) => d.value >= base));
  check('smallest first', sc.denoms.every((d, i, a) => i === 0 || a[i - 1].value <= d.value));
}

console.log('\nthe assumed figure is exactly what those colours are worth');
{
  const sc = smallChangeOf(denoms, session, unit, 2);
  const start = startingStackOf(denoms, session, unit);
  const expected = sc.denoms.reduce((s, d) => s + (start.counts[d.id] ?? 0) * d.value, 0);
  check('units match the opening stack', sc.units === expected, `${sc.units} vs ${expected}`);
  check('a real amount, not zero', sc.units > 0, String(sc.units));
  // the whole justification for hiding them: they are the small half of the money
  check('and less than the stack it came from', sc.units < start.totalValue, `${sc.units}/${start.totalValue}`);
}

console.log('\nonly colours the opening stack actually handed out');
{
  const sc = smallChangeOf(denoms, session, unit, 2);
  const start = startingStackOf(denoms, session, unit);
  check('each folded colour was in the stack', sc.denoms.every((d) => (start.counts[d.id] ?? 0) > 0));
}

console.log('\nnothing to work with is not a crash');
{
  const empty = smallChangeOf([], session, unit, 2);
  check('no chips at all', empty.units === 0 && empty.denoms.length === 0);
  const noLevels = smallChangeOf(denoms, { ...session, blindLevels: [] } as SessionConfig, unit, 0);
  check('no blind structure', noLevels.units === 0 && noLevels.denoms.length === 0);
  const noLevel = smallChangeOf(denoms, session, unit);
  check('no level given falls back to the plan', noLevel.denoms.length === 0, String(noLevel.denoms.length));
}

console.log(failures ? `\nsmallChange: ${failures} FAILED` : '\nsmallChange: all checks passed');
assert.equal(failures, 0);
