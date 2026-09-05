# Chip Ruler: Three-Drag Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## SCOPE CHANGE — 2026-09-05, after Task 1 landed

**Setups are cancelled.** The whole point of a setup was that a case can come off,
and the user has since glued the case to the phone permanently. With one chip set and
a fixed case there is exactly one calibration table, which is what the app already
had. Building a switcher for a set of one is a switcher nobody will ever touch.

- **Cancelled outright: Tasks 3, 4, 5 and 8.** No `RulerSetup`, no setups CRUD, no new
  `Settings` fields, no `settingsScope` entries, no store migration, no setup pill,
  no picker, no one-drag door, no `rezero`.
- **Task 2 is rewritten**, and shrinks to the one thing in it that is not about
  setups: Task 1 introduced a regression in `teach` that has to be fixed.
- **Kept as written: Tasks 6 and 7.** The snapping bar and the three-drag flow.
- **Task 9 is trimmed** to the quality readout in Settings — no setup head, no
  rename, no delete.

Read the Task list below as: **1 ✅ · 2 (rewritten) · 6 · 7 · 9 (trimmed)**. Tasks 3,
4, 5 and 8 are left in the file as tombstones so the numbering — and therefore
`scripts/task-brief PLAN N` — keeps working.

---

**Goal:** Give the chip ruler a third calibration drag, which yields an error bar the app can show, editable stack counts, and a bar that snaps to the chip line.

**Architecture:** All new maths goes in `src/lib/chipRuler.ts` behind pure functions with unit tests. `screenKeyOf`, `rulerSlots` and the per-screen calibration map are untouched. `ChipRuler.tsx` grows a step count it can edit and a bar that draws where it reads; `SettingsScreen.tsx` changes one line of text.

**Tech Stack:** Vite + React 18 + TypeScript, Capacitor for Android. Tests are plain scripts run by `node --experimental-strip-types` via `npm test` (`scripts/run-tests.mjs`) — no framework.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-05-chip-ruler-setups-design.md`.
- **Test convention:** every test file is `src/lib/*.test.ts`, imports with explicit `.ts` extensions, uses the file-local `check(label, ok, detail?)` helper and `console.log` section headers, and ends with `assert.equal(failures, 0)`. No test framework, no new dependency.
- **Run one test file:** `node --experimental-strip-types src/lib/chipRuler.test.ts`
- **Run all tests:** `npm test`
- **Typecheck + build:** `npm run build` (`tsc -b && vite build`)
- **Lint:** `npm run lint` (oxlint)
- **Nothing may be drawn below or floating over the ruler's ladder.** Pixels that cannot be dragged to are chips that must be typed. Every new control in `ChipRuler.tsx` goes *above* `.ruler-stage`. This is a hard rule stated in that file's header comment.
- **No new `Settings` fields.** The scope change cancelled them; `chipRulerCals` stays the one calibration map, and `src/lib/settingsScope.ts` is not touched.
- **i18n:** every user-visible string is a key in `src/lib/i18n.ts`, added to **both** the `en` and `de` dictionaries. No English in the store.
- **`px` is the chips and the screen density; `zeroPx` is the case lip.** Do not blur the two.
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

### Task 2: The scatter gate must not refuse a correction

Task 1 gave `fitCalibration` a `MAX_RMS_CHIPS` gate and, in doing so, broke `teach`. That gate is right for calibration drags — three drags of a stack the user just counted, in one controlled moment, where a blunder must be refused before it poisons the night. It is wrong for corrections: each one is the user saying "that stack was really 18", taken at a different moment, about a calibration that is *already known to be wrong*. Scatter between them is information, not a blunder.

Worse, the failure is silent. `teach`'s refit path calls `fitCalibration(fixes)` with three or more accumulated corrections; when the gate refuses, `teach` falls back to sliding the line and the user keeps a calibration they have now corrected three times.

**Files:**
- Modify: `src/lib/chipRuler.ts` (`fitCalibration` at ~line 126, `teach` at ~line 249)
- Test: `src/lib/chipRuler.test.ts`

**Interfaces:**
- Consumes: `MAX_RMS_CHIPS`, `fitCalibration(samples, now?)` from Task 1.
- Produces:
  - `fitCorrections(samples: RulerSample[], now?: number): RulerCalibration | null` — the same line, the same believability checks on `px` and `zeroPx`, and the same `rms`/`span` reporting, but **no scatter gate**
  - `fitCalibration` becomes `fitCorrections` plus the gate, so there is one implementation
  - `teach(cal, sample, now?)` — carries the clock, refits through `fitCorrections`, and stamps `at` on both its paths

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/chipRuler.test.ts`, before the final `console.log(failures ? ...)` line:

```ts
/**
 * A correction is not a calibration drag, and the scatter gate must not treat it
 * like one.
 *
 * Calibration drags happen in one controlled moment against a stack the user has
 * just counted, so three of them that disagree are a mis-drag and must be refused.
 * Corrections are the opposite in every way: each is a separate evening's "that was
 * really 18", made about a calibration ALREADY KNOWN to be wrong. Scatter between
 * them is what a drifting ruler looks like — and refusing to fit it would leave the
 * user with the very calibration they have now corrected three times.
 */
