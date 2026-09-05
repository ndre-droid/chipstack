# Chip ruler: named setups + a three-drag calibration (2026-09-05)

Gives the chip ruler a second axis — a named **setup** ("No case", "Blue case") holding a
whole calibration table — switchable from inside the ruler sheet, so swapping the phone's
case mid-game costs one tap instead of a re-calibration. Adds a third calibration drag,
which buys an error bar, and snaps the bar to the chip line.

## Problem

The ruler stores `cals[screenKey] = { px, zeroPx }`, keyed by `screenKeyOf()` — glass
dimensions + dpr + layout class + `:p`/`:l`. Screen and orientation are already detected
automatically and that part works.

What is not modelled is the **case**. `zeroPx` is how far below the lowest pixel the table
sits: a case bottom plus a bezel. Take the case off and every stack reads three or four
chips too tall, silently — the one error a ruler cannot detect, because it is a constant
added to every measurement. The only cure today is to re-run the two-drag calibration for
whichever screen and orientation you are on, at the table, mid-count.

Two smaller problems come with it:

- **A two-point fit has no residual.** Two drags always describe exactly one line, so a
  shaky drag produces a bad calibration that looks identical to a good one. Settings can
  only report `20.8 px per chip · 70 px below the glass`, which tells nobody anything.
- **`CALIBRATION_STEPS` is hardcoded `[20, 10]`.** A stack of 20 that does not fit the
  ladder dead-ends the flow (`calTooTall` says "take a few chips off", but the step still
  insists the stack is 20). 30 rarely fits at all; 6 is unreachable behind a thick case.
  The number of chips has to be the user's to state, not the app's to assume.

## Decisions

- **A setup is a named calibration table**, not a single number. Setup × screen ×
  orientation, so a Fold with two cases has eight slots, each measured once and kept.
- **A new setup has two doors.** *Same chips, different case* carries `px` over from a
  setup you name and solves `zeroPx` from **one** drag. *Different chips too* runs the
  full three. This is physically honest: `px` is the chips and the screen density,
  `zeroPx` is the case lip, and only one of the two changes when a case does.
- **Three drags, each with an editable count.** Defaults 20 / 12 / 6, tall first, so you
  take chips off one stack rather than building three.
- **The error bar replaces the px readout.** "±0.3 chips on a 20 stack · 14 Aug".
- **The bar snaps to the chip line while measuring**, never while calibrating.
- **The active setup's name is on screen whenever the ruler is open.** A pill on the
  sheet's subtitle line. This is what makes a wrong setup a visible mistake instead of a
  silent offset, and it is why no automatic wrong-setup detector is needed.

Rejected, deliberately: a "check it" verification round, an automatic wrong-setup
detector, and any use of device tilt. A 10° lean is about 0.3 chips over a 20 stack and
largely cancels between calibration and measurement.

## Shape

### `lib/chipRuler.ts`

Existing exports keep their meaning. `RulerCalibration` gains three optional fields, all
written by a fit and never required:

```ts
interface RulerCalibration {
  px: number;
  zeroPx: number;
  samples?: RulerSample[];
  /** how far the calibration drags fell from the fitted line, in CHIPS (RMS).
   *  Undefined for a two-point fit, a carried-px re-zero, or a slid line — none
   *  of those have a residual to report. */
  rms?: number;
  /** the tallest stack the fit was anchored on, so the readout can say
   *  "±0.3 chips on a 20 stack" rather than a bare number. */
  span?: number;
  /** when it was measured (ms since epoch). */
  at?: number;
}
```

`fitCalibration(samples)` additionally computes, when it has three or more points:

```
residual_i = y_i − (chips_i · px − zeroPx)        // CSS px
rms        = sqrt(mean(residual_i²)) / px          // chips
span       = max(chips_i)
```

It keeps every existing rejection (`MIN_PX_PER_CHIP`…`MAX_PX_PER_CHIP`, `MAX_ZERO_PX`, the
negative-offset clamp) and gains one more: an `rms` above `MAX_RMS_CHIPS` (1.0) is not a
calibration, it is three drags that do not describe one stack.

`worstSample(samples, cal)` returns the index of the largest residual, so the sheet can
offer "redo drag 2" instead of restarting all three.

`rezero(px, sample)` is the one-drag door: `zeroPx = sample.chips · px − sample.y`, run
through the same believability checks, returning `{ px, zeroPx, at }` or null. It is the
same arithmetic `teach()` already uses for its slide, extracted so both can call it.

New, above the existing per-screen layer:

```ts
interface RulerSetup {
  id: string;                 // "s1", "s2", … — stable, never reused
  name: string;               // "No case"
  cals: RulerCalibrations;    // screenKey -> calibration, exactly as today
}
```

with `newSetup(name, id)`, `setupById(setups, id)`, `activeSetup(setups, id)` (falls back
to the first setup rather than returning null — the ruler must always have somewhere to
write), `withSetupCal(setups, id, key, cal)`, `renameSetup`, `dropSetup` (refuses to drop
the last one), `nextSetupId(setups)`, and `setupsFor(setups, id, key)` — the setups other
than `id` that have a calibration for `key`, which is what the "same chips as…" picker
lists.

