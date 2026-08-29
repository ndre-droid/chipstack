/**
 * The chip ruler — a length on the glass, read back as a number of chips.
 *
 * The tedious part of a colour count is never the full columns; three stacks of
 * twenty are countable at a glance. It is the odd column, the loose seventeen that
 * has to be counted one chip at a time. So the ruler measures THAT: you lay the
 * column flat on the screen with its base on the baseline, drag the bar to its top,
 * and the length becomes the count.
 *
 * No millimetres and no device DPI anywhere in here, deliberately. Android reports
 * a density BUCKET, so a CSS pixel is only approximately 1/160 inch and the error
 * is a few percent — enough to miscount a tall column, silently and confidently.
 * Instead the user calibrates once against a real column of known height, and the
 * single number that comes out (`pxPerChip`) absorbs screen density, chip thickness
 * and chip material together. It is measured in CSS pixels, which stay put because
 * the viewport is pinned to `device-width`.
 *
 * That makes calibration load-bearing rather than optional: an uncalibrated ruler
 * would still produce a confident number, just a wrong one, so the sheet refuses to
 * measure until `calibrate()` has returned something.
 */

/**
 * The band a believable calibration falls in. A poker chip is 3.0–3.5 mm, which at
 * Android's 160 CSS-px-per-inch is roughly 19–22 px; the range here is far wider
 * than that on both sides, because it exists to catch a mis-drag (a fat-fingered
 * 2 px, a drag to the top of the screen while the field says "3 chips"), not to
 * police what someone's chips actually measure.
 */
export const MIN_PX_PER_CHIP = 6;
export const MAX_PX_PER_CHIP = 80;

/**
 * One standard poker column — the unit the table already stacks in, so it is both
 * what the full-column stepper counts in and what the calibration asks you to lay out.
 */
export const COLUMN_CHIPS = 20;

/**
 * Turn a measured span of `chips` real chips into px-per-chip.
 *
 * Returns null rather than a number when the result is outside the believable band:
 * a bad calibration poisons every count afterwards, so it must fail loudly at the
 * one moment the user is looking at it.
 */
export function calibrate(spanPx: number, chips: number): number | null {
  if (!Number.isFinite(spanPx) || !Number.isFinite(chips)) return null;
  if (!(chips > 0) || !(spanPx > 0)) return null;
  const px = spanPx / chips;
  return px >= MIN_PX_PER_CHIP && px <= MAX_PX_PER_CHIP ? px : null;
}

/** Is a stored calibration still one we are willing to measure with? */
export function isCalibrated(pxPerChip: number | null | undefined): pxPerChip is number {
  return (
    typeof pxPerChip === 'number' &&
    Number.isFinite(pxPerChip) &&
    pxPerChip >= MIN_PX_PER_CHIP &&
    pxPerChip <= MAX_PX_PER_CHIP
  );
}

/** The count a span of glass represents. Nearest chip — half a chip is not a thing. */
export function chipsAt(spanPx: number, pxPerChip: number): number {
  if (!isCalibrated(pxPerChip) || !Number.isFinite(spanPx)) return 0;
  return Math.max(0, Math.round(spanPx / pxPerChip));
}

/** The inverse: where the bar sits when it is showing `chips`. */
export function spanFor(chips: number, pxPerChip: number): number {
  if (!isCalibrated(pxPerChip)) return 0;
  return Math.max(0, chips) * pxPerChip;
}

/**
 * The tallest column the ladder can measure in one go.
 *
 * At roughly 21 px a chip this lands around 25 on a phone — one column plus change,
 * which is exactly the job. Anything taller is counted as full columns instead, so
 * there is no need to make the ladder scroll (and a scrolling ruler would not be a
 * ruler).
 */
export function rulerCapacity(ladderPx: number, pxPerChip: number): number {
  if (!isCalibrated(pxPerChip) || !(ladderPx > 0)) return 0;
  return Math.floor(ladderPx / pxPerChip);
}

/**
 * What the sheet hands back: the full columns you counted by eye plus the odd one
 * the ruler measured, never more of a colour than the box actually holds.
 *
 * `inventory` of 0 means "unknown", not "none" — a set with no count recorded should
 * not clamp every answer to zero.
 */
export function rulerTotal(opts: {
  columns: number;
  columnSize: number;
  measured: number;
  inventory?: number;
}): number {
  const { columns, columnSize, measured, inventory = 0 } = opts;
  const total = Math.max(0, columns) * Math.max(0, columnSize) + Math.max(0, measured);
  return inventory > 0 ? Math.min(total, inventory) : total;
}