console.log('');
console.log('corrections are allowed to disagree');
{
  const T = 1_700_000_000_000;
  // the 18-that-said-13: believable, and wrong on every stack
  const off = calibrate({ y: 20 * 28 - 40, chips: 20 }, { y: 10 * 28 - 40, chips: 10 });

  /* Three honest corrections with a fair amount of judgement in them: ±14 px, about
     two thirds of a chip each. Fitted, they land exactly on the truth. */
  const spread = [
    { y: yFor(8) + 14, chips: 8 },
    { y: yFor(14) - 14, chips: 14 },
    { y: yFor(20) + 14, chips: 20 },
  ];

  check('as calibration drags they are refused', fitCalibration(spread) === null);
  const fitted = fitCorrections(spread, T);
  check('as corrections they are fitted', fitted !== null);
  check('and they land on the truth', !!fitted && Math.abs(fitted.px - PX) < 1e-9, String(fitted?.px));
  check('the scatter is still reported', (fitted?.rms ?? 0) > MAX_RMS_CHIPS, String(fitted?.rms));
  check('and the fit is stamped', fitted?.at === T);

  /* ...and the same three arriving one at a time through teach must end up there
     too. This is the regression: the third correction pushes the set past the gate,
     and a gated refit would silently drop back to sliding the line — leaving the
     chip height wherever the second correction happened to put it. */
  let c = off;
  for (const fix of spread) c = teach(c, fix, T) ?? c;
  check('teach reaches the same place', !!c && Math.abs(c.px - PX) < 1e-9, String(c?.px));
  check('...and did not just slide', Math.abs(c!.px - off!.px) > 1, String(c?.px));
  check('the corrections are all remembered', c?.samples?.length === 3);

  // a lone correction still only slides, and still says when it happened
  const slid = teach(good, { y: yFor(12) + 10, chips: 12 }, T);
  check('one correction keeps the chip height', slid?.px === good!.px);
  check('...and is stamped too', slid?.at === T);
  check('...and claims no quality of its own', slid?.rms === undefined);
}
```

Add `fitCorrections` to the import list at the top of the file.

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `does not provide an export named 'fitCorrections'`.

- [ ] **Step 3: Implement**

In `src/lib/chipRuler.ts`, split `fitCalibration` into the fit and the gate. Replace the whole `fitCalibration` function (its doc comment included) with:

```ts
/**
 * Fit the line `y = chips·px − zeroPx` through a set of drags of known height.
 *
 * Least squares rather than two points, because the drags arrive in sets larger than
 * two: judging the top of a pile a couple of millimetres off is normal, and averaging
 * is what stops one shaky drag from setting the scale for the whole night.
 *
 * Returns null rather than a number when the result is not believable: a bad
 * calibration poisons every count afterwards, so it has to fail at the one moment
 * the user is still looking at it. What this does NOT judge is how far the samples
 * fell from the line — see `fitCalibration` below, and the comment on it for why
 * that judgement belongs to one caller and not the other.
 */