`normalizeSetups(rawSetups, legacyCals)` is the load-time gate: it validates every setup
(a string id, a string name, `normalizeCalibrations` over its map), drops junk entry by
entry rather than rejecting the whole array, and — when nothing survives but a legacy
`chipRulerCals` exists — wraps that map in a first setup. An empty result yields one empty
setup so the invariant "there is always at least one" holds everywhere else.

### `types.ts` / `settingsScope.ts` / `store.tsx`

Two new `Settings` fields, both added to `DEVICE_LOCAL_SETTINGS`: `chipRulerSetups` and
`chipRulerSetupId`. `chipRulerCals` becomes legacy alongside `chipRuler` — kept for the
migration, nulled once folded in, read by nothing afterwards. `store.tsx` calls
`normalizeSetups` where it currently calls `normalizeCalibrations`.

### `components/ChipRuler.tsx`

The maths in this file changes in one place only: every read and write of
`state.settings.chipRulerCals` becomes a read and write of the **active setup's** `cals`.
`screen`, `belowPx`, `teach`, the ticks, the tiny row and the stack strip are untouched.

Added:

- **Setup pill**, on the existing `cr-prev` subtitle line: `Measure the stacks · ⌗ No case ▾`.
  No new row height, and nothing goes below or over the ladder — the hard rule in this
  file's header comment stands.
- **Setup popover**: one row per setup, marked ✓ when *this screen, this way up* is
  calibrated in it and – when switching to it will ask for drags; plus `＋ New setup…`.
  Switching setups behaves exactly like folding the phone does today: the bar stops
  meaning anything, the logged stacks survive (they are counts of chips), and the sheet
  drops into calibration if the new setup has never seen this screen.
- **New-setup flow**: name field, then a door. When at least one other setup has a
  calibration for this `screenKey`, "Same chips as [setup ▾] — one drag" is offered and is
  the default; otherwise only the three-drag door exists.
- **Editable step counts**: each calibration step shows `− n +` beside its instruction.
  The count the user states is what goes into the sample, so a 15-chip stack calibrates as
  well as a 20-chip one. Guards: counts must be distinct and decreasing; a drag pinned at
  the ladder's ceiling still raises `calTooTall`; after steps 1 and 2 a provisional fit
  picks step 3's default, raising it until `spanFor(n) > 12` so the third drag is never
  asked for below the glass.
- **Blunder recovery**: when the three-point fit is rejected on `rms`, the sheet names the
  worst drag and offers to redo that one step, keeping the other two.
- **Snap**: raw drag position moves to a `rawPx` ref; `dragPx` becomes the snapped
  position, `spanFor(chipsAt(raw)) − belowPx`. `teach()` and the calibration samples read
  `rawPx`; snapping those would quantise every correction by up to half a chip and bias
  the slide. No snapping while calibrating — there is no scale yet.

### `screens/SettingsScreen.tsx`

`BeforeTheNight`'s ruler card grows a head: a setup dropdown, `Rename`, `Delete` (hidden
on the last setup), and `＋ New setup`. Below it the existing slot list, unchanged in
structure, now reading the selected setup's calibrations — including the "other screens"
list and the "turn the phone to measure this one" row, which are already right.

The per-slot reading changes from `{px} px per chip · {zero} px below the glass` to
`±{rms} chips on a {span} stack · {date}`, falling back to the old line for a calibration
with no `rms` (a legacy one, a re-zero, or a slid fit) so nothing shows a blank.

### `styles.css` / `lib/i18n.ts`

Pill, popover, step stepper and the setup head. New `ruler.setup*` / `settings.rulerSetup*`
keys in `en` and `de`.

## Testing

`lib/chipRuler.test.ts` (plain `node --experimental-strip-types`, `.ts` imports, per the
project's convention) gains:

- a three-point fit recovering a known `px`/`zeroPx`, and its `rms` being near zero
- one deliberately bad drag among three pushing `rms` past `MAX_RMS_CHIPS`, and
  `worstSample` naming it
- `rezero` reproducing a known `zeroPx` from a carried `px` and one drag, and refusing a
  drag that implies a table above the glass or below `MAX_ZERO_PX`
- setups CRUD: `dropSetup` refusing the last setup, `activeSetup` falling back rather than
  returning null, `withSetupCal` leaving other setups untouched
- `normalizeSetups` folding a legacy `chipRulerCals` into a first setup, dropping a junk
  entry without dropping its siblings, and always returning at least one setup
- `settingsScope.test.ts`: neither new field travels in a shared setup

Snapping and the pill are UI; they are verified by running the app.

## Migration

An install with `chipRulerCals` gets one setup holding it, named from
`t('settings.rulerSetupFirst')` ("Standard"), and becomes the active setup. An install with
only the older single `chipRuler` keeps the existing adopt-on-open path, writing into the
active setup instead of the bare map. Nothing is asked of the user and no calibration is
lost.
