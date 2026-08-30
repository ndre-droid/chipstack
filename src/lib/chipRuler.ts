/**
 * The chip ruler — a length beside the phone, read back as a number of chips.
 *
 * The tedious part of a colour count is never the neat columns; it is the odd pile
 * that has to be counted one chip at a time. So the ruler measures piles: the phone
 * stands on the table next to a stack, you drag the bar to the top of it, and the
 * length becomes a count.
 *
 * No millimetres and no device DPI anywhere in here, deliberately. Android reports a
 * density BUCKET, so a CSS pixel is only approximately 1/160 inch and the error is a
 * few percent — enough to miscount a tall stack, silently and confidently. The user
 * calibrates instead, and the numbers that come out absorb screen density, chip
 * thickness and chip material together. They are CSS pixels, which stay put because
 * the viewport is pinned to `device-width`.
 *
 * TWO numbers, though, not one — this is the part that standing the phone up changes.
 * Zero is no longer on the glass, it is the table, and the table is a case bottom and
 * a bezel BELOW the lowest pixel. So a calibration is a scale and an offset:
 *
 *     a stack of n chips has its top at   y = n·px − zeroPx
 *     ...measured as y above the bottom edge of the screen.
 *
 * One measurement leaves that underdetermined, which is why calibrating takes two
 * stacks of different known heights. And because `zeroPx` is real — a centimetre or
 * so, three or four chips — the first few chips of every stack are physically below
 * the screen and cannot be measured at all. `minMeasurable` is that horizon, and the
 * sheet has to offer a way to just type those in rather than pretend.
 */

/**
 * The band a believable chip height falls in. A poker chip is 3.0–3.5 mm, which at
 * Android's 160 CSS-px-per-inch is roughly 19–22 px; this is far wider on both sides
 * because it exists to catch a mis-drag, not to police what someone's chips measure.
 */
export const MIN_PX_PER_CHIP = 6;
export const MAX_PX_PER_CHIP = 80;

/**
 * How far below the screen the table is allowed to be. A case bottom plus a bezel is
 * a centimetre or so; 300 px is about 47 mm, which no phone reaches. Past that the
 * two calibration drags were not what they claimed to be.
 */
export const MAX_ZERO_PX = 300;

/**
 * The two stacks calibration asks for, tallest first.
 *
 * Both are deliberately WELL above the screen's bottom edge. A five-chip stack tops
 * out a centimetre off the table — down in the offset, behind the button bar, and
 * squashed under the dragging thumb — so the second drag used to be the least
 * accurate one of the pair while carrying the whole of the offset. Ten chips is far
 * enough up to aim at, and ten chips of separation is still plenty of slope.
 */
export const CALIBRATION_STEPS = [20, 10] as const;

/** How many corrections the fit remembers. Enough to average out a shaky drag. */
export const MAX_SAMPLES = 8;

/** One drag the user has vouched for: the bar at `y` was the top of `chips` chips. */
export interface RulerSample {
  y: number;
  chips: number;
}

export interface RulerCalibration {
  /** how tall one chip draws, in CSS px */
  px: number;
  /** how far below the bottom of the screen the table sits, in CSS px */
  zeroPx: number;
  /**
   * Stacks the user has since corrected by hand — NOT the calibration drags.
   * Kept apart on purpose: a correction only exists because the calibration was
   * wrong, so averaging the two would defend the mistake being corrected.
   */
  samples?: RulerSample[];
}

/**
 * Fit the line `y = chips·px − zeroPx` through a set of drags of known height.
 *
 * Least squares rather than two points, because the drags arrive in sets larger than
 * two: judging the top of a pile a couple of millimetres off is normal, and averaging
 * is what stops one shaky drag from setting the scale for the whole night.
 *
 * Returns null rather than a number when the result is not believable: a bad
 * calibration poisons every count afterwards, so it has to fail at the one moment
 * the user is still looking at it.
 */
export function fitCalibration(samples: RulerSample[]): RulerCalibration | null {
  const pts = samples.filter((p) => Number.isFinite(p.y) && Number.isFinite(p.chips) && p.chips > 0);
  if (pts.length < 2) return null;

  const n = pts.length;
  const mChips = pts.reduce((a, p) => a + p.chips, 0) / n;
  const mY = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.chips - mChips) * (p.y - mY);
    sxx += (p.chips - mChips) ** 2;
  }
  // every sample the same height: a slope cannot be read off one point twice
  if (!(sxx > 0)) return null;

  const px = sxy / sxx;
  if (!(px >= MIN_PX_PER_CHIP && px <= MAX_PX_PER_CHIP)) return null;

  // The table cannot be ABOVE the screen's bottom edge. A hair negative is drag
  // noise and gets flattened; more than a chip's worth means the drags do not
  // describe one straight line, and there is nothing to salvage.
  const raw = px * mChips - mY;
  if (raw < -px || raw > MAX_ZERO_PX) return null;

  return { px, zeroPx: Math.max(0, raw) };
}

/**
 * Solve the scale and the offset from two stacks of known height.
 *
 * The pair has to be a real pair — a taller stack reading taller — before the fit is
 * allowed to see it, or a mis-drag becomes a straight line through two mistakes.
 */
