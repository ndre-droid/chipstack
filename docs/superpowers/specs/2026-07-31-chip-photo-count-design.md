# Photo → Chip Count (on-device) — Design Spec

**Date:** 2026-07-31
**Status:** Approved for planning
**Author:** pair session

## 1. Problem & goal

Entering a player's chip stack by hand after every pot is tedious. Goal: point the
phone at a player's chips, and the app estimates the **total chip value** on-device
(no cloud, no cost) and fills `LedgerPlayer.chips`. Intended for occasional updates
after big pots, not every hand.

Constraints from the user:
- **On-device only.** Classic computer vision, free. No cloud LLM vision, no ML training.
- **As accurate as possible**, with strong in-app capture guidance (framing, camera
  angle indicator, auto-flash) and everything else that improves the downstream math.
- Must never replace or break the existing manual `chips` entry — it augments it.

## 2. The chips (ground truth)

SLOWPLAY Nash ceramic set — **10 g, 39 mm diameter**, ceramic composite, smooth edge.
Confirmed from product listing + user photos.

| Value | Colour (body/edge) | Store hex |
|------:|--------------------|-----------|
| 1     | cream / ivory      | `#ECE4D0` |
| 5     | red                | `#C0392B` |
| 10    | cyan / teal        | `#31B6C9` |
| 25    | green              | `#2E9E52` |
| 50    | orange             | `#E0782B` |
| 100   | dark navy / near-black | `#0C0C10` |
| 500   | purple             | `#7A3D9C` |
| 1000  | yellow / gold      | `#E4B41F` |
| 5000  | brown              | `#9A5228` |

Key visual facts driving the design:
- **Edges are solid colour, smooth ceramic — no edge-spots.** The per-row dominant
  colour of a column edge is essentially the body colour, minus faint gold art-deco
  lines (which we detect and ignore). This is the best case for colour-band reading.
- **Main colour-ID risk = 50 orange vs 5000 brown** (closest warm pair). This is the
  single reason calibration + torch materially raise accuracy.
- **39 mm diameter + ~3.3 mm ceramic thickness → thickness/diameter ratio ≈ 0.085.**
  This is the pre-calibration scale constant; calibration measures the exact value.

## 3. Core idea — self-calibrating columns

Naive "column height ÷ chip thickness" fails: pixels-per-mm is unknown and perspective
foreshortens the stack. Instead, **each column calibrates its own scale from its top
face.**

A vertical cylinder's top circle projects to an ellipse. Let `a` = major axis (px,
horizontal) and `b` = minor axis (px, vertical). Then:
- `a` = chip **diameter in pixels** for that column at that distance.
- `b/a = cos θ`, where θ is how far the camera looks down onto the top (θ = 0 → straight
  down / top view; θ = 90° → pure side view).

A chip of thickness `t` projects to a vertical **edge height in pixels**:

```
h_px = ratio · a · sin θ        where ratio = t / diameter (≈ 0.085 default, or calibrated)
                                and sin θ = sqrt(1 − (b/a)²)
```

So from the ellipse alone we get both the scale and the tilt correction — no ruler, no
external reference. `count = band_height_px / h_px`.

**Degenerate guard:** near top-view (small θ) `sin θ → 0` and counts blow up. We require
enough tilt (`b/a` below a max) and the capture guide steers the user to θ ≈ 60–70°
(≈ 20–30° downward look), where `sin θ` is robust. The tilt guide and the math reinforce
each other.

## 4. Capture UX (guided)

Live rear-camera preview (`getUserMedia`, continuous autofocus, high resolution) with an
overlay:

- **Framing guide** — a box + instruction: arrange chips as *separated colour columns*
  on the felt, columns ≤ ~25 high, small gaps between columns. (Poker chips are already
  colour-sorted, so this is natural.)
