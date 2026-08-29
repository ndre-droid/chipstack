import assert from 'node:assert/strict';
import {
  COLUMN_CHIPS,
  MAX_PX_PER_CHIP,
  MIN_PX_PER_CHIP,
  calibrate,
  chipsAt,
  isCalibrated,
  rulerCapacity,
  rulerTotal,
  spanFor,
} from './chipRuler.ts';

/**
 * The ruler's whole claim is that one calibration replaces device DPI. That only
 * holds if a bad calibration is REFUSED rather than rounded into something
 * plausible — an accepted mis-drag would miscount every stack afterwards without
 * ever looking wrong.
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

/** a ceramic chip on a typical phone: 3.3 mm at 160 CSS px/inch */
const REAL = 20.8;

console.log('\ncalibration takes a real column and refuses a mis-drag');
{
  const px = calibrate(REAL * COLUMN_CHIPS, COLUMN_CHIPS);
  check('a 20-chip column calibrates', px !== null && Math.abs(px - REAL) < 1e-9, String(px));
  check('a drag of nothing is refused', calibrate(0, 20) === null);
  check('zero chips is refused', calibrate(400, 0) === null);
  check('negative chips is refused', calibrate(400, -20) === null);
  check('NaN is refused', calibrate(Number.NaN, 20) === null);
  // 2 px across 20 chips: the bar was never really moved
  check('too small is refused', calibrate(2 * 20, 20) === null);
  // the full screen claimed as 3 chips
  check('too large is refused', calibrate(700, 3) === null);
  check('exactly the lower bound is kept', calibrate(MIN_PX_PER_CHIP * 20, 20) === MIN_PX_PER_CHIP);
  check('exactly the upper bound is kept', calibrate(MAX_PX_PER_CHIP * 20, 20) === MAX_PX_PER_CHIP);
}

console.log('\nan uncalibrated ruler measures nothing at all');
{
  check('undefined is not calibrated', !isCalibrated(undefined));
  check('null is not calibrated', !isCalibrated(null));
  check('zero is not calibrated', !isCalibrated(0));
  check('a real value is calibrated', isCalibrated(REAL));
  // the important one: no calibration must never yield a confident number
  check('no calibration counts zero chips', chipsAt(400, 0) === 0);
  check('no calibration spans zero px', spanFor(17, 0) === 0);
  check('no calibration has no capacity', rulerCapacity(550, 0) === 0);
}

console.log('\na length reads back as the count that made it');
{
  for (const n of [1, 5, 12, 17, 20, 26]) {
    check(`${n} chips round-trips`, chipsAt(spanFor(n, REAL), REAL) === n);
  }
  check('an empty ladder is no chips', chipsAt(0, REAL) === 0);
  check('a drag above the baseline is not negative', chipsAt(-50, REAL) === 0);
  // nearest, not floor: a column read a hair short is still that column
  check('rounds to the nearest chip, not down', chipsAt(REAL * 17 - REAL * 0.4, REAL) === 17);
  check('rounds up past the halfway mark', chipsAt(REAL * 17 + REAL * 0.6, REAL) === 18);
}

console.log('\nthe ladder holds about a column and change');
{
  const cap = rulerCapacity(550, REAL);
  check('a phone ladder measures 20+', cap >= 20, String(cap));
  check('and not absurdly more', cap < 40, String(cap));
  check('no ladder, no capacity', rulerCapacity(0, REAL) === 0);
}

console.log('\nthe total adds the eye-counted columns to the measured remainder');
{
  check(
    'two columns plus seventeen',
    rulerTotal({ columns: 2, columnSize: 20, measured: 17 }) === 57,
  );
  check('no columns is just the measurement', rulerTotal({ columns: 0, columnSize: 20, measured: 8 }) === 8);
  check(
    'nothing measured is just the columns',
    rulerTotal({ columns: 3, columnSize: 20, measured: 0 }) === 60,
  );
  check(
    'never more of a colour than the box holds',
    rulerTotal({ columns: 9, columnSize: 20, measured: 15, inventory: 100 }) === 100,
  );
  check(
    'an unknown inventory does not clamp to zero',
    rulerTotal({ columns: 2, columnSize: 20, measured: 5, inventory: 0 }) === 45,
  );
  check(
    'a negative measurement cannot eat the columns',
    rulerTotal({ columns: 2, columnSize: 20, measured: -100 }) === 40,
  );
}

console.log(failures ? `\nchipRuler: ${failures} FAILED` : '\nchipRuler: all checks passed');
assert.equal(failures, 0);
