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
 *
 * Both numbers describe ONE piece of glass, which is why the calibration is stored
 * per screen (`screenKeyOf` at the bottom of this file): a folding phone has two
 * panels in different density buckets, standing on two different edges, and one
 * calibration cannot be true of both.
 *
 * And `y` is measured from the bottom of the GLASS, not from the bottom of whatever
 * the ladder happens to be drawn in. The caller adds back whatever sits below the
 * ladder (`blockedPx` / `belowPx`) before asking, so chrome that comes and goes
 * changes the RANGE the instrument can reach and never the scale it reads.
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
 * the case and the bezel (plus `blockedPx`, whatever sits between the ladder's
 * bottom edge and the bottom of the glass), and has to be typed instead.
 */
export function minMeasurable(cal: RulerCalibration | null | undefined, blockedPx = 0): number {
  if (!isCalibrated(cal)) return 0;
  return Math.ceil((Math.max(0, blockedPx) + cal.zeroPx) / cal.px);
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

/* ------------------------------------------------------------------
   Which screen is this?
   ------------------------------------------------------------------
   A calibration is CSS pixels per chip plus a case-and-bezel offset, and both
   of those are facts about ONE piece of glass. A folding phone has two, and
   they disagree on both counts: Android hands out a density BUCKET, so a CSS
   pixel is only approximately 1/160 inch and the two panels land in different
   buckets — a few percent, which is a whole chip on a tall stack — and the
   edge the phone stands on when it is shut is not the edge it stands on when
   it is open, so `zeroPx` is a different distance entirely.

   So calibrations are kept per screen. The key has to be stable across
   reloads, across rotation and across the app being folded open and shut
   again, and it has to CHANGE when the glass does:

   - the screen's own dimensions, smaller side first, so turning the device
     does not invent a second screen;
   - the device pixel ratio, which separates two panels of the same nominal
     size;
   - and the layout class the app is drawing, as a backstop for a webview that
     reports the window instead of the display. On the one device this exists
     for, the cover screen is compact and the inner screen is wide, so even a
     screen object that lies cannot merge the two.

   Erring towards a NEW key is the safe direction: the worst case is two
   calibration drags that were not strictly necessary. Erring the other way
   measures a stack with the other screen's ruler and says nothing. */

/** Everything the key is built from — passed in, so this stays testable. */
export interface ScreenShape {
  /** the screen's own width in CSS px (not the window's) */
  width: number;
  /** the screen's own height in CSS px */
  height: number;
  /** device pixel ratio */
  dpr: number;
  /** is the app drawing its wide (rail + one pane) layout on this screen? */
  wide: boolean;
  /** is the phone being held upright right now? */
  portrait: boolean;
}

/**
 * The identity of one piece of glass, HELD ONE WAY.
 *
 * The dimensions are normalised smallest-side-first so that turning the device
 * does not invent a second screen — and then the orientation is put back on the
 * end as its own letter, because standing the phone up on its short edge and
 * standing it on its long edge are two different measurements of the same glass:
 *
 *   - `px` is very nearly the same either way (it is the density, and that does
 *     not rotate), but not exactly: a browser rounds the viewport differently in
 *     each direction, and a percent is a chip on a twenty-stack.
 *   - `zeroPx` is not remotely the same. It is the case bottom and the bezel
 *     BELOW the lowest pixel, and a phone lying on its side is resting on a
 *     different edge of the case — a different lip, a different bezel, often a
 *     camera bump. Sharing one offset between the two is the one error the ruler
 *     cannot detect, because it is a constant added to every stack.
 *
 * So a folding phone has four: two panels, upright and on their side. Each is
 * measured once, kept for good, and picked automatically.
 */
export function screenKeyOf(s: ScreenShape): string {
  return `${glassKeyOf(s)}${s.portrait ? ':p' : ':l'}`;
}

/** The piece of glass alone, without which way up it is. */
export function glassKeyOf(s: ScreenShape): string {
  const w = Math.max(0, Math.round(s.width));
  const h = Math.max(0, Math.round(s.height));
  const dpr = Math.round((s.dpr > 0 ? s.dpr : 1) * 100) / 100;
  return `${Math.min(w, h)}x${Math.max(w, h)}@${dpr}${s.wide ? ':w' : ':c'}`;
}

/** What this browser is showing the app on, right now. */
export function readScreenShape(): ScreenShape {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, dpr: 1, wide: false, portrait: true };
  }
  const s = window.screen;
  /* The WINDOW decides which way up we are, not the screen object. What is being
     asked is which edge the phone is standing on, and that is the shape the app
     is currently drawn in — a screen object that reports its panel's native
     orientation regardless of rotation (some webviews do) would answer a
     different question. */
  const portrait = window.matchMedia
    ? window.matchMedia('(orientation: portrait)').matches
    : window.innerHeight >= window.innerWidth;
  return {
    width: s?.width || window.innerWidth || 0,
    height: s?.height || window.innerHeight || 0,
    dpr: window.devicePixelRatio || 1,
    wide: typeof document !== 'undefined' && document.documentElement.dataset.layout === 'wide',
    portrait,
  };
}

