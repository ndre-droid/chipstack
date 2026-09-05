# Chip Ruler Setups + Three-Drag Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chip ruler named setups ("No case", "Blue case"), each holding a whole per-screen calibration table, switchable from inside the ruler sheet — plus a third calibration drag that yields an error bar, editable stack counts, and a bar that snaps to the chip line.

**Architecture:** A setup wraps the existing `RulerCalibrations` map unchanged, so `screenKeyOf`, `rulerSlots`, `teach` and every other per-screen concept keeps working untouched. All new maths goes in `src/lib/chipRuler.ts` behind pure functions with unit tests; the two React files only swap where they read the calibration from and grow the UI to pick a setup. Migration folds the existing `chipRulerCals` map into a first setup at load time, exactly the way the older single `chipRuler` field was already handled.

**Tech Stack:** Vite + React 18 + TypeScript, Capacitor for Android. Tests are plain scripts run by `node --experimental-strip-types` via `npm test` (`scripts/run-tests.mjs`) — no framework.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-05-chip-ruler-setups-design.md`.
- **Test convention:** every test file is `src/lib/*.test.ts`, imports with explicit `.ts` extensions, uses the file-local `check(label, ok, detail?)` helper and `console.log` section headers, and ends with `assert.equal(failures, 0)`. No test framework, no new dependency.
- **Run one test file:** `node --experimental-strip-types src/lib/chipRuler.test.ts`
- **Run all tests:** `npm test`
- **Typecheck + build:** `npm run build` (`tsc -b && vite build`)
- **Lint:** `npm run lint` (oxlint)
- **Nothing may be drawn below or floating over the ruler's ladder.** Pixels that cannot be dragged to are chips that must be typed. Every new control in `ChipRuler.tsx` goes *above* `.ruler-stage`. This is a hard rule stated in that file's header comment.
- **Every new `Settings` field must be classified in `src/lib/settingsScope.ts`.** Both fields added here are device-local.
- **i18n:** every user-visible string is a key in `src/lib/i18n.ts`, added to **both** the `en` and `de` dictionaries. No English in the store.
- **`px` is the chips and the screen density; `zeroPx` is the case lip.** This is why a new case needs one drag and not three. Do not blur the two.
- **Commit messages:** conventional-commit prefix, body explaining the *why*, and the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: A three-drag fit reports how good it is

Two points always describe exactly one line, so today a shaky drag produces a calibration indistinguishable from a good one. A third drag creates residuals — that is the whole reason for it, since the endpoints already set the slope.

**Files:**
- Modify: `src/lib/chipRuler.ts` (`CALIBRATION_STEPS` at ~line 63, `fitCalibration` at ~line 99, `normalizeCalibrations` at ~line 385)
- Test: `src/lib/chipRuler.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `MAX_RMS_CHIPS: number` (0.5)
  - `CALIBRATION_STEPS: readonly [20, 12, 6]`
  - `fitCalibration(samples: RulerSample[], now?: number): RulerCalibration | null` — now always stamps `at`, and for 3+ points also sets `rms` (chips) and `span` (tallest stack), rejecting a fit whose `rms` exceeds `MAX_RMS_CHIPS`
  - `worstSample(samples: RulerSample[]): number` — index of the drag furthest from the line through all of them, or `-1`
  - `RulerCalibration` gains optional `rms`, `span`, `at`, and `normalizeCalibrations` carries all three back off disk

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/chipRuler.test.ts`, immediately **before** the final `console.log(failures ? ... )` line:

```ts
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
```

Add `MAX_RMS_CHIPS` and `worstSample` to the import list at the top of the file (the existing `import { ... } from './chipRuler.ts';` block).

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: fails to start — `SyntaxError` / `does not provide an export named 'worstSample'`.

- [ ] **Step 3: Implement**

In `src/lib/chipRuler.ts`, replace the `CALIBRATION_STEPS` block:

```ts
/**
 * The stacks calibration asks for by default, tallest first — you take chips OFF one
 * stack rather than building three.
 *
 * Three rather than two, and none of them 30. A line through two points is exact by
 * construction, so a two-drag calibration can never report a residual and a shaky
 * drag looks exactly like a steady one. The third drag does not improve the slope —
 * the endpoints already set that — it is there so the fit has something to disagree
 * with, which is the only way `rms` can exist.
 *
 * And 30 chips is a stack most ladders cannot show: a phone holds about 27 at a
 * typical chip height. These are DEFAULTS, though: the sheet lets each one be
 * changed, because the number of chips is the user's to state and not ours to assume.
 */
export const CALIBRATION_STEPS = [20, 12, 6] as const;

/**
 * How far a set of calibration drags may fall from the line through them, in CHIPS,
 * before it is refused.
 *
 * Half a chip. Thumb wobble is two or three CSS px — about a tenth of a chip — so
 * this is loose enough to accept an ordinary set and tight enough to catch the one
 * drag that landed on the wrong chip: a 40 px blunder among three fits at about 0.9.
 */
export const MAX_RMS_CHIPS = 0.5;
```

Add the optional fields to `RulerCalibration` (after `samples`):

```ts
  /**
   * How far the calibration drags fell from the fitted line, in CHIPS (RMS).
   *
   * Undefined when there is nothing to report rather than zero: a two-point fit, a
   * carried-`px` re-zero and a slid line all pass exactly through their own data, so
   * a zero here would be a claim of perfect accuracy made by arithmetic.
   */
  rms?: number;
  /** the tallest stack the fit was anchored on, so a readout can say "±0.3 on a 20" */
  span?: number;
  /** when it was measured, ms since epoch */
  at?: number;
```

Replace the body of `fitCalibration` and add the two helpers below it:

```ts
export function fitCalibration(samples: RulerSample[], now = Date.now()): RulerCalibration | null {
  const pts = samples.filter((p) => Number.isFinite(p.y) && Number.isFinite(p.chips) && p.chips > 0);
  const line = lineOf(pts);
  if (!line) return null;

  const { px } = line;
  if (!(px >= MIN_PX_PER_CHIP && px <= MAX_PX_PER_CHIP)) return null;

  // The table cannot be ABOVE the screen's bottom edge. A hair negative is drag
  // noise and gets flattened; more than a chip's worth means the drags do not
  // describe one straight line, and there is nothing to salvage.
  if (line.zeroPx < -px || line.zeroPx > MAX_ZERO_PX) return null;
  const zeroPx = Math.max(0, line.zeroPx);

  const cal: RulerCalibration = { px, zeroPx, at: now };
  /* Residuals need a third point to exist at all, and they are measured against the
     CLAMPED line — the one the ruler will actually read stacks with, not the raw fit. */
  if (pts.length >= 3) {
    const rms = rmsChips(pts, px, zeroPx);
    if (!(rms <= MAX_RMS_CHIPS)) return null;
    cal.rms = rms;
    cal.span = Math.max(...pts.map((p) => p.chips));
  }
  return cal;
}

/**
 * Least squares through `y = chips·px − zeroPx`, with no opinion about whether the
 * answer is believable. Shared by the fit (which then judges it) and by
 * `worstSample` (which is only called once the fit has already said no).
 */
function lineOf(pts: RulerSample[]): { px: number; zeroPx: number } | null {
  const n = pts.length;
  if (n < 2) return null;
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
  if (!Number.isFinite(px) || !(px > 0)) return null;
  return { px, zeroPx: px * mChips - mY };
}

/** How far these drags sit from that line, as a number of chips. */
function rmsChips(pts: RulerSample[], px: number, zeroPx: number): number {
  const sq = pts.reduce((s, p) => s + (p.y - (p.chips * px - zeroPx)) ** 2, 0);
  return Math.sqrt(sq / pts.length) / px;
}

/**
 * Which of these drags disagrees with the others — the index of the one furthest
 * from the line through all of them, or -1 when there is nothing to single out.
 *
 * Called only after a fit has been refused, and it is what turns "those three drags
 * do not describe one stack, start again" into "drag 2 again". Two of the three were
 * almost certainly fine, and asking for them a second time is how a calibration
 * becomes something people avoid.
 */