- **Angle indicator** — a bubble-level driven by `DeviceOrientation`. Target pitch band
  ≈ 20–30° downward look; the bubble turns green in the sweet spot (both the top ellipses
  and the coloured edges are visible). Numeric read-out beside it.
- **Auto-torch** — sample preview luma; if the scene is dim and the camera track exposes
  `torch` (`track.getCapabilities().torch`), enable it via
  `applyConstraints({ advanced:[{ torch:true }] })`. Manual toggle overrides. Consistent
  light = stable colour reading. (Android web + APK support torch; iOS-web does not →
  graceful fallback: no torch, manual shutter.)
- **Steady + auto-shoot** — when tilt is in-band AND the device is steady (orientation
  variance below threshold over ~500 ms) AND brightness is adequate, capture a **burst of
  3 frames** (~100 ms apart) to reduce single-frame error. A manual shutter is always
  available.

Fallbacks: `DeviceOrientation` denied → skip the bubble, still allow manual shutter.

## 5. Detection pipeline (per frame)

1. Downscale to a working width (~1000 px), keep aspect; convert to CIE Lab (keep RGB).
2. **Background model:** sample the guide-box corners (assumed felt), take mean Lab;
   foreground mask = pixels far from felt in Lab. Morphological open/close to clean.
3. **Column segmentation:** vertical projection / connected components of the foreground →
   x-ranges of columns (tall regions ~1 diameter wide, separated by gaps).
4. Per column:
   - **Top ellipse:** fit an ellipse to the top contour arc (`cv.fitEllipse`) → `a`, `b`.
     Poor fit → estimate `a` from column width and flag lower confidence.
   - **Scale:** `h_px = ratio · a · sqrt(1 − (b/a)²)` (ratio from calibration, else 0.085).
   - **Band read:** scan a central vertical strip from just below the ellipse to the
     bottom. Per image row, take the median Lab of foreground pixels across the column
     width, **excluding gold-deco pixels** (high L + yellow hue). Build a colour-vs-y
     profile; segment into bands at change-points (row-to-row Lab distance over a
     threshold). Merge sub-~0.4-chip slivers into neighbours.
   - **Classify + count:** each band → nearest denom colour in Lab; if the min distance
     exceeds a reject threshold → mark **unknown** (user must assign). Band count =
     `round(band_height_px / h_px)`, min 1.
   - Column value = Σ count · denom.value.
5. **Reconcile the 3 frames:** align columns by **x-order** (robust to several columns of
   the same colour); per band take the **median** count across frames. Any spread lowers
   confidence.
6. **Aggregate by denomination across all columns.** Multiple stacks of the same denom are
   normal — every column's bands are summed into a single per-denom total
   (`Map<denomValue, count>`), then value = Σ count · denom.value. The pipeline never
   assumes one column per denom.

## 6. Confidence & review (mandatory)

Nothing auto-saves. Per band, confidence combines: (i) colour match margin (best vs 2nd
best denom distance), (ii) count roundness (how close `band/h_px` is to an integer),
(iii) frame agreement. Low on any → the band is outlined amber.

Review sheet:
- Captured frame with coloured band overlays + per-band count labels + running total.
- Editable list **grouped by denom, summed across all columns**, e.g. `🔵 10 × 12 = 120`,
  with a ± stepper per group and tap-to-reassign the denom. **Unknown bands must be
  assigned before confirm.**
- Any **detected anomalies** (see §6.5) surface here with specific retake guidance.
- **Retake** and **Set as {player}'s chips** buttons. Confirm →
  `dispatch(SET_PLAYER_CHIPS)`.

## 6.5. Multiple stacks & anomaly handling

Columns are read independently and summed per denom (§5), so **any number of stacks of
any denom** works — including several of the same colour. Beyond that, an anomaly layer
runs at two points: **live** (before the shot, as capture hints) and **post-capture**
(on the frames, surfaced in review). Each anomaly is `{ code, severity, autoFixed,
message }`. Easy ones are fixed silently; the rest tell the shooter exactly what to adjust.

