import assert from 'node:assert/strict';
import { CHIP_SET_PRESETS, denomsFromPreset } from './chipSetPresets.ts';
import { UNIT_VALUES, fitAtUnit, suggestUnitValue } from './unitValue.ts';
import type { Denomination, SessionConfig } from '../types.ts';

/**
 * The bug this exists to stop, seen for real the moment the first-run wizard began
 * asking which box is on the table: a Dice 300 case, a €20 buy-in, and the app's
 * default of one point per cent. Six players want 2000 points each out of fifty
 * hundreds, and the very first screen a new user sees is a red line saying the
 * buy-in cannot be matched.
 *
 * And the rule that keeps it safe: a unit that already works is NEVER changed. A
 * unit value is the meaning of every number in the app.
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

let seq = 0;
const nextId = () => `d${++seq}`;
const setOf = (id: string): Denomination[] => {
  const preset = CHIP_SET_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  return denomsFromPreset(preset, nextId);
};

const session = (buyIn: number): Pick<SessionConfig, 'buyIn' | 'smallBias' | 'maxDenoms' | 'useAllChips' | 'excludedDenoms'> => ({
  buyIn,
  smallBias: 0.9,
  maxDenoms: 0,
  useAllChips: false,
  excludedDenoms: [],
});

console.log('\na 300-piece dice case is not a 500-piece ceramic set');
{
  const dice = setOf('dice300');
  const stacks = 8; // six players and two planned rebuys

  const atCent = fitAtUnit(dice, session(20), stacks, null, 0.01);
  check('one point per cent does not fit that box', !atCent.works, `chips ${atCent.chipCount}`);

  const picked = suggestUnitValue(dice, session(20), stacks, null, 0.01);
  check('so a different unit is suggested', picked !== 0.01, String(picked));
  check('one that is on the money-mapping list', (UNIT_VALUES as readonly number[]).includes(picked));
  const after = fitAtUnit(dice, session(20), stacks, null, picked);
  check('and one the box can actually build', after.works, `unit ${picked}, chips ${after.chipCount}`);
  check('with a stack a person can hold', after.chipCount > 0 && after.chipCount <= 80, String(after.chipCount));
}

console.log('\na setup that works is left exactly as it is');
{
  const nash = setOf('nash');
  const stacks = 8;
  const atCent = fitAtUnit(nash, session(20), stacks, null, 0.01);
  check('the ceramic set does fit at one point per cent', atCent.works, `chips ${atCent.chipCount}`);
  check(
    'so the unit is not touched, however the stack looks',
    suggestUnitValue(nash, session(20), stacks, null, 0.01) === 0.01,
  );
  // ...including a unit that is not the app default
  check(
    'and a table already on 10c points keeps them',
    suggestUnitValue(nash, session(20), stacks, null, 0.1) === 0.1,
  );
}

console.log('\nnothing to go on: say nothing');
{
  const nash = setOf('nash');
  check('no buy-in yet', suggestUnitValue(nash, session(0), 8, null, 0.01) === 0.01);
  check('an empty box', suggestUnitValue([], session(20), 8, null, 0.01) === 0.01);
  check(
    'a box with no chips left in it',
    suggestUnitValue(
      nash.map((d) => ({ ...d, count: 0 })),
      session(20),
      8,
      null,
      0.01,
    ) === 0.01,
  );
  /* A buy-in no unit on the list can build: the honest answer is to keep what the
     user has and let the Plan screen's warning explain, not to pick the least-bad
     unit and pretend. */
  const tiny: Denomination[] = [
    { id: 'x', value: 1000, color: '#fff', accent: '#000', count: 3, enabled: true, shape: 'chip', minPerPlayer: 0 },
  ];
  check('and a box that cannot serve the table at all', suggestUnitValue(tiny, session(7), 8, null, 0.01) === 0.01);
}

console.log(failures ? `\nunitValue: ${failures} FAILED` : '\nunitValue: all checks passed');
assert.equal(failures, 0);