export function worstSample(samples: RulerSample[]): number {
  if (samples.length < 3) return -1;
  if (!samples.every((p) => Number.isFinite(p.y) && Number.isFinite(p.chips) && p.chips > 0)) return -1;
  const line = lineOf(samples);
  if (!line) return -1;
  let worst = -1;
  let biggest = -1;
  samples.forEach((p, i) => {
    const err = Math.abs(p.y - (p.chips * line.px - line.zeroPx));
    if (err > biggest) {
      biggest = err;
      worst = i;
    }
  });
  return worst;
}
```

Finally, teach `normalizeCalibrations` about the three new fields. It rebuilds every calibration field by field — which is the whole point, since it is the gate against a hand-edited backup — so anything it does not name is dropped, and the quality readout would go blank after one restart. Replace the tail of that function (the `out[key] = ...` line and the `samples` block above it) with:

```ts
    const samples = Array.isArray(cal.samples)
      ? cal.samples.filter(
          (p) => p && Number.isFinite(p.y) && Number.isFinite(p.chips) && p.chips > 0,
        ).slice(-MAX_SAMPLES)
      : undefined;
    const kept: RulerCalibration = { px: cal.px, zeroPx: cal.zeroPx };
    if (samples?.length) kept.samples = samples;
    /* What the fit thought of itself. Optional, and each one carried only if it is
       still a number: an older calibration has none of these, and a hand-edited one
       may have a string where a residual should be. Losing the readout is a blank
       line in Settings; trusting a made-up one is a ruler claiming an accuracy it
       has never demonstrated. */
    if (Number.isFinite(cal.rms) && (cal.rms as number) >= 0) kept.rms = cal.rms;
    if (Number.isFinite(cal.span) && (cal.span as number) > 0) kept.span = cal.span;
    if (Number.isFinite(cal.at) && (cal.at as number) > 0) kept.at = cal.at;
    out[key] = kept;
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `chipRuler: all checks passed`. The pre-existing checks must all still pass — `CALIBRATION_STEPS` destructures to `TALL = 20, SHORT = 12`, which the old two-point checks handle unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipRuler.ts src/lib/chipRuler.test.ts
git commit -m "$(cat <<'EOF'
feat(ruler): a third drag, so a calibration can disagree with itself

Two points describe exactly one line, which is why a shaky calibration has
always looked identical to a steady one. A third drag creates residuals — not
a better slope, the endpoints already set that — so the fit can finally report
how far the drags fell from it, refuse a mis-drag, and name which one it was.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: One drag re-zeroes a carried chip height

`px` is the chips and the screen density; `zeroPx` is the case lip. Swap the case and only one of the two moves — so a second setup for the same chips needs one drag, not three. `teach()` already does this arithmetic for its slide; extract it so both callers share one implementation.

**Files:**
- Modify: `src/lib/chipRuler.ts` (`teach` at ~line 156)
- Test: `src/lib/chipRuler.test.ts`

**Interfaces:**
- Consumes: `MAX_RMS_CHIPS`, `fitCalibration(samples, now?)` from Task 1.
- Produces: `rezero(px: number, sample: RulerSample, now?: number): RulerCalibration | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/chipRuler.test.ts`, before the final `console.log(failures ? ...)` line:

```ts
/**
 * A new case is not a new chip.
 *
 * `px` is the chips and the density of the glass; `zeroPx` is the lip the phone
 * stands on. Only the second one changes when the case does, so carrying the chip
 * height over and solving the offset from a single drag is not a shortcut — it is
 * the physically correct amount of work.
 */
console.log('');
console.log('a case change is one drag, not three');
{
  const THICKER = 128; // a chunkier case: another 58 px of table below the glass
  const drag = { y: 12 * PX - THICKER, chips: 12 };
  const re = rezero(PX, drag, 1_700_000_000_000);

  check('one drag re-zeroes', re !== null);
  check('the chips are unchanged', re?.px === PX);
  check('the new lip is solved', !!re && Math.abs(re.zeroPx - THICKER) < 1e-9, String(re?.zeroPx));
  check('and it is stamped', re?.at === 1_700_000_000_000);
  check('a re-zero claims no quality', re?.rms === undefined && re?.span === undefined);
  for (const n of [8, 15, 22]) {
    check(`${n} chips reads back exactly`, chipsAt(n * PX - THICKER, re) === n);
  }

  check('an impossible chip height re-zeroes nothing', rezero(MAX_PX_PER_CHIP + 10, drag) === null);
  check('nor does a stack of nothing', rezero(PX, { y: 200, chips: 0 }) === null);
  check('nor NaN', rezero(PX, { y: Number.NaN, chips: 12 }) === null);
  // a drag far above where 12 chips could reach implies a table above the glass
  check('nor a table above the screen', rezero(PX, { y: 12 * PX + 200, chips: 12 }) === null);
  // ...and one far below implies half a metre of case
  check('nor half a metre of case', rezero(PX, { y: 12 * PX - MAX_ZERO_PX - 50, chips: 12 }) === null);
}
```

Add `rezero` to the import list at the top of the file.

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `does not provide an export named 'rezero'`.

- [ ] **Step 3: Implement**

In `src/lib/chipRuler.ts`, add above `teach`:

```ts
/**
 * Keep a chip height and solve the offset from a single drag of known height.
 *
 * `zeroPx = chips·px − y`, which is one equation in one unknown. This is the whole
 * reason a second setup is cheap: taking the case off does not change how thick a
 * chip is or how many pixels an inch of glass has, so the only number that has to be
 * measured again is the lip the phone is standing on.
 *
 * Also what `teach` does when it can only slide the line: the same arithmetic, so
 * the same function, so the same rejections.
 */
export function rezero(
  px: number,
  sample: RulerSample,
  now = Date.now(),
): RulerCalibration | null {
  if (!Number.isFinite(px) || px < MIN_PX_PER_CHIP || px > MAX_PX_PER_CHIP) return null;
  if (!Number.isFinite(sample.y) || !(sample.chips > 0)) return null;
  const raw = sample.chips * px - sample.y;
  if (raw < -px || raw > MAX_ZERO_PX) return null;
  return { px, zeroPx: Math.max(0, raw), at: now };
}
```

Then replace the tail of `teach` (the two lines beginning `// slide the line onto the corrected stack`) with:

```ts
  // slide the line onto the corrected stack, keeping the chip height
  const slid = rezero(cal.px, sample, now);
  if (!slid) return null;
  return { ...slid, samples: fixes };
```

and widen `teach`'s signature to carry the clock:

```ts
export function teach(
  cal: RulerCalibration | null | undefined,
  sample: RulerSample,
  now = Date.now(),
): RulerCalibration | null {
```

Inside `teach`, pass the clock to the refit as well — change `const fitted = fitCalibration(fixes);` to `const fitted = fitCalibration(fixes, now);`.

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `chipRuler: all checks passed`, including the pre-existing `teach` block.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipRuler.ts src/lib/chipRuler.test.ts
git commit -m "$(cat <<'EOF'
feat(ruler): rezero — a case change costs one drag

Taking the case off does not change how thick a chip is or how many pixels an
inch of glass has. Only the lip the phone stands on moves, and that is one
equation in one unknown. teach()'s slide was already doing this arithmetic by
hand, so it now calls the same function and inherits the same rejections.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Setups — a named calibration table

**Files:**
- Modify: `src/lib/chipRuler.ts` (append after `rulerSlots`, at the end of the file)
- Test: `src/lib/chipRuler.test.ts`

**Interfaces:**
- Consumes: `RulerCalibrations`, `calibrationFor`, `withCalibration`, `forgetCalibration`, `normalizeCalibrations` (all already exported).
- Produces:
  - `MAX_SETUP_NAME: number` (24)
  - `interface RulerSetup { id: string; name: string; cals: RulerCalibrations }`
  - `newSetup(name: string, id: string): RulerSetup`
  - `nextSetupId(setups: RulerSetup[]): string`
  - `setupById(setups: RulerSetup[], id: string | null | undefined): RulerSetup | null`
  - `activeSetup(setups: RulerSetup[], id: string | null | undefined): RulerSetup`
  - `withSetupCal(setups, id, key, cal): RulerSetup[]`
  - `withoutSetupCal(setups, id, key): RulerSetup[]`
  - `renameSetup(setups, id, name): RulerSetup[]`
  - `dropSetup(setups, id): RulerSetup[]`
  - `setupsWithCal(setups, key, exceptId): RulerSetup[]`
  - `normalizeSetups(raw: unknown, legacy?: unknown): RulerSetup[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/chipRuler.test.ts`, before the final `console.log(failures ? ...)` line:

```ts
/**
 * The case the phone is wearing.
 *
 * `zeroPx` is a case bottom and a bezel. Take the case off and every stack reads
 * three or four chips too tall — a constant added to every measurement, which is the
 * one error a ruler cannot detect on its own. So a whole calibration table is kept
 * per case, and switching between them is a tap rather than a re-measurement.
 */
console.log('');
console.log('one calibration table per case');
{
  const key = '412x960@2.625:c:p';
  const other = '412x960@2.625:c:l';

  let setups = [newSetup('', 's1')];
  check('a fresh device has one setup', setups.length === 1);
  check('...and it is the active one whatever it is asked for', activeSetup(setups, 'nope').id === 's1');
  check('an unnamed setup is unnamed, not English', setups[0]!.name === '');

  setups = withSetupCal(setups, 's1', key, good!);
  setups = [...setups, newSetup('Blue case', nextSetupId(setups))];
  check('the second setup gets a fresh id', setups[1]!.id === 's2');
  check('and starts unmeasured', Object.keys(setups[1]!.cals).length === 0);
  check('the first one is untouched', calibrationFor(setups[0]!.cals, key)?.px === good!.px);

  setups = withSetupCal(setups, 's2', key, { px: good!.px, zeroPx: 128 });
  check('each case has its own lip', calibrationFor(setups[1]!.cals, key)?.zeroPx === 128);
  check('and the other case still has its own', calibrationFor(setups[0]!.cals, key)?.zeroPx === ZERO);
  check('the same screen reads differently in each', chipsAt(300, setups[0]!.cals[key]) !== chipsAt(300, setups[1]!.cals[key]));

  check('a setup with this screen can lend its chip height', setupsWithCal(setups, key, 's2').length === 1);
  check('...and names which', setupsWithCal(setups, key, 's2')[0]!.id === 's1');
  check('nobody can lend a screen nobody has', setupsWithCal(setups, other, 's2').length === 0);

  setups = renameSetup(setups, 's1', '  No case  ');
  check('a name is trimmed', setupById(setups, 's1')?.name === 'No case');
  setups = renameSetup(setups, 's1', '   ');
  check('and an empty rename is refused', setupById(setups, 's1')?.name === 'No case');
  check('a name cannot run away', renameSetup(setups, 's1', 'x'.repeat(80))[0]!.name.length === MAX_SETUP_NAME);

  const forgotten = withoutSetupCal(setups, 's2', key);
  check('one setup can forget one screen', calibrationFor(forgotten[1]!.cals, key) === null);
  check('...without touching the other setup', calibrationFor(forgotten[0]!.cals, key) !== null);

  const dropped = dropSetup(setups, 's2');
  check('a setup can be dropped', dropped.length === 1 && dropped[0]!.id === 's1');
  check('but never the last one', dropSetup(dropped, 's1').length === 1);
  check('dropping the active one falls back to what is left', activeSetup(dropped, 's2').id === 's1');
}

/**
 * What comes off disk is user data that has been through a backup file, a merge and
 * possibly a text editor. A ruler that trusts it is confidently wrong at a table.
 */
console.log('');
console.log('setups that survive the trip back from disk');
{
  const key = '412x960@2.625:c:p';
  const legacy = normalizeSetups(undefined, { [key]: good });
  check('an old per-screen map becomes the first setup', legacy.length === 1 && legacy[0]!.id === 's1');
  check('...carrying its calibration', calibrationFor(legacy[0]!.cals, key)?.px === good!.px);

  check('nothing at all is still one setup', normalizeSetups(undefined, undefined).length === 1);
  check('...and an empty one', Object.keys(normalizeSetups(null, null)[0]!.cals).length === 0);
  check('a junk field is not a crash', normalizeSetups('setups', null).length === 1);

  const dirty = normalizeSetups([
    { id: 's1', name: 'No case', cals: { [key]: good } },
    { id: 's1', name: 'a twin', cals: {} },
    { name: 'nameless', cals: {} },
    'nonsense',
    { id: 's4', name: 42, cals: { [key]: { px: 900, zeroPx: 10 } } },
  ], null);
  check('a good setup survives', dirty[0]?.id === 's1' && dirty[0]?.name === 'No case');
  check('a duplicate id does not', dirty.filter((s) => s.id === 's1').length === 1);
  check('nor an entry with no id', !dirty.some((s) => s.name === 'nameless'));
  check('nor a string', dirty.length === 2, String(dirty.length));
  check('a non-string name is dropped, the setup is not', dirty[1]?.id === 's4' && dirty[1]?.name === '');
  check('and its impossible calibration is', Object.keys(dirty[1]?.cals ?? {}).length === 0);

  // the legacy map is only a fallback: real setups win
  const both = normalizeSetups([{ id: 's7', name: 'Real', cals: {} }], { [key]: good });
  check('a stored setup beats the legacy map', both.length === 1 && both[0]!.id === 's7');
  check('and the legacy map is not smuggled in', Object.keys(both[0]!.cals).length === 0);
}
```

Add `MAX_SETUP_NAME`, `activeSetup`, `dropSetup`, `newSetup`, `nextSetupId`, `normalizeSetups`, `renameSetup`, `setupById`, `setupsWithCal`, `withSetupCal`, `withoutSetupCal` to the import list at the top of the file.

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `does not provide an export named 'newSetup'`.

- [ ] **Step 3: Implement**

Append to the end of `src/lib/chipRuler.ts`:

```ts
/* ------------------------------------------------------------------
   Which case is the phone wearing?
   ------------------------------------------------------------------
   `screenKeyOf` above answers "which piece of glass, held which way up", and it
   answers it on its own — the app can see the screen and the orientation. What it
   cannot see is the CASE, and the case is half the calibration: `zeroPx` is a case
   bottom plus a bezel below the lowest pixel. Take the case off and every stack
   reads three or four chips too tall, which is a constant added to every
   measurement — the one error a ruler cannot detect by looking at its own numbers.

   So the case is the one axis the user has to state, and it is stated once: a
   SETUP is a name and a whole per-screen calibration table. A Fold with two cases
   has eight slots, each measured once and kept. Switching is a tap in the sheet.

   Nothing below this line knows what a case is. A setup is a named box around the
   map that already existed, which is why `screenKeyOf`, `rulerSlots`, `teach` and
   everything else carried on working untouched. */

/** How long a setup's name may be. Long enough for "Blue silicone", short enough for a pill. */
export const MAX_SETUP_NAME = 24;

/** One named case, and everything measured while wearing it. */
export interface RulerSetup {
  /** stable and never reused — the active setup is remembered by it */
  id: string;
  /** what the user called it, or '' for the first one, which is named by the UI */
  name: string;
  /** the per-screen calibrations, keyed by `screenKeyOf` exactly as before */
  cals: RulerCalibrations;
}

export function newSetup(name: string, id: string): RulerSetup {
  return { id, name: name.trim().slice(0, MAX_SETUP_NAME), cals: {} };
}

/** The lowest `sN` nobody is using. Ids are never reused, so an old one can't be revived. */
export function nextSetupId(setups: RulerSetup[]): string {
  const taken = new Set(setups.map((s) => s.id));
  let n = 1;
  while (taken.has(`s${n}`)) n++;
  return `s${n}`;
}

export function setupById(
  setups: RulerSetup[],
  id: string | null | undefined,
): RulerSetup | null {
  return setups.find((s) => s.id === id) ?? null;
}

/**
 * The setup being measured with, whatever the stored id says.
 *
 * Falls back to the first setup rather than returning null, and to an empty one
 * rather than throwing: every caller of this is about to read a calibration or write
 * one, and there is no useful behaviour for "the ruler has nowhere to keep this".
 * `normalizeSetups` guarantees at least one setup exists, so the last fallback is
 * unreachable in practice and is here to keep the type honest.
 */
export function activeSetup(setups: RulerSetup[], id: string | null | undefined): RulerSetup {
  return setupById(setups, id) ?? setups[0] ?? newSetup('', 's1');
}

/** Store one screen's calibration in one setup, leaving every other setup alone. */
export function withSetupCal(
  setups: RulerSetup[],
  id: string,
  key: string,
  cal: RulerCalibration,
): RulerSetup[] {
  return setups.map((s) => (s.id === id ? { ...s, cals: withCalibration(s.cals, key, cal) } : s));
}

/** "Measure this screen again" — for one setup only. */
export function withoutSetupCal(setups: RulerSetup[], id: string, key: string): RulerSetup[] {
  return setups.map((s) => (s.id === id ? { ...s, cals: forgetCalibration(s.cals, key) } : s));
}

/** Rename a setup. An empty name keeps the old one: a nameless pill is a pill nobody can read. */
export function renameSetup(setups: RulerSetup[], id: string, name: string): RulerSetup[] {
  const clean = name.trim().slice(0, MAX_SETUP_NAME);
  return setups.map((s) => (s.id === id && clean ? { ...s, name: clean } : s));
}

/** Drop a setup — never the last one, because the ruler must always have somewhere to write. */
export function dropSetup(setups: RulerSetup[], id: string): RulerSetup[] {
  if (setups.length < 2) return setups;
  const next = setups.filter((s) => s.id !== id);
  return next.length ? next : setups;
}

/**
 * The other setups that already know this screen — the ones that can lend a chip
 * height so a new case takes one drag instead of three.
 */
export function setupsWithCal(
  setups: RulerSetup[],
  key: string,
  exceptId: string | null | undefined,
): RulerSetup[] {
  return setups.filter((s) => s.id !== exceptId && !!calibrationFor(s.cals, key));
}

/**
 * Everything that comes off disk, made safe.
 *
 * Entry by entry rather than all-or-nothing: one hand-edited setup should not cost
 * the user the other three. A setup with no usable id is dropped, a non-string name
 * becomes the unnamed one (the UI has a word for that), and each setup's map goes
 * through `normalizeCalibrations`, which already refuses an impossible chip height.
 *
 * `legacy` is the older `chipRulerCals` map, from before a device could have two
 * cases. It is used ONLY when no setup survives, and it becomes the first setup —
 * the same adoption the even older single `chipRuler` field got. Nothing is asked of
 * the user and no calibration is lost.
 *
 * Always returns at least one setup. Every caller assumes that.
 */
export function normalizeSetups(raw: unknown, legacy?: unknown): RulerSetup[] {
  const out: RulerSetup[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const s = item as Partial<RulerSetup>;
      if (typeof s.id !== 'string' || !s.id) continue;
      if (out.some((k) => k.id === s.id)) continue;
      out.push({
        id: s.id,
        name: typeof s.name === 'string' ? s.name.trim().slice(0, MAX_SETUP_NAME) : '',
        cals: normalizeCalibrations(s.cals),
      });
    }
  }
  if (!out.length) out.push({ id: 's1', name: '', cals: normalizeCalibrations(legacy) });
  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `chipRuler: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipRuler.ts src/lib/chipRuler.test.ts