export function calibrate(tall: RulerSample, short: RulerSample): RulerCalibration | null {
  const dChips = tall.chips - short.chips;
  const dY = tall.y - short.y;
  if (![tall.y, short.y, tall.chips, short.chips].every(Number.isFinite)) return null;
  // both drags have to be a real stack: you cannot stand nothing on the table and
  // drag to the top of it, so a zero-chip step is a bug, not a flat calibration
  if (!(short.chips > 0) || !(dChips > 0) || !(dY > 0)) return null;

  return fitCalibration([tall, short]);
}

/** How far apart two corrected stacks must be, in chips, before they may set the scale. */
const REFIT_SPREAD = 4;

/**
 * Teach the ruler from a stack it got wrong: the bar was at `y`, the pile was really
 * `chips` high.
 *
 * This is the only calibration data that arrives in the range the counting actually
 * happens in, and the only kind that arrives after the user has seen the ruler be
 * wrong — so it OVERRIDES the calibration drags rather than being averaged with them.
 * Averaging would be the one thing guaranteed not to fix a bad calibration.
 *
 * Two behaviours, depending on what the corrections can support:
 *
 * - One correction, or several at much the same height, SLIDES the line: the offset
 *   moves so that stack reads right and the chip height is left alone. Chip thickness
 *   is a physical constant the calibration got roughly right; the offset is the shaky
 *   half. Fitting a slope through two nearly equal heights is how a single hesitant
 *   drag would otherwise throw the chip height out by a third.
 * - Two or more corrections spread over enough chips REFIT the whole line through the
 *   corrections alone — scale and offset both, from stacks that were really on the
 *   table.
 *
 * Returns null when the correction cannot be believed; the caller keeps what it had.
 */
export function teach(
  cal: RulerCalibration | null | undefined,
  sample: RulerSample,
): RulerCalibration | null {
  if (!isCalibrated(cal)) return null;
  if (!Number.isFinite(sample.y) || !(sample.chips > 0)) return null;

  const fixes = [...(cal.samples ?? []), sample].slice(-MAX_SAMPLES);
  const spread = Math.max(...fixes.map((p) => p.chips)) - Math.min(...fixes.map((p) => p.chips));
  if (fixes.length >= 2 && spread >= REFIT_SPREAD) {
    const fitted = fitCalibration(fixes);
    if (fitted) return { ...fitted, samples: fixes };
  }

  // slide the line onto the corrected stack, keeping the chip height
  const zeroPx = sample.chips * cal.px - sample.y;
  if (zeroPx < -cal.px || zeroPx > MAX_ZERO_PX) return null;
  return { px: cal.px, zeroPx: Math.max(0, zeroPx), samples: fixes };
}

/** Is a stored calibration still one we are willing to measure with? */
export function isCalibrated(cal: RulerCalibration | null | undefined): cal is RulerCalibration {
  return (
    !!cal &&
    Number.isFinite(cal.px) &&
    Number.isFinite(cal.zeroPx) &&
    cal.px >= MIN_PX_PER_CHIP &&
    cal.px <= MAX_PX_PER_CHIP &&
    cal.zeroPx >= 0 &&
    cal.zeroPx <= MAX_ZERO_PX
  );
}

/** The count a bar at `y` above the screen's bottom edge represents. */
export function chipsAt(y: number, cal: RulerCalibration | null | undefined): number {
  if (!isCalibrated(cal) || !Number.isFinite(y)) return 0;
  return Math.max(0, Math.round((y + cal.zeroPx) / cal.px));
}

/** The inverse: where the bar sits when it is showing `chips`. Negative = below the glass. */
export function spanFor(chips: number, cal: RulerCalibration | null | undefined): number {
  if (!isCalibrated(cal)) return 0;
  return Math.max(0, chips) * cal.px - cal.zeroPx;
}

/**
 * The shortest stack the ruler can actually see — everything under it is hidden by
 * the case and the bezel, and has to be typed instead.
 */
export function minMeasurable(cal: RulerCalibration | null | undefined): number {
  if (!isCalibrated(cal)) return 0;
  return Math.ceil(cal.zeroPx / cal.px);
}

/**
 * How many chips of a pile the ruler cannot be dragged to at all: the ones below the
 * glass, plus — pass `blockedPx` — the ones behind whatever floats over the ladder's
 * foot. Those get tapped in instead, so the number has to be exact rather than
 * roughly right: it is the count of n whose top sits at or below the lowest reachable
 * pixel.
 */
export function hiddenChips(cal: RulerCalibration | null | undefined, blockedPx = 0): number {
  if (!isCalibrated(cal)) return 0;
  return Math.max(0, Math.floor((Math.max(0, blockedPx) + cal.zeroPx) / cal.px));
}

/** The tallest stack the ladder can take in one go. */
export function rulerCapacity(ladderPx: number, cal: RulerCalibration | null | undefined): number {
  if (!isCalibrated(cal) || !(ladderPx > 0)) return 0;
  return chipsAt(ladderPx, cal);
}

/**
 * What the sheet hands back: every stack logged for this colour, plus the one still
 * under the bar, never more of a colour than the box actually holds.
 *
 * `inventory` of 0 means "unknown", not "none" — a set with no count recorded should
 * not clamp every answer to zero.
 */
export function stacksTotal(stacks: number[], pending = 0, inventory = 0): number {
  const total = stacks.reduce((s, n) => s + Math.max(0, n), 0) + Math.max(0, pending);
  return inventory > 0 ? Math.min(total, inventory) : total;
}