export function fitCorrections(samples: RulerSample[], now = Date.now()): RulerCalibration | null {
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
    cal.rms = rmsChips(pts, px, zeroPx);
    cal.span = Math.max(...pts.map((p) => p.chips));
  }
  return cal;
}

/**
 * The same fit, for CALIBRATION DRAGS, which are held to a tighter standard.
 *
 * The difference is where the samples came from, and it matters. Calibration drags
 * are three readings of one stack the user has just counted, taken one after another
 * in a controlled moment — so three that do not agree are a mis-drag, and refusing
 * them costs one repeated drag. Corrections are the opposite in every way: each is a
 * separate evening's "no, that was 18", made about a calibration already known to be
 * wrong. Scatter between those is what a drifting ruler looks like, and refusing to
 * fit it would hand the user back the very calibration they keep correcting.
 *
 * So the scatter gate lives here, on the caller that should have it, rather than
 * inside the arithmetic where both callers would inherit it.
 */
export function fitCalibration(samples: RulerSample[], now = Date.now()): RulerCalibration | null {
  const cal = fitCorrections(samples, now);
  if (!cal) return null;
  if (cal.rms !== undefined && !(cal.rms <= MAX_RMS_CHIPS)) return null;
  return cal;
}
```

Then fix `teach`. Widen its signature to carry the clock:

```ts
export function teach(
  cal: RulerCalibration | null | undefined,
  sample: RulerSample,
  now = Date.now(),
): RulerCalibration | null {
```

change its refit call from `const fitted = fitCalibration(fixes);` to:

```ts
    const fitted = fitCorrections(fixes, now);
```

and replace the tail (the two lines beginning `// slide the line onto the corrected stack`) with:

```ts
  // slide the line onto the corrected stack, keeping the chip height
  const zeroPx = sample.chips * cal.px - sample.y;
  if (zeroPx < -cal.px || zeroPx > MAX_ZERO_PX) return null;
  /* No `rms` on a slid line, deliberately: it passes exactly through the one stack
     it was told about, and a zero there would be arithmetic claiming an accuracy
     nothing has demonstrated. `at` is real, though — the ruler did change today. */
  return { px: cal.px, zeroPx: Math.max(0, zeroPx), at: now, samples: fixes };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
node --experimental-strip-types src/lib/chipRuler.test.ts
```

Expected: `chipRuler: all checks passed`, including every pre-existing `teach` check.

```bash
npm test && npm run build && npm run lint
```

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipRuler.ts src/lib/chipRuler.test.ts
git commit -m "$(cat <<'EOF'
fix(ruler): a correction is allowed to disagree with the last one

The scatter gate added with the third drag is right for calibration drags —
three readings of one stack, in one moment, where disagreement is a mis-drag.
It is wrong for corrections, which are separate evenings' "that was really 18"
about a calibration already known to be wrong. Under the gate, the third
correction silently stopped refitting and slid instead, handing back the chip
height the user had just spent three corrections trying to fix.

The gate moves out of the arithmetic and onto the caller that wants it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: CANCELLED — setups

Cancelled by the 2026-09-05 scope change at the top of this file. The case is glued to
the phone and there is one chip set, so there is one calibration table. No
`RulerSetup`, no CRUD, no `normalizeSetups`.

---

### Task 4: CANCELLED — setup settings fields, scope and migration

Cancelled by the 2026-09-05 scope change. No new `Settings` fields, no
`DEVICE_LOCAL_SETTINGS` entries, no store migration. `chipRulerCals` stays exactly as
it is and keeps being the one calibration map.

(One line of this task survives and has moved into Task 9: `Settings.chipRulerCals`'s
inline type has to admit the `rms` / `span` / `at` fields that Task 1 now writes into
it, or the stored type is a lie about what is on disk.)

---

### Task 5: CANCELLED — the sheet reads the active setup

Cancelled by the 2026-09-05 scope change. `ChipRuler.tsx` keeps reading
`state.settings.chipRulerCals` and dispatching `withCalibration` exactly as it does
today. **Tasks 6, 7 and 9 must not introduce `saveCal`, `setups`, `setup` or
`activeSetup`** — those were this task's output and it is not happening.

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
- Consumes: `CALIBRATION_STEPS` (now length 3), `fitCalibration(samples, now?)`, `worstSample`, `spanFor` from Task 1; the `rawPx` state from Task 6.
- Produces: nothing later tasks depend on. This is the last change to `ChipRuler.tsx`.

**Do not introduce `saveCal`, `setups`, `setup` or `activeSetup`** — those belonged to the cancelled Task 5. The calibration is stored with the same `dispatch` + `withCalibration` this file already uses.

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

    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: { chipRulerCals: withCalibration(cals, screen, solved), chipRuler: null },
    });
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