git commit -m "$(cat <<'EOF'
feat(ruler): a calibration table per case

screenKeyOf answers "which glass, held which way up" on its own. The case is the
half the app cannot see, and it is half the calibration — zeroPx is a case bottom
and a bezel. So it becomes the one axis the user states, once: a setup is a name
around the per-screen map that already existed. Nothing below that line had to
change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Settings fields, scope and the load-time migration

**Files:**
- Modify: `src/types.ts` (the `chipRuler` / `chipRulerCals` block at ~line 119-131)
- Modify: `src/lib/settingsScope.ts` (`DEVICE_LOCAL_SETTINGS`, the `chipRuler` entries at ~line 45-46)
- Modify: `src/store.tsx` (the `normalizeCalibrations` call at ~line 916)
- Test: `src/lib/settingsScope.test.ts`

**Interfaces:**
- Consumes: `normalizeSetups`, `setupById`, `RulerSetup` from Task 3.
- Produces: `Settings.chipRulerSetups?: StoredSetup[]`, `Settings.chipRulerSetupId?: string`, and the exported `StoredCalibration` type in `src/types.ts`.

- [ ] **Step 1: Write the failing test**

In `src/lib/settingsScope.test.ts`, add two fields to the `phone` fixture, immediately after the existing `chipRulerCals:` line:

```ts
  chipRulerSetups: [{ id: 's1', name: 'No case', cals: { '412x960@2.625:c:p': { px: 20.8, zeroPx: 70 } } }],
  chipRulerSetupId: 's1',
```

Add one field to the second fixture (the one at ~line 94-95 with `chipRulerCals: {}`) — and only one, since both are optional and an explicit `undefined` is a different thing from an absent key:

```ts
  chipRulerSetups: [],
```

Then, next to the existing `check('nor the ruler this screen was calibrated with', ...)` line, add:

```ts
check('nor which case it was wearing', (legacy.chipRulerSetups ?? []).length === 0);
check('nor which of them is in use', legacy.chipRulerSetupId === undefined);
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --experimental-strip-types src/lib/settingsScope.test.ts
```

Expected: the two new checks print `FAIL` (the fields are not yet stripped), and the script exits non-zero.

- [ ] **Step 3: Implement**

In `src/types.ts`, replace the whole `chipRuler` / `chipRulerCals` block with:

```ts
  /** One screen's chip-ruler calibration, as stored. Structurally the same as
   *  `RulerCalibration` in lib/chipRuler.ts, written out here rather than imported
   *  so `Settings` stays a plain description of what is on disk. */
  chipRuler?: StoredCalibration | null;
  /** LEGACY: the chip ruler's calibrations per screen, from before a device could
   *  have two CASES. `zeroPx` is a case bottom plus a bezel, so taking the case off
   *  shifts every stack — which is why these now live inside a named setup. Kept
   *  only so an existing map can be folded into the first setup at load; nothing
   *  reads it afterwards. */
  chipRulerCals?: Record<string, StoredCalibration>;
  /** The chip ruler's calibrations grouped by SETUP: a named case ("No case", "Blue
   *  case"), each holding its own per-screen map keyed by `screenKeyOf()`. Always at
   *  least one entry after load; see lib/chipRuler.ts. Device-local by nature — a
   *  case is a fact about this phone, not about the night. */
  chipRulerSetups?: { id: string; name: string; cals: Record<string, StoredCalibration> }[];
  /** Which setup the ruler measures with right now. Falls back to the first. */
  chipRulerSetupId?: string;
```

and add, above the `Settings` interface:

```ts
/** One screen's chip-ruler calibration as it is stored: CSS pixels per chip, how far
 *  below the glass the table sits, the hand corrections it has learned from, and how
 *  well its calibration drags agreed. See lib/chipRuler.ts. */
export interface StoredCalibration {
  px: number;
  zeroPx: number;
  samples?: { y: number; chips: number }[];
  rms?: number;
  span?: number;
  at?: number;
}
```

In `src/lib/settingsScope.ts`, replace the two ruler lines inside `DEVICE_LOCAL_SETTINGS`:

```ts
  'chipRuler',
  'chipRulerCals',
  // ...and which case the phone is wearing, which is the other half of that
  // calibration and just as much a fact about this device
  'chipRulerSetups',
  'chipRulerSetupId',
```

In `src/store.tsx`, replace the `settings.chipRulerCals = normalizeCalibrations(settings.chipRulerCals);` line and the comment above it with:

```ts
  /* The chip ruler measures against ONE piece of glass WEARING ONE CASE, so its
     calibrations are a map keyed by screen, inside a setup named after the case.
     Anything in there that is not a believable calibration is dropped rather than
     carried: a ruler that trusts a hand-edited backup is confidently wrong at a
     table, which is worse than asking for a few drags.

     A map stored before setups existed becomes the first setup and the old field is
     emptied — the same adoption the even older single `chipRuler` got. */
  settings.chipRulerSetups = normalizeSetups(settings.chipRulerSetups, settings.chipRulerCals);
  settings.chipRulerCals = {};
  if (!setupById(settings.chipRulerSetups, settings.chipRulerSetupId)) {
    settings.chipRulerSetupId = settings.chipRulerSetups[0]!.id;
  }
```

and update the import in `src/store.tsx` — replace `normalizeCalibrations` with `normalizeSetups, setupById` in the `from './lib/chipRuler'` import (check whether `normalizeCalibrations` is still used elsewhere in the file first with `grep -n normalizeCalibrations src/store.tsx`; if not, drop it).

- [ ] **Step 4: Run the tests and the typecheck**

```bash
npm test
```

Expected: all test files pass, including the two new `settingsScope` checks.

```bash
npm run build
```

