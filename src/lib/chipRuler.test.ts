import assert from 'node:assert/strict';
import {
  CALIBRATION_STEPS,
  MAX_PX_PER_CHIP,
  MAX_ZERO_PX,
  MIN_PX_PER_CHIP,
  calibrate,
  chipsAt,
  isCalibrated,
  minMeasurable,
  rulerCapacity,
  spanFor,
  stacksTotal,
} from './chipRuler.ts';

/**
 * The ruler's whole claim is that two drags replace device DPI. That only holds if a
 * bad calibration is REFUSED rather than rounded into something plausible — an
 * accepted mis-drag would miscount every stack afterwards without ever looking wrong.
 *
 * The offset is the part standing the phone on the table introduced, and it is not a
 * detail: it puts the first few chips of every stack below the screen, which is a
 * fact the sheet has to be told about rather than left to discover.
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
const PX = 20.8;
/** a case bottom plus a bezel: about 11 mm of table below the glass */
const ZERO = 70;
/** what the two calibration drags would read for a stack of n */
const yFor = (n: number) => n * PX - ZERO;

const [TALL, SHORT] = CALIBRATION_STEPS;
const good = calibrate({ y: yFor(TALL), chips: TALL }, { y: yFor(SHORT), chips: SHORT });

console.log('\ntwo stacks of known height give the scale AND the offset');
{
  check('it calibrates', good !== null);
  check('chip height recovered', !!good && Math.abs(good.px - PX) < 1e-9, String(good?.px));
  check('table offset recovered', !!good && Math.abs(good.zeroPx - ZERO) < 1e-9, String(good?.zeroPx));
  check('and it is accepted', isCalibrated(good));
}

console.log('\none drag cannot answer two questions, and nor can a bad pair');
{
  check('the same stack twice is refused', calibrate({ y: 300, chips: 20 }, { y: 300, chips: 20 }) === null);
  check('shorter stack reading taller is refused', calibrate({ y: 100, chips: 20 }, { y: 200, chips: 5 }) === null);
  check('a stack of nothing is refused', calibrate({ y: 300, chips: 20 }, { y: 0, chips: 0 }) === null);
  check('NaN is refused', calibrate({ y: Number.NaN, chips: 20 }, { y: 40, chips: 5 }) === null);
  // 2 px a chip: the bar was never really moved between the two drags
  check('chips too thin to be chips', calibrate({ y: 40, chips: 20 }, { y: 10, chips: 5 }) === null);
  // the whole screen claimed as three chips
  check('chips too thick to be chips', calibrate({ y: 700, chips: 5 }, { y: 100, chips: 2 }) === null);
  // both drags high on the screen: implies the table is ABOVE the glass
  check(
    'a table above the screen is refused',
    calibrate({ y: 20 * PX + 200, chips: 20 }, { y: 5 * PX + 200, chips: 5 }) === null,
  );
  check(
    'an absurd offset is refused',
    calibrate({ y: 20 * PX - MAX_ZERO_PX - 50, chips: 20 }, { y: 5 * PX - MAX_ZERO_PX - 50, chips: 5 }) === null,
  );
}

console.log('\nthe bounds themselves are inside, not outside');
{
  const lo = calibrate({ y: 20 * MIN_PX_PER_CHIP, chips: 20 }, { y: 5 * MIN_PX_PER_CHIP, chips: 5 });
  check('the thinnest allowed chip calibrates', lo !== null && lo.px === MIN_PX_PER_CHIP);
  const hi = calibrate({ y: 20 * MAX_PX_PER_CHIP, chips: 20 }, { y: 5 * MAX_PX_PER_CHIP, chips: 5 });
  check('the thickest allowed chip calibrates', hi !== null && hi.px === MAX_PX_PER_CHIP);
  check('a flat table (no case, no bezel) is fine', lo !== null && lo.zeroPx === 0);
}

console.log('\nan uncalibrated ruler measures nothing at all');
{
  check('undefined is not calibrated', !isCalibrated(undefined));
  check('null is not calibrated', !isCalibrated(null));
  check('a zero chip height is not calibrated', !isCalibrated({ px: 0, zeroPx: 70 }));
  check('a negative offset is not calibrated', !isCalibrated({ px: PX, zeroPx: -1 }));
  // the important one: no calibration must never yield a confident number
  check('no calibration counts zero chips', chipsAt(400, null) === 0);
  check('no calibration spans zero px', spanFor(17, null) === 0);
  check('no calibration has no horizon', minMeasurable(null) === 0);
  check('no calibration has no capacity', rulerCapacity(550, null) === 0);
}

console.log('\na length reads back as the count that made it');
{
  for (const n of [4, 5, 12, 17, 20, 26]) {
    check(`${n} chips round-trips`, chipsAt(spanFor(n, good), good) === n);
  }
  check('the bar on the baseline is the horizon, not zero', chipsAt(0, good) === Math.round(ZERO / PX));
  check('a drag below the baseline is not negative', chipsAt(-500, good) === 0);
  // nearest, not floor: a stack read a hair short is still that stack
  check('rounds to the nearest chip', chipsAt(yFor(17) - PX * 0.4, good) === 17);
  check('rounds up past the halfway mark', chipsAt(yFor(17) + PX * 0.6, good) === 18);
}

console.log('\nthe first chips are under the table edge, and the sheet is told so');
{
  const min = minMeasurable(good);
  check('the horizon is a few chips up', min === Math.ceil(ZERO / PX), String(min));
  check('below it the bar would go off-screen', spanFor(min - 1, good) < 0);
  check('at it the bar is on the screen', spanFor(min, good) >= 0);
  check('a flat setup can measure from one chip', minMeasurable({ px: PX, zeroPx: 0 }) === 0);
}

console.log('\nthe ladder holds a tall stack, offset included');
{
  const cap = rulerCapacity(520, good);
  check('a phone ladder measures 20+', cap >= 20, String(cap));
  check('and not absurdly more', cap < 40, String(cap));
  // the offset is free height: the table is below the screen, so the ladder reaches
  // higher in CHIPS than its own pixels would suggest
  check('the offset adds range', cap > rulerCapacity(520, { px: PX, zeroPx: 0 }));
  check('no ladder, no capacity', rulerCapacity(0, good) === 0);
}

console.log('\nthe total is every logged stack plus the one still under the bar');
{
  check('three stacks', stacksTotal([17, 20, 20]) === 57);
  check('with one still being measured', stacksTotal([20, 20], 17) === 57);
  check('nothing logged at all', stacksTotal([]) === 0);
  check('a lone pending stack', stacksTotal([], 3) === 3);
  check('never more of a colour than the box holds', stacksTotal([60, 60], 15, 100) === 100);
  check('an unknown inventory does not clamp to zero', stacksTotal([20, 20], 5, 0) === 45);
  check('a negative cannot eat the stacks', stacksTotal([20, -100], 5) === 25);
}

console.log(failures ? `\nchipRuler: ${failures} FAILED` : '\nchipRuler: all checks passed');
assert.equal(failures, 0);