### Task 8: CANCELLED — the setup pill, the picker and the one-drag door

Cancelled by the 2026-09-05 scope change at the top of this file. There is one
calibration table, so there is nothing to pick between. No pill, no picker, no
`pickSetup`, no `rezero`, no door.

---

### Task 9: The quality readout in Settings

Three drags produce a residual, and the point of having one is that a person can see
it. `20.8 px per chip · 70 px below the glass` is true and useless — two numbers
nobody can act on. `±0.3 chips on a 20 stack · 14 Aug` is the thing that actually
matters: how far off a stack is likely to read, and when that was last established.

**Files:**
- Modify: `src/types.ts` (the `chipRuler` / `chipRulerCals` block at ~line 119-131)
- Modify: `src/screens/SettingsScreen.tsx` (the `reading` helper inside `BeforeTheNight`, at ~line 505)
- Modify: `src/lib/i18n.ts` (`en` and `de`)

**Interfaces:**
- Consumes: the `rms` / `span` / `at` fields on `RulerCalibration` from Task 1.
- Produces: nothing.

**Do not introduce setups.** Tasks 3, 4, 5 and 8 are cancelled. There is no setup
picker, no rename, no delete, and no new `Settings` field. The only structural change
here is making the stored type admit three fields it already holds.

- [ ] **Step 1: Make the stored type honest**

Task 1 made `fitCalibration` write `rms`, `span` and `at` into every calibration, and
`normalizeCalibrations` now carries all three back off disk — but `Settings`'s inline
type still describes a calibration as `{ px, zeroPx, samples? }`. That is a lie about
what is on disk, and it is the type `SettingsScreen` is about to read the new fields
through.

In `src/types.ts`, add above the `Settings` interface:

```ts
/** One screen's chip-ruler calibration as it is stored: CSS pixels per chip, how far
 *  below the glass the table sits, the hand corrections it has learned from, and how
 *  well its calibration drags agreed. Structurally the same as `RulerCalibration` in
 *  lib/chipRuler.ts, written out here rather than imported so `Settings` stays a
 *  plain description of what is on disk. */
export interface StoredCalibration {
  px: number;
  zeroPx: number;
  samples?: { y: number; chips: number }[];
  /** how far the calibration drags fell from the fitted line, in chips (RMS) */
  rms?: number;
  /** the tallest stack that fit was anchored on */
  span?: number;
  /** when it was measured, ms since epoch */
  at?: number;
}
```

and use it in both ruler fields, replacing their inline shapes:

```ts
  chipRuler?: StoredCalibration | null;
```

```ts
  chipRulerCals?: Record<string, StoredCalibration>;
```

Leave both doc comments as they are.

- [ ] **Step 2: Replace the readout**

In `src/screens/SettingsScreen.tsx`, replace the `reading` helper:

```ts
  const reading = (slot: RulerSlot) =>
    slot.cal
      ? t('settings.rulerReady', { px: slot.cal.px.toFixed(1), zero: Math.round(slot.cal.zeroPx) })
      : t('settings.rulerNone');
```

with:

```ts
  /**
   * What a measured slot says about itself.
   *
   * `20.8 px per chip · 70 px below the glass` was true and useless — two numbers
   * nobody can act on, in units nobody measures chips in. Three drags produce a
   * residual, so the slot can report the thing that matters instead: how far off a
   * stack is likely to read. Calibrations with no residual fall back to the old line
   * rather than showing a blank — a two-drag one from before this existed, or a line
   * slid onto a single correction, genuinely has nothing to claim.
   */
  const reading = (slot: RulerSlot) => {
    if (!slot.cal) return t('settings.rulerNone');
    const { rms, span, at } = slot.cal;
    const body =
      rms !== undefined && span
        ? t('settings.rulerQuality', { rms: rms.toFixed(1), n: span })
        : t('settings.rulerReady', { px: slot.cal.px.toFixed(1), zero: Math.round(slot.cal.zeroPx) });
    const when = at ? new Date(at).toLocaleDateString(state.settings.language) : '';
    return when ? `${body} · ${when}` : body;
  };
```

`state` is already in scope in `BeforeTheNight` (it destructures `const { state, dispatch } = useStore();` at the top).

- [ ] **Step 3: Strings**

In `src/lib/i18n.ts`, add one key to the `en` dictionary beside the other
`settings.ruler*` keys, and update `settings.rulerDesc` — calibration is three drags
now, not two:

```ts
    'settings.rulerDesc': 'Three drags teach the ruler how tall your chips are, and how far below the glass the table sits. It is one measurement per screen and per way up — the phone rests on a different edge lying down — and each one is kept until you replace it.',
    'settings.rulerQuality': '±{rms} chips on a {n} stack',
```

and the same two in `de`:

```ts
    'settings.rulerDesc': 'Drei Züge zeigen dem Lineal, wie hoch deine Chips sind und wie weit der Tisch unter dem Glas liegt. Eine Messung pro Bildschirm und pro Lage — quer steht das Handy auf einer anderen Kante — und jede bleibt gespeichert, bis du sie ersetzt.',
    'settings.rulerQuality': '±{rms} Chips bei {n} Stück',
```

Leave `settings.rulerReady` in both dictionaries — it is still the fallback for a
calibration that has no residual.

- [ ] **Step 4: Verify**

```bash
npm test && npm run build && npm run lint
```

Expected: all clean.

Then `npm run dev` → Settings → Before the night → Chip ruler:
1. A slot calibrated with three drags reads `±0.3 chips on a 20 stack · <today's date>`.
2. A slot whose calibration predates this work (or one that has only ever been slid
   onto a single correction) still reads the old `px` / `zeroPx` line rather than a
   blank or a stray `±undefined`.
3. Turning the phone still switches which row says "now", and the other-screens list
   still appears on a folding phone. Nothing else in the card has changed.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/screens/SettingsScreen.tsx src/lib/i18n.ts
git commit -m "$(cat <<'EOF'
feat(settings): the ruler reports what it is worth

"20.8 px per chip · 70 px below the glass" was true and unusable — two numbers
in units nobody measures chips in. The third drag produces a residual, so the
slot can say how far off a stack is likely to read, and when that was last
established. A calibration with no residual keeps the old line rather than
claiming an accuracy it has never demonstrated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test` passes (`chipRuler.test.ts` extended in Tasks 1 and 2).
- `npm run build` and `npm run lint` are clean.
- Calibration is three drags, each with a stack count the user can change, and a set
  that does not describe one stack asks for the single drag that disagreed rather
  than all three.
- The bar draws on the chip line it will be read as.
- A hand correction still teaches the ruler, and three corrections that disagree
  refit it rather than silently sliding it.
- Settings reports a calibration's error in chips, with the date it was taken.
- Nothing is drawn below the ladder or floating over its foot, at any window size, in
  any state of the sheet.
