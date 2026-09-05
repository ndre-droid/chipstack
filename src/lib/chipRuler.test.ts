import assert from 'node:assert/strict';
import {
  CALIBRATION_STEPS,
  MAX_PX_PER_CHIP,
  MAX_ZERO_PX,
  MIN_PX_PER_CHIP,
  MAX_SAMPLES,
  MAX_RMS_CHIPS,
  calibrate,
  chipsAt,
  fitCalibration,
  hiddenChips,
  isCalibrated,
  minMeasurable,
  rulerCapacity,
  spanFor,
  stacksTotal,
  teach,
  calibrationFor,
  forgetCalibration,
  glassKeyOf,
  normalizeCalibrations,
  rulerSlots,
  screenKeyOf,
  withCalibration,
  worstSample,
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

console.log('\nthe chips nothing can be dragged to are counted exactly');
{
  // 70 px of table under the glass at 20.8 px a chip: three whole chips, not four
  check('below the glass', hiddenChips(good) === 3, String(hiddenChips(good)));
  check('a flat setup hides nothing', hiddenChips({ px: PX, zeroPx: 0 }) === 0);
  // a floating button bar over the ladder's foot hides more, and the sheet must say so
  check('plus whatever floats over the foot', hiddenChips(good, 68) === 6, String(hiddenChips(good, 68)));
  check('the first reachable chip really is above it', spanFor(hiddenChips(good, 68) + 1, good) > 68);
  check('and the one below it really is not', spanFor(hiddenChips(good, 68), good) <= 68);
  check('no calibration hides nothing', hiddenChips(null, 68) === 0);
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

console.log('\ncalibrating asks for two stacks that are both well clear of the table');
{
  // the offset is a centimetre or so, three or four chips: a calibration stack has to
  // stand clearly above it, or the drag is all offset and no signal
  check('the short stack is above a typical horizon', SHORT >= 8, String(SHORT));
  check('and the two are far enough apart to set a slope', TALL - SHORT >= 8);
}

console.log('\nmore than two drags average out instead of the last one winning');
{
  const jitter = [0, 4, -4, 2];
  const fit = fitCalibration([20, 15, 10, 6].map((n, i) => ({ chips: n, y: yFor(n) + jitter[i] })));
  check('four shaky drags still fit', fit !== null);
  check('chip height within a tenth of a px', !!fit && Math.abs(fit.px - PX) < 0.1, String(fit?.px));
  check('offset within a couple of px', !!fit && Math.abs(fit.zeroPx - ZERO) < 3, String(fit?.zeroPx));
  check('one drag is not a line', fitCalibration([{ y: 300, chips: 20 }]) === null);
  check(
    'the same height twice is not a line',
    fitCalibration([{ y: 300, chips: 20 }, { y: 300, chips: 20 }]) === null,
  );
  check('an absurd fit is refused', fitCalibration([{ y: 700, chips: 5 }, { y: 100, chips: 2 }]) === null);
}

console.log('\na corrected stack teaches the ruler, and a lone one only slides it');
{
  // a believable calibration that still reads every stack short — the 18-that-said-13
  const off = calibrate({ y: 20 * 28 - 40, chips: 20 }, { y: 10 * 28 - 40, chips: 10 });
  check('the bad calibration is itself believable', off !== null, String(off?.px));
  const wrong = chipsAt(yFor(18), off);
  check('and it does under-read a real 18', wrong < 18, String(wrong));

  const taught = teach(off, { y: yFor(18), chips: 18 });
  check('the correction is accepted', taught !== null);
  check('that stack now reads right', chipsAt(yFor(18), taught) === 18, String(chipsAt(yFor(18), taught)));
  check('the correction is remembered on its own', (taught?.samples?.length ?? 0) === 1);
  check('and the calibration drags are not mixed in', (off?.samples ?? undefined) === undefined);

  // a second truth at a different height, and the chip height itself is refitted
  const twice = teach(taught, { y: yFor(8), chips: 8 });
  check('a second correction is accepted', twice !== null);
  check(
    'chip height moved towards the truth',
    !!twice && !!off && Math.abs(twice.px - PX) < Math.abs(off.px - PX),
    String(twice?.px),
  );
  for (const n of [8, 12, 18]) {
    check(`${n} chips now reads within one`, Math.abs(chipsAt(yFor(n), twice) - n) <= 1, String(chipsAt(yFor(n), twice)));
  }

  check('an uncalibrated ruler cannot be taught', teach(null, { y: 300, chips: 15 }) === null);
  check('a stack of nothing teaches nothing', teach(good, { y: 300, chips: 0 }) === null);
  check('NaN teaches nothing', teach(good, { y: Number.NaN, chips: 15 }) === null);

  let many = good!;
  for (let i = 0; i < MAX_SAMPLES + 5; i++) many = teach(many, { y: yFor(12), chips: 12 }) ?? many;
  check('the samples do not grow forever', (many.samples?.length ?? 0) <= MAX_SAMPLES, String(many.samples?.length));
  check('and a truthful ruler stays truthful', chipsAt(yFor(17), many) === 17);
}

/**
 * Two screens, one device.
 *
 * The Fold is the reason this exists: shut it is a 412x960 panel standing on its own
 * bottom edge, open it is 832x750 in a different density bucket standing on a
 * different edge. One calibration cannot be true of both, and quietly using the
 * wrong one under-reads every stack for the rest of the night.
 */
console.log('');
console.log('one device, two pieces of glass');
{
  const cover = screenKeyOf({ width: 412, height: 960, dpr: 2.625, wide: false, portrait: true });
  const inner = screenKeyOf({ width: 832, height: 750, dpr: 2.4, wide: true, portrait: true });
  check('the two panels are told apart', cover !== inner, cover + ' / ' + inner);

  check(
    'the same panel reported the other way round is still that panel',
    screenKeyOf({ width: 960, height: 412, dpr: 2.625, wide: false, portrait: true }) === cover,
  );
  check(
    'and neither does a fractional dpr wobble',
    screenKeyOf({ width: 412, height: 960, dpr: 2.6251, wide: false, portrait: true }) === cover,
  );
  check(
    'a webview reporting the window is still caught by the layout class',
    screenKeyOf({ width: 412, height: 960, dpr: 2.625, wide: true, portrait: true }) !== cover,
  );

  /* Standing the phone on its long edge is a different measurement of the same
     glass: the case lip it rests on is a different lip, and `zeroPx` is that lip.
     Sharing one offset between the two adds a constant to every stack, which is
     the one error a ruler cannot detect. */
  const coverSide = screenKeyOf({ width: 412, height: 960, dpr: 2.625, wide: false, portrait: false });
  check('upright and on its side are separate calibrations', coverSide !== cover);
  check(
    '...of the same piece of glass',
    glassKeyOf({ width: 412, height: 960, dpr: 2.625, wide: false, portrait: false }) ===
      glassKeyOf({ width: 960, height: 412, dpr: 2.625, wide: false, portrait: true }),
  );

  const cals = withCalibration(withCalibration({}, cover, good!), inner, { px: 17.3, zeroPx: 40 });
  check('each screen keeps its own', calibrationFor(cals, cover)?.px === good!.px);
  check('...and the other one is not it', calibrationFor(cals, inner)?.px === 17.3);
  check('an unmeasured screen has nothing', calibrationFor(cals, 'somewhere-else') === null);
  check(
    'measuring one screen leaves the other alone',
    Object.keys(withCalibration(cals, cover, { px: 21, zeroPx: 10 })).length === 2,
  );
  const forgotten = forgetCalibration(cals, inner);
  check('recalibrating one screen forgets only that one', calibrationFor(forgotten, inner) === null);
  check('...and keeps the other', calibrationFor(forgotten, cover) !== null);

  // a stored map is user data that has been through a backup file and a merge
  const dirty = normalizeCalibrations({
    ok: good,
    absurd: { px: MAX_PX_PER_CHIP + 40, zeroPx: 10 },
    negative: { px: 20, zeroPx: -5 },
    nonsense: 'twenty',
    '': good,
  });
  check('a believable calibration survives the trip', !!dirty['ok:p']);
  check('an impossible chip height does not', !dirty['absurd:p']);
  check('nor a table above the screen', !dirty['negative:p']);
  check('nor a string', !dirty['nonsense:p']);
  check('nor a nameless screen', !dirty[':p'] && !dirty['']);
  check('a junk field is an empty map, not a crash', Object.keys(normalizeCalibrations(null)).length === 0);
  check('an array is not a map of screens', Object.keys(normalizeCalibrations([good])).length === 0);

  /* A calibration stored before the ruler knew about orientation has no suffix.
     It is read as the upright one — the way a phone stands for a count unless
     somebody deliberately turns it — rather than being thrown away. */
  const legacy = normalizeCalibrations({ '412x960@2.625:c': good });
  check('an orientation-less calibration is adopted as the upright one', !!legacy['412x960@2.625:c:p']);
  check('...and not as the one on its side', !legacy['412x960@2.625:c:l']);
}

/**
 * Settings has to be able to set all of this up on a quiet Tuesday, which means
 * naming the slots before any of them has been measured.
 */
console.log('');
console.log('the slots Settings offers');
{
  const here = { width: 412, height: 960, dpr: 2.625, wide: false, portrait: true };
  const empty = rulerSlots({}, here);
  check('a fresh phone is offered exactly its two', empty.length === 2);
  check('upright first', empty[0]!.portrait && !empty[1]!.portrait);
  check('both of them are this screen', empty.every((s) => s.here));
  check('and neither is measured yet', empty.every((s) => s.cal === null));

  const cals = withCalibration({ '832x750@2.4:w:l': { px: 17, zeroPx: 30 } }, screenKeyOf(here), good!);
  const slots = rulerSlots(cals, here);
  check('the other panel is listed too', slots.length === 3);
  check('...as somewhere else', slots[2]!.here === false && slots[2]!.portrait === false);
  check('the measured slot carries its calibration', slots[0]!.cal?.px === good!.px);
  check(
    'turning the phone over asks for the other slot',
    rulerSlots(cals, { ...here, portrait: false })[1]!.cal === null,
  );
}

/**
 * The ladder is not always the bottom of the glass. `blockedPx` is whatever sits
 * under it, and it has to cost RANGE and never scale: chips that cannot be reached
 * get typed, chips that can still read the same number.
 */
console.log('');
console.log('what sits below the ladder costs range, not scale');
{
  const gap = 220;
  check('no gap is the old answer', hiddenChips(good, 0) === hiddenChips(good));
  check(
    'a gap puts more chips out of reach',
    hiddenChips(good, gap) > hiddenChips(good, 0),
    hiddenChips(good, gap) + ' vs ' + hiddenChips(good, 0),
  );
  check(
    'exactly its own worth of them',
    hiddenChips(good, gap) === Math.floor((gap + ZERO) / PX),
    String(hiddenChips(good, gap)),
  );
  check('and the shortest measurable stack rises with it', minMeasurable(good, gap) > minMeasurable(good, 0));
  check('a negative gap is not a discount', hiddenChips(good, -50) === hiddenChips(good, 0));
  check('nor for the shortest stack', minMeasurable(good, -50) === minMeasurable(good, 0));
}

/**
 * Three drags, because two of them cannot disagree.
 *
 * The endpoints set the slope on their own — a middle point adds nothing to it.
 * What it buys is a RESIDUAL: the first number the ruler has ever had for how much
 * to trust itself, and the only way to tell a shaky drag from a steady one.
 */
console.log('');
console.log('a third drag is what makes a calibration checkable');
{
  const steps = [...CALIBRATION_STEPS];
  const clean = steps.map((n) => ({ y: yFor(n), chips: n }));
  const fit = fitCalibration(clean, 1_700_000_000_000);

  check('three honest drags fit', fit !== null);
  check('chip height recovered', !!fit && Math.abs(fit.px - PX) < 1e-9, String(fit?.px));
  check('offset recovered', !!fit && Math.abs(fit.zeroPx - ZERO) < 1e-9, String(fit?.zeroPx));
  check('and they agree with each other', (fit?.rms ?? 9) < 0.01, String(fit?.rms));
  check('the readout knows how tall a stack it was anchored on', fit?.span === steps[0]);
  check('and when it was measured', fit?.at === 1_700_000_000_000);

  // two drags have no residual to report — a line through two points is always exact
  check('two drags claim no quality', good?.rms === undefined && good?.span === undefined);
  check('but are still stamped', typeof good?.at === 'number');

  // one drag 40 px out: about two chips, which is a mis-drag and not noise
  const blundered = clean.map((p, i) => (i === 1 ? { ...p, y: p.y + 40 } : p));
  check('a mis-drag among three is refused', fitCalibration(blundered) === null);
  check('and it is named', worstSample(blundered) === 1, String(worstSample(blundered)));
  check('nothing to single out among two', worstSample(clean.slice(0, 2)) === -1);

  // drag noise is not a blunder: three px of thumb wobble still calibrates
  const wobbly = clean.map((p, i) => ({ ...p, y: p.y + [2, -3, 2][i]! }));
  const okFit = fitCalibration(wobbly);
  check('a few px of wobble still calibrates', okFit !== null, String(okFit?.rms));
  check('and reports itself as good', (okFit?.rms ?? 9) < 0.25, String(okFit?.rms));

  /* The quality is only worth having if it survives being written down. A stored
     calibration goes through normalizeCalibrations on every single load, and that
     function REBUILDS the object field by field — so anything it does not know
     about is silently dropped, and the readout would be blank after one restart. */
  const stored = normalizeCalibrations({ 'a@1:c:p': fit });
  check('the quality comes back off disk', stored['a@1:c:p']?.rms === fit?.rms);
  check('...and what it was measured on', stored['a@1:c:p']?.span === fit?.span);
  check('...and when', stored['a@1:c:p']?.at === fit?.at);
  const junk = normalizeCalibrations({ 'a@1:c:p': { px: PX, zeroPx: ZERO, rms: 'good', span: null, at: 'now' } });
  check('a hand-edited quality is dropped, the calibration is not', !!junk['a@1:c:p']);
  check('...and it claims nothing', junk['a@1:c:p']?.rms === undefined && junk['a@1:c:p']?.at === undefined);
}

console.log(failures ? `\nchipRuler: ${failures} FAILED` : '\nchipRuler: all checks passed');
assert.equal(failures, 0);