Expected: no TypeScript errors. `ChipRuler.tsx` still compiles because it reads `chipRulerCals`, which still exists (now always `{}` after load — the sheet is fixed in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/settingsScope.ts src/lib/settingsScope.test.ts src/store.tsx
git commit -m "$(cat <<'EOF'
feat(ruler): store setups, and fold the old per-screen map into the first one

Both new fields are device-local: a case is a fact about this phone, and a setup
that travelled inside a share code would hand someone else's case lip to a
stranger's ruler. Existing installs are migrated at load and asked nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The sheet reads and writes the active setup

No visible change: with exactly one setup the ruler behaves identically. This task exists on its own so the swap can be reviewed without any UI noise around it.

**Files:**
- Modify: `src/components/ChipRuler.tsx` (imports; `cals`/`legacy` at ~line 111-113; the adopt effect at ~line 148-158; `submitTyped` at ~line 305; `nextCalStep` at ~line 348-353)

**Interfaces:**
- Consumes: `activeSetup`, `withSetupCal` from Task 3; `Settings.chipRulerSetups` / `chipRulerSetupId` from Task 4.
- Produces: nothing new; later tasks in this file rely on the locals `setups`, `setup`, `cals` and the helper `saveCal(cal)`.

- [ ] **Step 1: Point the sheet at the active setup**

In `src/components/ChipRuler.tsx`, add `activeSetup` and `withSetupCal` to the `from '../lib/chipRuler'` import.

Replace:

```ts
  const cals = state.settings.chipRulerCals;
  const legacy = state.settings.chipRuler;
```

with:

```ts
  /* Which case the phone is wearing. `screenKeyOf` below can see the glass and the
     orientation on its own; the case is the half it cannot see, and it is the half
     `zeroPx` is made of. Everything under here still deals in one per-screen map —
     it is just this setup's map now. */
  const setups = state.settings.chipRulerSetups ?? [];
  const setup = activeSetup(setups, state.settings.chipRulerSetupId);
  const cals = setup.cals;
  const legacy = state.settings.chipRuler;
```

- [ ] **Step 2: Add one place that writes a calibration**

Immediately after the `const cal = calibrationFor(cals, screen);` line, add:

```ts
  /** Store a calibration for the screen the sheet is on, in the setup it is using. */
  const saveCal = (next: RulerCalibration) =>
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: {
        chipRulerSetups: withSetupCal(setups, setup.id, screen, next),
        chipRulerSetupId: setup.id,
        chipRuler: null,
      },
    });
```

Add `import type { RulerCalibration } from '../lib/chipRuler';` alongside the existing value import (or extend the existing `import type { Denomination } from '../types';` line with a second type-only import statement).

- [ ] **Step 3: Route the three existing writes through it**

Replace the body of the adopt effect:

```ts
  useEffect(() => {
    if (adopted.current || !isCalibrated(legacy) || Object.keys(cals ?? {}).length > 0) return;
    adopted.current = true;
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: { chipRulerCals: withCalibration(cals, screen, legacy), chipRuler: null },
    });
  }, [legacy, cals, screen, dispatch]);
```

with:

```ts
  useEffect(() => {
    if (adopted.current || !isCalibrated(legacy) || Object.keys(cals ?? {}).length > 0) return;
    adopted.current = true;
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: {
        chipRulerSetups: withSetupCal(setups, setup.id, screen, legacy),
        chipRulerSetupId: setup.id,
        chipRuler: null,
      },
    });
  }, [legacy, cals, screen, setups, setup.id, dispatch]);
```

The dispatch is written out here rather than calling `saveCal`, so the dependency list stays honest — `saveCal` closes over `setups` and `screen`, and a helper in the deps of an effect that runs once is a lie waiting to be believed.

In `submitTyped`, replace:

```ts
        dispatch({ type: 'UPDATE_SETTINGS', patch: { chipRulerCals: withCalibration(cals, screen, next) } });
```

with:

```ts
        saveCal(next);
```

In `nextCalStep`, replace:

```ts
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: { chipRulerCals: withCalibration(cals, screen, solved), chipRuler: null },
    });
```

with:

```ts
    saveCal(solved);
```

Remove `withCalibration` from the import list if nothing else in the file uses it (`grep -n withCalibration src/components/ChipRuler.tsx`).

- [ ] **Step 4: Verify**

```bash
npm run build
```

Expected: no TypeScript errors, no unused-import errors.

```bash
npm run lint
```

Expected: clean.

Then run the app and confirm the ruler is unchanged: `npm run dev`, open a player's stack → 📏 Measure, calibrate, measure a stack. An install that already had a calibration must **not** ask to calibrate again — that is the migration working.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChipRuler.tsx
git commit -m "$(cat <<'EOF'
refactor(ruler): the sheet writes into the active setup

No behaviour change with one setup — the map it reads is the same map, reached
through the case it belongs to. Three scattered dispatches become one saveCal(),
so the next commit has a single place to add the setup switch to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The bar snaps to the chip line

**Files:**
- Modify: `src/components/ChipRuler.tsx` (`dragPx`/`touched` state at ~line 186-192; `moveTo`; `nudge`; `log`; `nextCalStep`'s ceiling check; the fold-change effect; `restartCalibration`)

**Interfaces:**
- Consumes: `spanFor`, `chipsAt`, `isCalibrated` (already imported).
- Produces: the local `rawPx` state — the honest drag position, in ladder pixels — which Task 7 uses for its calibration samples.

- [ ] **Step 1: Split the drag into what is drawn and what is meant**

Replace:

```ts
  /** how far the bar sits above the bottom edge of the screen */
  const [dragPx, setDragPx] = useState(0);
```

with:

```ts
  /**
   * The bar, twice: where the finger actually is, and where the bar is drawn.
   *
   * They differ because the bar LOCKS to the chip line it will be read as. Rounding
   * used to be something you discovered after logging a stack — the bar sat between
   * two ticks and the number jumped on its own. Locked, the ladder shows the answer
   * before it is committed, and the per-chip buzz already lands on the same edges.
   *
   * `rawPx` is what the maths gets. Snapping a CORRECTION would quantise it by up to
   * half a chip, and a correction is the only calibration data that ever arrives in
   * the range the counting really happens in — biasing it would be the one thing
   * guaranteed not to fix a bad calibration.
   */
  const [rawPx, setRawPx] = useState(0);
  const [dragPx, setDragPx] = useState(0);
```

- [ ] **Step 2: Snap on the way in**

Replace `moveTo` with:

```ts
  /** where the bar is DRAWN for a finger at `y`: on the chip line it reads as */
  const snapped = (y: number) => {
    if (calibrating || !isCalibrated(cal)) return y;
    const locked = spanFor(chipsAt(y + belowPx, cal), cal) - belowPx;
    return Math.max(0, Math.min(trackPx, locked));
  };

  const moveTo = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, rect.bottom - clientY));
    setRawPx(y);
    setDragPx(snapped(y));
    setTouched(true);
    setCalError(false);
    setCalTooTall(false);
    setLearn(null);
    if (!calibrating) buzzFor(chipsAt(y + belowPx, cal));
  };
```

- [ ] **Step 3: Every other place the bar moves**

Change `dragAbs` to read the honest number:

```ts
  const dragAbs = rawPx + belowPx;
```

In `nudge`, replace the body after the `const next = ...` line with:

```ts
    const y = Math.max(0, Math.min(trackPx, spanFor(next, cal) - belowPx));
    setRawPx(y);
    setDragPx(y);
    buzzFor(next);
```

In `log`, replace `setDragPx(0);` with:

```ts
    setRawPx(0);
    setDragPx(0);
```

In `nextCalStep`, replace the ceiling check `if (trackPx > 0 && dragPx >= trackPx - 2) {` with:

```ts
    if (trackPx > 0 && rawPx >= trackPx - 2) {
```

and replace each of the two `setDragPx(0);` calls in that function with the `setRawPx(0); setDragPx(0);` pair.

In the fold-change effect and in `restartCalibration`, do the same: every `setDragPx(0)` becomes `setRawPx(0); setDragPx(0);`.

- [ ] **Step 4: Verify**

```bash
npm run build && npm run lint
```

Expected: clean.

Then `npm run dev`, open the ruler on a calibrated screen and drag. The bar must move in chip-sized detents that land exactly on the tick lines, the number under it must never disagree with the tick it sits on, and `−`/`+` must still move it one chip. While **calibrating** the bar must move smoothly with no snapping — there is no scale yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChipRuler.tsx
git commit -m "$(cat <<'EOF'
feat(ruler): the bar locks to the chip line it reads as

Rounding used to be something you found out after logging the stack: the bar sat
between two ticks and the number picked one. It now draws on the line it will be
read as. The raw finger position is kept for the maths — snapping a correction
would quantise it by half a chip, and corrections are the only calibration data
that arrive in the range the counting actually happens in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Three drags, each with a count you can change

**Files:**
- Modify: `src/components/ChipRuler.tsx` (calibration state at ~line 209-216; `nextCalStep`; `restartCalibration`; the fold-change effect; the calibrating hint JSX; the `ruler-foot` JSX; the bar's `ruler-read` JSX)
- Modify: `src/lib/i18n.ts` (`en` and `de`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `CALIBRATION_STEPS` (now length 3), `fitCalibration(samples, now?)`, `worstSample`, `spanFor` from Tasks 1 and 6.
- Produces: the local `calCounts: number[]` / `calDrags: RulerSample[]` state, which Task 8's one-drag door replaces the contents of.

- [ ] **Step 1: Replace the two-drag state**

In `src/components/ChipRuler.tsx`, add `fitCalibration` and `worstSample` to the `from '../lib/chipRuler'` import and `import type { RulerSample } from '../lib/chipRuler';`. Add near the other module constants at the top of the file:

```ts
/** how far above the glass the shortest calibration stack must top out, in CSS px */
const MIN_STEP_PX = 12;
```

Replace:

```ts
  const [calFirst, setCalFirst] = useState<{ y: number; chips: number } | null>(null);
```

with:

```ts
  /**
   * How many chips each calibration drag is standing next to.
   *
   * Editable, because a fixed number is a dead end: a stack of 20 that does not fit
   * the ladder used to leave the flow with nothing to do but restart, and 6 chips
   * disappear entirely behind a thick case's lip. The user states what is on the
   * table; the app fits a line through whatever they say.
   */
  const [calCounts, setCalCounts] = useState<number[]>(() => [...CALIBRATION_STEPS]);
  /** the drags taken so far, one per step — a hole while a single bad one is redone */
  const [calDrags, setCalDrags] = useState<(RulerSample | undefined)[]>([]);
  /** which drag the fit blamed, so the sheet can ask for that one back */
  const [calBad, setCalBad] = useState<number | null>(null);
```

- [ ] **Step 2: Rewrite `nextCalStep`**

Replace the whole function with:

```ts
  /** the drags actually taken, with the holes removed — never a cast */
  const taken = (list: (RulerSample | undefined)[]) =>
    list.filter((d): d is RulerSample => !!d);

  const setCount = (i: number, n: number) => {
    /* Strictly decreasing, because that is the physical act: one stack, chips coming
       off it. Two steps claiming the same height would also give the fit two points
       it cannot draw a slope through. */
    const lo = i + 1 < calCounts.length ? calCounts[i + 1]! + 1 : 2;
    const hi = i > 0 ? calCounts[i - 1]! - 1 : 99;
    setCalCounts((c) => c.map((v, j) => (j === i ? Math.max(lo, Math.min(hi, n)) : v)));
  };

  const nextCalStep = () => {
    const step = calStep ?? 0;
    /* A stack taller than the ladder pins the bar at the ceiling, and the drag then
       says "this stack is exactly as tall as the screen" — a lie the fit cannot see
       through, and the fastest way to a calibration that reads 18 chips as 13. */
    if (trackPx > 0 && rawPx >= trackPx - 2) {
      setCalTooTall(true);
      return;
    }

    const drags = calDrags.slice();
    drags[step] = { y: dragAbs, chips: calCounts[step]! };
    setCalDrags(drags);
    setCalBad(null);

    const missing = calCounts.findIndex((_, i) => !drags[i]);
    if (missing >= 0) {
      /* Two drags are already a provisional line, and it is worth using: the default
         third stack is six chips, which on a chunky case tops out BELOW the glass and
         cannot be dragged to at all. Raise it until it is somewhere the thumb can
         reach, rather than asking for a stack the phone is standing on top of. */
      if (taken(drags).length === 2) {
        const rough = fitCalibration(taken(drags));
        if (rough) {
          setCalCounts((c) => {
            const want = [...c];
            const ceiling = want[missing - 1] ?? 99;
            let n = want[missing]!;
            while (n < ceiling - 1 && spanFor(n, rough) <= MIN_STEP_PX) n++;
            want[missing] = n;
            return want;
          });
        }
      }
      setCalStep(missing);
      setRawPx(0);
      setDragPx(0);
      setTouched(false);
      haptic(12);
      return;
    }

    const solved = fitCalibration(taken(drags));
    if (!solved) {
      /* Two of the three were almost certainly fine. Asking for all of them again is
         how a calibration becomes something people avoid, so the fit names the drag
         that disagrees and only that one is taken again. */
      const bad = worstSample(taken(drags));
      setCalBad(bad >= 0 ? bad : null);
      setCalError(true);
      setCalDrags(bad >= 0 ? drags.map((d, i) => (i === bad ? undefined : d)) : []);
      setCalStep(bad >= 0 ? bad : 0);
      setRawPx(0);
      setDragPx(0);
      setTouched(false);
      return;
    }

    saveCal(solved);
    setCalStep(null);
    setCalDrags([]);
    setRawPx(0);
    setDragPx(0);
    setTouched(false);
    haptic([12, 60, 12]);
    if (calibrateOnly) onClose();
  };
```

In `restartCalibration` and in the fold-change effect, replace `setCalFirst(null);` with:

```ts
    setCalDrags([]);
    setCalBad(null);
    setCalCounts([...CALIBRATION_STEPS]);
```

- [ ] **Step 3: The stepper, and what the sheet says**

Replace the calibrating hint block:

```tsx
      {calibrating ? (
        <p className="ruler-hint">
          {t(calStep === 0 ? 'ruler.calibrateTall' : 'ruler.calibrateShort', {
            n: CALIBRATION_STEPS[calStep ?? 0],
          })}
        </p>
      ) : (
```

with:

```tsx
      {calibrating ? (
        <>
          <p className="ruler-hint">
            {t(taken(calDrags).length === 0 ? 'ruler.calibrateTall' : 'ruler.calibrateShort')}
          </p>
          <div className="ruler-step">
            <button
              className="cr-btn"
              onClick={() => setCount(calStep ?? 0, (calCounts[calStep ?? 0] ?? 0) - 1)}
              aria-label="−1"
            >
              −
            </button>
            <b>{calCounts[calStep ?? 0]}</b>
            <button
              className="cr-btn"
              onClick={() => setCount(calStep ?? 0, (calCounts[calStep ?? 0] ?? 0) + 1)}
              aria-label="+1"
            >
              +
            </button>
            <span>{t('ruler.calibrateCount')}</span>
          </div>
        </>
      ) : (
```

In the bar's read-out, replace `t('ruler.calibrateRead', { n: CALIBRATION_STEPS[calStep ?? 0] })` with:

```tsx
              t('ruler.calibrateRead', { n: calCounts[calStep ?? 0] ?? 0 })
```

In `ruler-foot`, replace the `calError` branch so a named drag says which one:

```tsx
            : calError
              ? calBad !== null
                ? t('ruler.calibrateRedo', { i: calBad + 1 })
                : t('ruler.calibrateBad')
```

Finally, in the header, replace the calibrate button's label expression `t(calStep === 0 ? 'ruler.calibrateNext' : 'ruler.calibrateSaveShort')` with:

```tsx
              {t(taken(calDrags).length + 1 >= calCounts.length ? 'ruler.calibrateSaveShort' : 'ruler.calibrateNext')}
```

- [ ] **Step 4: Strings and style**

In `src/lib/i18n.ts`, in the `en` dictionary, replace `'ruler.calibrateTall'` and `'ruler.calibrateShort'` (the count moved into the stepper, so it leaves the sentence) and add three keys beside them:

```ts
    'ruler.calibrateTall': 'Stand the phone on the table with a stack of chips against it, say how many, then drag the bar to the top of them.',
    'ruler.calibrateShort': 'Now take some chips off, say how many are left, and drag the bar to the top again.',
    'ruler.calibrateCount': 'chips in the stack',
    'ruler.calibrateRedo': 'Drag {i} does not agree with the other two — just that one again.',
    'ruler.calibrateWhy': 'Three heights: two set the scale, the third says how much to trust it. Once only — any colour will do.',
```

and in the `de` dictionary:

```ts
    'ruler.calibrateTall': 'Handy auf den Tisch stellen, einen Stapel Chips daneben, die Anzahl angeben und den Balken an die Oberkante ziehen.',
    'ruler.calibrateShort': 'Jetzt ein paar Chips abnehmen, die neue Anzahl angeben und den Balken erneut an die Oberkante ziehen.',
    'ruler.calibrateCount': 'Chips im Stapel',
    'ruler.calibrateRedo': 'Zug {i} passt nicht zu den anderen beiden — nur den noch einmal.',
    'ruler.calibrateWhy': 'Drei Höhen: zwei ergeben den Maßstab, die dritte sagt, wie sehr man ihm trauen kann. Nur einmal nötig — Farbe egal.',
```

In `src/styles.css`, add after the `.ruler-hint` rule:

```css
/* The stack's size, stated rather than assumed: a fixed 20 dead-ends on a short
   ladder and a fixed 6 hides under a thick case. Above the ladder, like everything
   else here — nothing may sit below it or float over its foot. */
.ruler-step { display: flex; align-items: center; gap: 8px; margin: 8px 16px 0; }
.ruler-step .cr-btn { min-width: 34px; height: 34px; }
.ruler-step b { min-width: 30px; text-align: center; font-size: 19px;
  font-family: var(--font-display); font-variant-numeric: tabular-nums; }
.ruler-step > span:last-child { font-size: 12.5px; color: var(--text-dim); }
```

- [ ] **Step 5: Verify**

```bash
npm test && npm run build && npm run lint
```

Expected: all clean.

Then `npm run dev` → Settings → Chip ruler → Calibrate. Confirm: the header says "step 1 of 3"; the stepper changes the count and refuses to cross its neighbours; a drag pinned at the top still says the stack is too tall; three honest drags save and close; three drags with one deliberately wrong (drag to a wildly wrong place on step 2) come back with "Drag 2 does not agree…" and ask only for step 2.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChipRuler.tsx src/lib/i18n.ts src/styles.css
git commit -m "$(cat <<'EOF'
feat(ruler): three drags, and the stack size is yours to state

A hardcoded 20 dead-ends on a ladder too short to show it, and a hardcoded 6
disappears behind a thick case's lip. The count is now a stepper, the third
default climbs off the glass using the line the first two already drew, and a
refused fit asks for the one drag that disagreed rather than all three.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The setup pill, the picker, and the one-drag door

**Files:**
- Modify: `src/components/ChipRuler.tsx` (header JSX; new picker panel above `.ruler-strip`; calibration solve path)
- Modify: `src/lib/i18n.ts` (`en` and `de`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `newSetup`, `nextSetupId`, `renameSetup`, `rezero`, `setupsWithCal`, `calibrationFor` from Tasks 2 and 3; `saveCal`, `setups`, `setup` from Task 5; `calCounts`, `calDrags` from Task 7.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: State and helpers**

Add `newSetup`, `nextSetupId`, `rezero`, `setupsWithCal` to the `from '../lib/chipRuler'` import. Add state beside the other calibration state:

```ts
  /** the setup list is open */
  const [picking, setPicking] = useState(false);
  /** naming a new setup — null when not */
  const [newName, setNewName] = useState<string | null>(null);
  /**
   * Which setup is lending its chip height, or null for a full calibration.
   *
   * A case changes `zeroPx` and nothing else — `px` is the chips and the density of
   * the glass, neither of which the case touches. So a second setup for the same
   * chips is one equation in one unknown, and asking for three drags would be asking
   * for work that has already been done.
   */
  const [carry, setCarry] = useState<string | null>(null);
```

Add helpers below `saveCal`:

```ts
  /** what to call a setup — the first one is unnamed in the store and named here */
  const setupName = (s: RulerSetup) => s.name || t('ruler.setupFirst');
  /** the setups that already know this screen and could lend their chip height */
  const donors = setupsWithCal(setups, screen, setup.id);

  /* `pickSetup`, not `useSetup`: `.oxlintrc.json` runs `react/rules-of-hooks` as an
     error, and anything named `useX` is treated as a hook — this is called from
     `onClick`, which would be "a hook called inside a callback". */
  const pickSetup = (id: string, list = setups) => {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { chipRulerSetups: list, chipRulerSetupId: id } });
    setPicking(false);
    setNewName(null);
    /* Same reset as folding the phone: a different case is a different offset, so the
       bar stops meaning anything until it is dragged again. The logged stacks stay —
       they are counts of chips, and no case changes how many chips were in a pile. */
    setRawPx(0);
    setDragPx(0);
    setTouched(false);
    setCalDrags([]);
    setCalBad(null);
    setCalCounts([...CALIBRATION_STEPS]);
    setCalError(false);
    setCalTooTall(false);
    setLearn(null);
    const next = calibrationFor(activeSetup(list, id).cals, screen);
    setCalStep(calibrateOnly || !isCalibrated(next) ? 0 : null);
    /* A setup that has never seen this screen is almost always the same chips in a
       different case, so the cheap door is the default. Re-measuring one that IS
       calibrated is the opposite: you are here because something is wrong, so it
       starts from scratch. The lenders are computed against the setup being switched
       TO, not the one being left — otherwise the setup you are coming from, which is
       the most likely lender of all, would be the one excluded. */
    const lenders = setupsWithCal(list, screen, id);
    setCarry(!isCalibrated(next) && lenders.length ? lenders[0]!.id : null);
  };

  const createSetup = (name: string) => {
    const id = nextSetupId(setups);
    pickSetup(id, [...setups, newSetup(name, id)]);
  };
```

Add `RulerSetup` to the type-only import from `../lib/chipRuler`.

- [ ] **Step 2: The pill and the picker**

Replace the `cr-prev` div in the header with:

```tsx
          <div className="cr-prev">
            <span className="ruler-prev-txt">
              {calibrating
                ? t('ruler.calibrateStep', { i: (calStep ?? 0) + 1, n: calCounts.length })
                : t('ruler.title')}
            </span>
            {/* The active setup's name, always on screen. A ruler measuring with the
                wrong case is out by a constant on every stack, which is the one error
                it cannot detect by looking at its own numbers — so it is made visible
                rather than clever. */}
            <button className="ruler-pill" onClick={() => setPicking((p) => !p)}>
              ⌗ {setupName(setup)} ▾
            </button>
          </div>
```

Insert the picker immediately **after** the closing `</div>` of `.ruler-head` and **before** the `{calibrating ? (` block:

```tsx
      {picking && (
        <div className="ruler-setups">
          {setups.map((s) => (
            <button
              key={s.id}
              className={`ruler-setup${s.id === setup.id ? ' on' : ''}`}
              onClick={() => pickSetup(s.id)}
            >
              <span>{setupName(s)}</span>
              <i>{calibrationFor(s.cals, screen) ? '✓' : '–'}</i>
            </button>
          ))}
          {newName === null ? (
            <button className="cr-btn ruler-setup-add" onClick={() => setNewName('')}>
              ＋ {t('ruler.setupNew')}
            </button>
          ) : (
            <form
              className="ruler-type"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) createSetup(newName);
              }}
            >
              <input
                className="input"
                type="text"
                autoFocus
                maxLength={MAX_SETUP_NAME}
                value={newName}
                placeholder={t('ruler.setupName')}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={!newName.trim()}>
                {t('ruler.setupCreate')}
              </button>
            </form>
          )}
          <p className="faint ruler-setups-why">{t('ruler.setupWhy')}</p>
        </div>
      )}
```

Add `MAX_SETUP_NAME` to the `from '../lib/chipRuler'` import.

- [ ] **Step 3: The one-drag door**

Insert the door immediately after the `<p className="ruler-hint">` element inside the calibrating branch, wrapped so it only appears before the first drag:

```tsx
          {donors.length > 0 && taken(calDrags).length === 0 && (
            <div className="ruler-door">
              <button
                className={`cr-btn${carry ? ' on' : ''}`}
                onClick={() => setCarry(donors[0]!.id)}
              >
                {t('ruler.doorSame', { s: setupName(donors[0]!) })}
              </button>
              <button className={`cr-btn${carry ? '' : ' on'}`} onClick={() => setCarry(null)}>
                {t('ruler.doorFull')}
              </button>
            </div>
          )}
```

Make the count list follow the door — replace the `calCounts` initialiser usage in `nextCalStep`'s `missing` lookup by first constraining the list. Add, immediately above the `const missing = ...` line in `nextCalStep`:

```ts
    /* One drag when a chip height is being carried: `zeroPx = chips·px − y`, one
       equation, one unknown. Three when it is not. */
    const wanted = carry ? 1 : calCounts.length;
```

and change the two lines that follow to use it:

```ts
    const missing = calCounts.slice(0, wanted).findIndex((_, i) => !drags[i]);
```

Replace the solve, `const solved = fitCalibration(drags);`, with:

```ts
    const donor = carry ? calibrationFor(setupById(setups, carry)?.cals ?? {}, screen) : null;
    const solved = donor ? rezero(donor.px, drags[0]!) : fitCalibration(drags);
```

Add `setupById` to the `from '../lib/chipRuler'` import. In the failure branch, guard the blame path so a single-drag re-zero never claims a "drag 2":

```ts
      const bad = donor ? -1 : worstSample(drags);
```

And make the header's Save/Next label respect the door — replace the expression added in Task 7 with:

```tsx
              {t(taken(calDrags).length + 1 >= (carry ? 1 : calCounts.length) ? 'ruler.calibrateSaveShort' : 'ruler.calibrateNext')}
```

Reset `carry` in `restartCalibration` and in the fold-change effect: add `setCarry(null);` to both.

- [ ] **Step 4: Strings and style**

`en`, beside the other `ruler.*` keys:

```ts
    'ruler.setupFirst': 'Standard',
    'ruler.setupNew': 'New setup',
    'ruler.setupName': 'Name it — “Blue case”',
    'ruler.setupCreate': 'Create',
    'ruler.setupWhy': 'A case changes how far the table sits below the glass. One setup per case, switched from here.',
    'ruler.doorSame': 'Same chips as {s} — one drag',
    'ruler.doorFull': 'Different chips too',
```

`de`:

```ts
    'ruler.setupFirst': 'Standard',
    'ruler.setupNew': 'Neues Profil',
    'ruler.setupName': 'Name — z. B. „Blaue Hülle“',
    'ruler.setupCreate': 'Anlegen',
    'ruler.setupWhy': 'Eine Hülle ändert, wie weit der Tisch unter dem Glas liegt. Ein Profil pro Hülle, hier umschaltbar.',
    'ruler.doorSame': 'Gleiche Chips wie {s} — ein Zug',
    'ruler.doorFull': 'Auch andere Chips',
```

`src/styles.css`, after the `.ruler-step` rules:

```css
/* The active case, on the line that was already there — no extra row height, and
   nothing that could creep down towards the ladder. */
.cr-prev { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ruler-prev-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ruler-pill { flex: none; padding: 2px 8px; border-radius: 999px; font-size: 11.5px;
  font-weight: 700; border: 1px solid var(--line); background: var(--surface-2);
  color: var(--text-dim); max-width: 45%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }

.ruler-setups { margin: 8px 16px 0; padding: 8px; border: 1px solid var(--line);
  border-radius: var(--r-md); background: var(--surface-2); }
.ruler-setup { display: flex; width: 100%; align-items: center; gap: 8px; padding: 8px 10px;
  border: 1px solid transparent; border-radius: var(--r-sm); background: none;
  color: inherit; font-size: 14px; text-align: left; }
.ruler-setup > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.ruler-setup > i { font-style: normal; font-size: 12px; color: var(--text-faint); }
.ruler-setup.on { border-color: var(--acc); background: var(--acc-wash); font-weight: 700; }
.ruler-setup-add { width: 100%; margin-top: 4px; }
.ruler-setups .ruler-type { margin: 6px 0 0; }
.ruler-setups-why { font-size: 11.5px; line-height: 1.5; margin: 8px 2px 2px; }

.ruler-door { display: flex; gap: 6px; margin: 8px 16px 0; }
.ruler-door .cr-btn { flex: 1; height: auto; padding: 8px 10px; font-size: 12.5px;
  line-height: 1.35; }
.ruler-door .cr-btn.on { border-color: var(--acc); background: var(--acc-wash); font-weight: 700; }
```

- [ ] **Step 5: Verify**

```bash
npm test && npm run build && npm run lint
```

Expected: all clean.

Then `npm run dev` and walk the whole flow:
1. Ruler on a calibrated screen → the pill reads "Standard".
2. Tap the pill → the list shows one setup with ✓ → `＋ New setup` → name it "Blue case" → Create.
3. The sheet drops into calibration with the door showing, "Same chips as Standard — one drag" pre-selected, header button reading Save.
4. One drag saves and returns to measuring; the pill now reads "Blue case".
5. Tap the pill and switch back to Standard — no calibration is asked for, and any logged stacks are still in the strip.
6. New setup again, choose "Different chips too" → the header reads Next and the flow is three drags.
7. Nothing in the sheet is drawn below or over the ladder at any point.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChipRuler.tsx src/lib/i18n.ts src/styles.css
git commit -m "$(cat <<'EOF'
feat(ruler): pick the case from inside the sheet

The active setup's name rides the subtitle line, so a ruler measuring with the
wrong case is a visible mistake rather than a constant three chips added to
every stack. A new setup takes one drag when the chips have not changed — px is
the chips and the glass, zeroPx is the lip, and only the lip moved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The Settings section

**Files:**
- Modify: `src/screens/SettingsScreen.tsx` (`BeforeTheNight`, the ruler card at ~line 505-597)
- Modify: `src/lib/i18n.ts` (`en` and `de`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: every setups function from Task 3; the `rms`/`span`/`at` fields from Task 1; the `ruler.setupFirst` / `ruler.setupName` / `ruler.setupNew` / `ruler.setupCreate` i18n keys added in Task 8. **Task 8 must land first.**
- Produces: nothing.

- [ ] **Step 1: Read the selected setup**

In `src/screens/SettingsScreen.tsx`, extend the `from '../lib/chipRuler'` import with `activeSetup`, `dropSetup`, `newSetup`, `nextSetupId`, `renameSetup`, `withoutSetupCal`, and the type `RulerSetup` if not already imported.

Replace:

```ts
  const cals = state.settings.chipRulerCals;
```

with:

```ts
  const setups = state.settings.chipRulerSetups ?? [];
  const setup = activeSetup(setups, state.settings.chipRulerSetupId);
  const cals = setup.cals;
  /** the name field is open, and for which job — null when it is shut */
  const [naming, setNaming] = useState<'rename' | 'new' | null>(null);
  const [draft, setDraft] = useState('');
  const setupName = (s: RulerSetup) => s.name || t('ruler.setupFirst');
  const saveSetups = (list: RulerSetup[], id = setup.id) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { chipRulerSetups: list, chipRulerSetupId: id } });
```

Replace the `forget` helper's dispatch so it forgets within the selected setup only:

```ts
      onYes: () => saveSetups(withoutSetupCal(setups, setup.id, slot.key)),
```

- [ ] **Step 2: The quality readout**

Replace the `reading` helper with:

```ts
  /**
   * What a measured slot says about itself.
   *
   * `20.8 px per chip · 70 px below the glass` was true and useless — two numbers
   * nobody can act on. Three drags produce a residual, so the slot can report the
   * thing that actually matters: how far off a stack is likely to read. Calibrations
   * with no residual (a two-drag one from before this, a carried-px re-zero, a line
   * slid onto a correction) fall back to the old line rather than showing a blank.
   */
  const reading = (slot: RulerSlot) => {
    if (!slot.cal) return t('settings.rulerNone');
    const { rms, span, at } = slot.cal;
    const when = at ? new Date(at).toLocaleDateString(state.settings.language) : '';
    const body =
      rms !== undefined && span
        ? t('settings.rulerQuality', { rms: rms.toFixed(1), n: span })
        : t('settings.rulerReady', { px: slot.cal.px.toFixed(1), zero: Math.round(slot.cal.zeroPx) });
    return when ? `${body} · ${when}` : body;
  };
```

- [ ] **Step 3: The setup head**

Insert immediately after the `<p className="faint" ...>{t('settings.rulerDesc')}</p>` paragraph inside the ruler card:

```tsx
        <div className="ruler-setup-bar">
          <select
            className="input"
            value={setup.id}
            onChange={(e) => saveSetups(setups, e.target.value)}
            aria-label={t('settings.rulerSetup')}
          >
            {setups.map((s) => (
              <option key={s.id} value={s.id}>{setupName(s)}</option>
            ))}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setDraft(setup.name); setNaming('rename'); }}
          >
            {t('settings.rulerSetupRename')}
          </button>
          {setups.length > 1 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                confirm.ask({
                  text: t('settings.rulerSetupDeleteConfirm', { s: setupName(setup) }),
                  confirmLabel: t('settings.rulerSetupDelete'),
                  danger: true,
                  onYes: () => {
                    const left = dropSetup(setups, setup.id);
                    saveSetups(left, left[0]!.id);
                  },
                })
              }
            >
              {t('settings.rulerSetupDelete')}
            </button>
          )}
        </div>

        {naming !== null && (
          <form
            className="ruler-setup-name"
            onSubmit={(e) => {
              e.preventDefault();
              const name = draft.trim();
              if (!name) return;
              if (naming === 'rename') {
                saveSetups(renameSetup(setups, setup.id, name));
              } else {
                const id = nextSetupId(setups);
                saveSetups([...setups, newSetup(name, id)], id);
              }
              setNaming(null);
              setDraft('');
            }}
          >
            <input
              className="input"
              type="text"
              autoFocus
              maxLength={MAX_SETUP_NAME}
              value={draft}
              placeholder={t('ruler.setupName')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!draft.trim()}>
              {t(naming === 'rename' ? 'settings.rulerSetupRename' : 'ruler.setupCreate')}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => { setNaming(null); setDraft(''); }}
            >
              {t('settings.rulerSetupCancel')}
            </button>
          </form>
        )}
```

and insert, immediately **before** the closing `</div>` of the ruler card (after the `settings.rulerCaseHint` paragraph):

```tsx
        <button
          className="btn btn-ghost btn-sm ruler-setup-add"
          onClick={() => { setDraft(''); setNaming('new'); }}
        >
          ＋ {t('ruler.setupNew')}
        </button>
```

Add `MAX_SETUP_NAME` to the `from '../lib/chipRuler'` import.

- [ ] **Step 4: Strings and style**

`en`, beside the other `settings.ruler*` keys, replacing `settings.rulerDesc` and `settings.rulerForgetConfirm`:

```ts
    'settings.rulerDesc': 'A few drags teach the ruler how tall your chips are and how far below the glass the table sits. The second half is the case, so keep one setup per case — and one measurement per screen and per way up, since the phone rests on a different edge lying down.',
    'settings.rulerSetup': 'Setup',
    'settings.rulerSetupRename': 'Rename',
    'settings.rulerSetupDelete': 'Delete',
    'settings.rulerSetupCancel': 'Cancel',
    'settings.rulerSetupDeleteConfirm': 'Delete “{s}” and everything measured with it?',
    'settings.rulerQuality': '±{rms} chips on a {n} stack',
    'settings.rulerForgetConfirm': 'Forget this screen’s calibration for this setup? The ruler will ask for the drags again the next time it is used this way up.',
```

`de`:

```ts
    'settings.rulerDesc': 'Ein paar Züge zeigen dem Lineal, wie hoch deine Chips sind und wie weit der Tisch unter dem Glas liegt. Die zweite Hälfte ist die Hülle — also ein Profil pro Hülle, und eine Messung pro Bildschirm und pro Lage, denn quer steht das Handy auf einer anderen Kante.',
    'settings.rulerSetup': 'Profil',
    'settings.rulerSetupRename': 'Umbenennen',
    'settings.rulerSetupDelete': 'Löschen',
    'settings.rulerSetupCancel': 'Abbrechen',
    'settings.rulerSetupDeleteConfirm': '„{s}“ und alles damit Gemessene löschen?',
    'settings.rulerQuality': '±{rms} Chips bei {n} Stück',
    'settings.rulerForgetConfirm': 'Kalibrierung dieses Bildschirms für dieses Profil verwerfen? Das Lineal fragt in dieser Lage wieder nach den Zügen.',
```

`src/styles.css`, beside the `.ruler-slot` rules:

```css
.ruler-setup-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ruler-setup-bar .input { flex: 1; min-width: 0; }
.ruler-setup-name { display: flex; gap: 8px; margin-bottom: 10px; }
.ruler-setup-name .input { flex: 1; min-width: 0; }
.ruler-setup-add { width: 100%; margin-top: 10px; }
```

- [ ] **Step 5: Verify**

```bash
npm test && npm run build && npm run lint
```

Expected: all clean.

Then `npm run dev` → Settings → Before the night → Chip ruler:
1. The dropdown lists every setup; picking one changes which calibrations the slots below show, and it is the same setup the ruler sheet opens with.
2. `Rename` renames; `Delete` is hidden when there is only one setup and asks before deleting otherwise.
3. `＋ New setup` creates one; its slots read "Not measured yet"; `Calibrate` opens the sheet, which offers the one-drag door because the other setup knows this screen.
4. A slot calibrated with three drags reads `±0.3 chips on a 20 stack · <date>`; one migrated from before this work still reads the old `px`/`zeroPx` line rather than a blank.
5. Turning the phone still switches which row says "now", and the other-screens list still appears for a Fold.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.tsx src/lib/i18n.ts src/styles.css
git commit -m "$(cat <<'EOF'
feat(settings): set the ruler's cases up on a Tuesday

The card grows a setup picker, a rename and a delete, so the whole thing can be
arranged in advance rather than discovered at a table. A measured slot now
reports what it is worth — "±0.3 chips on a 20 stack" — instead of two numbers
nobody can act on; a calibration from before the third drag keeps the old line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test` passes (`chipRuler.test.ts` and `settingsScope.test.ts` both extended).
- `npm run build` and `npm run lint` are clean.
- An install that already had a calibration is never asked to calibrate again.
- A second setup for the same chips costs one drag; switching between them mid-count is one tap and never touches the stacks already logged.
- Nothing is drawn below the ladder or floating over its foot, at any window size, in any state of the sheet.