/** Every screen this device has been calibrated on, by `screenKeyOf`. */
export type RulerCalibrations = Record<string, RulerCalibration>;

/** The calibration for one screen, or null when that screen has never been measured. */
export function calibrationFor(
  cals: RulerCalibrations | null | undefined,
  key: string,
): RulerCalibration | null {
  const cal = cals?.[key];
  return isCalibrated(cal) ? cal : null;
}

/** Store a screen's calibration, leaving every other screen's alone. */
export function withCalibration(
  cals: RulerCalibrations | null | undefined,
  key: string,
  cal: RulerCalibration,
): RulerCalibrations {
  return { ...(cals ?? {}), [key]: cal };
}

/** Throw away one screen's calibration — "measure this screen again". */
export function forgetCalibration(
  cals: RulerCalibrations | null | undefined,
  key: string,
): RulerCalibrations {
  const next = { ...(cals ?? {}) };
  delete next[key];
  return next;
}

/**
 * Drop anything that is not a believable calibration — a hand-edited backup, an
 * older shape of the field, a screen key that is not a string.
 *
 * Keys from before the ruler knew about orientation have no `:p`/`:l` on the end.
 * Those are read as PORTRAIT rather than thrown away: the phone stands on its
 * short edge for a count unless somebody deliberately turns it, so that is the
 * one orientation the old number can honestly be claimed to describe — and if
 * the guess is wrong the very first stack says so out loud.
 */
export function normalizeCalibrations(raw: unknown): RulerCalibrations {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RulerCalibrations = {};
  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rawKey !== 'string' || !rawKey) continue;
    const key = rawKey.endsWith(':p') || rawKey.endsWith(':l') ? rawKey : `${rawKey}:p`;
    if (out[key]) continue;
    const cal = value as RulerCalibration | undefined;
    if (!isCalibrated(cal)) continue;
    const samples = Array.isArray(cal.samples)
      ? cal.samples.filter(
          (p) => p && Number.isFinite(p.y) && Number.isFinite(p.chips) && p.chips > 0,
        ).slice(-MAX_SAMPLES)
      : undefined;
    out[key] = samples?.length ? { px: cal.px, zeroPx: cal.zeroPx, samples } : { px: cal.px, zeroPx: cal.zeroPx };
  }
  return out;
}

/**
 * The calibration slots to offer in Settings, so the whole thing can be set up on
 * the Tuesday rather than discovered at the table on the Friday.
 *
 * The two slots for the glass the app is on RIGHT NOW come first and are the only
 * ones that can be measured from here — the other panel of a folding phone cannot
 * be calibrated without unfolding it, so it is listed as what it is: a screen this
 * device has measured before, with a name and a "forget" and nothing else.
 */
export interface RulerSlot {
  /** the key the calibration is stored under */
  key: string;
  /** the piece of glass, without which way up */
  glass: string;
  portrait: boolean;
  /** null when this one has never been measured */
  cal: RulerCalibration | null;
  /** is this the screen the app is being drawn on at this moment? */
  here: boolean;
}

/**
 * Every slot worth showing: the current screen's two, then anything else stored.
 *
 * Stored keys are the source of truth for the "other" screens rather than any
 * guess about what a device has — a Fold that has only ever been counted with
 * shut has one other slot, not three empty ones, and a plain phone has none.
 */
export function rulerSlots(
  cals: RulerCalibrations | null | undefined,
  shape: ScreenShape,
): RulerSlot[] {
  const glass = glassKeyOf(shape);
  const slots: RulerSlot[] = [true, false].map((portrait) => {
    const key = `${glass}${portrait ? ':p' : ':l'}`;
    return { key, glass, portrait, cal: calibrationFor(cals, key), here: true };
  });
  for (const key of Object.keys(cals ?? {})) {
    if (slots.some((s) => s.key === key)) continue;
    const portrait = key.endsWith(':p');
    slots.push({
      key,
      glass: key.slice(0, -2),
      portrait,
      cal: calibrationFor(cals, key),
      here: false,
    });
  }
  return slots;
}