`src/lib/chipVision/anomaly.ts` — pure detectors + fixers:

| Anomaly | Detect | Auto-fix | Else guide |
|---|---|---|---|
| **Merged columns** (touching, no gap) | region width ≫ one diameter `a` | split by width into ⌊width/a⌉ sub-columns | "leave small gaps between stacks" |
| **Leaning stack** | top-vs-bottom centre offset / principal-axis angle | measure band heights along the column's principal axis, not vertical | (only if lean too extreme) "straighten the stack" |
| **Blurry frame** | variance-of-Laplacian below threshold | pick the sharpest of the 3 burst frames | "hold steady / retake" |
| **Too tall** | estimated count > ~30 | — | "split into shorter stacks (≤ ~25)" |
| **View too top-down** | `b/a` > 0.8 → edges too short, `sin θ` small → count unstable | — (warn; blocking if > 0.9) | "view more from the side — lower your angle" |
| **View too side-on / no ellipse** | `b/a` < 0.15 or ellipse fit fails → tops invisible, no self-scale | fall back to calibrated ratio + flag | "look down onto the chip tops a bit more" |
| **Overlapping/occluded stacks** | columns overlap in x with large top-y gap | — | "spread the stacks apart, don't overlap" |
| **Column cut off by frame** | region touches the guide-box edge | — | "fit the whole stack inside the box" |
| **Weak contrast** (e.g. navy 100 on dark felt) | foreground mask coverage low / low edge gradient | — | "use a lighter surface or turn on the light" |
| **Glare/hotspot** (torch blow-out) | saturated-L pixel ratio on edges high | — | "reduce the angle to avoid glare, or torch off" |
| **Unknown band** | no denom within reject threshold | — | resolved in review (user assigns; may be a plaque/foreign chip) |

Severity: `blocking` (can't produce a reliable count → force retake, e.g. too-flat,
cut-off, weak-contrast) vs `warn` (proceed but flag, e.g. too-tall, minor lean). Auto-fixed
anomalies are logged for the confidence roll-up but need no user action. The detectors are
pure functions over the extracted column/mask geometry so they unit-test without a camera.

## 7. Calibration wizard (v1, per-device)

Entry: Settings → Chips, or a first-run prompt from the count sheet. For each enabled
denom, prompt "photograph a short column (≥3) of {value}" with the same guide, detect the
single column, and:
- Sample the band Lab → the denom's **learned edge colour** under the user's light.
- From the ellipse + the user-confirmed count, compute the measured `t/diameter` ratio;
  average across denoms (same physical chip) for one robust global `ratio`, keep per-denom
  colour.

Stored on-device (NOT synced — like `deviceIsTv`):

```ts
interface ChipCalibration {
  ratio: number;                     // measured t / diameter
  colors: Record<number, [number, number, number]>; // denom value → Lab
  createdAt: number;                 // epoch ms
}
```

`Settings.chipCalibration?: ChipCalibration` — optional, migrate-safe. Redo/clear
available. Without calibration the feature still works using configured hex colours + the
0.085 default ratio (just more light-sensitive, and 50/5000 more likely to need a manual
fix).

## 8. Data model & integration

- `types.ts`: add `Settings.chipCalibration?: ChipCalibration` + the `ChipCalibration`
  interface. Nothing added to `LiveData` (calibration is per-device). `chips` is already
  in `LiveData` → flows to the TV crown with zero new sync plumbing.
- `store.tsx`: `SET_PLAYER_CHIPS { id, chips }` (reuse an existing chips-edit action if one
  exists — verify during implementation) and `SET_CHIP_CALIBRATION`. `migrate()` defaults
  the new optional field.
- `RemoteControl.tsx`: a 📷 button in each player row next to the chips field → opens
  `ChipCountSheet` for that player.
- `i18n.ts`: en/de strings for the capture guide, review sheet, and calibration wizard.

### Modules (isolated, single-purpose)
- `src/lib/chipVision/geometry.ts` — ellipse → scale/tilt; band-height → count. Pure.
- `src/lib/chipVision/color.ts` — Lab conversion, per-row dominant colour (ignores deco),
  nearest-denom match with reject. Pure.
- `src/lib/chipVision/anomaly.ts` — pure anomaly detectors + auto-fixers (§6.5).
- `src/lib/chipVision/pipeline.ts` — frame → columns → bands → per-denom totals + anomalies;
  3-frame median. Aggregates across all columns (handles duplicate-denom stacks).
- `src/lib/chipVision/opencv.ts` — lazy `import()` of OpenCV.js WASM, loaded only on first
  use (Firebase-style code-split; main bundle untouched).
- `src/components/ChipCountSheet.tsx` — camera UI + review UI.
- `src/lib/chipCalibration.ts` — calibration flow helpers + persistence.

## 9. Error & edge handling

- No columns found → "arrange chips in separated columns" hint, no crash.
- Ellipse fit fails → default 0.085 ratio + lower confidence.
- Dark navy 100 on dark felt (dark-on-dark) → torch + guide to a lighter surface if the
  foreground mask is weak; flag.
- iOS-web (no torch / restricted sensors) → manual shutter, no bubble.
- OpenCV.js first-load latency (~1 s) → spinner; cached afterward (SW/APK).
- `DeviceOrientation` axis differs portrait/landscape → normalize before the bubble.
- Manual `chips` entry stays fully functional and untouched.

## 10. Non-goals (YAGNI)

- No cloud or LLM vision; no ML model or training.
- No multi-player-in-one-photo attribution — **one player per capture**.
- No plaques in v1 (rectangular; chips only — a plaque band reads as unknown).
- No continuous / live auto-updating of `chips` — on-demand only.
- No counting messy piles or chips still in the pot — requires tidy columns.

## 11. Accuracy expectations (honest)

- Colour-ID: high with calibration + torch; the 50/5000 pair is the main manual-fix case
  without calibration.
- Count-by-height: the fragile part — worst case ±1 chip on a tall or leaning band.
- Overall: a strong assist that shows exactly what it read and lets you fix a band in one
  tap — far faster than typing a big stack, which is the stated goal. It is **not** a
  dispute-grade recount; review before confirm is mandatory.

## 12. Testing

- `geometry.ts` (node `--experimental-strip-types`, project pattern): synthetic inputs
  (`a`, `b/a`, ratio, band heights) → assert counts; degenerate-tilt guard.
- `color.ts`: Lab arrays + denom set → assert nearest match + reject threshold; the
  50/5000 look-alike with and without calibration.
- `pipeline.ts`: 3 frame arrays → median reconciliation + confidence roll-up.
- Device: real photos of the user's chips (user-provided) — manual, not automatable here.
  The dev preview can exercise the UI + pipeline against a still image but cannot fully
  validate CV without the physical chips.

## 13. Phasing (for the implementation plan)

1. Data model + pure `geometry.ts`/`color.ts`/`pipeline.ts` + tests (no UI).
2. Camera capture: preview, framing guide, tilt bubble, auto-torch, steady auto-shoot.
3. Wire detection to a captured burst; build the review overlay + editable breakdown.
4. Calibration wizard + persistence.
5. RemoteControl integration + i18n (en/de).
6. Verify in dev preview; document the physical-chip validation the user must do.

## 14. Open risks

- Exact ceramic thickness assumed 3.3 mm (calibration removes the assumption).
- Felt contrast for the dark navy 100 chip — mitigated by torch + surface guidance; flag
  if it proves unreliable on the user's felt.
- OpenCV.js bundle: APK grows ~8 MB; PWA caches it on first use. Accepted trade-off for
  robust ellipse/contour fitting.
