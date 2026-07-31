# Photo → Chip Count (on-device) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the phone at a player's chips and have the app estimate the total chip value on-device (no cloud), then fill `LedgerPlayer.chips`.

**Architecture:** Guided camera capture (framing box, accelerometer tilt bubble, auto-torch, steady burst) feeds a lazy-loaded OpenCV.js pipeline. Each colour column self-calibrates scale from its top-face ellipse (`h_px = ratio·a·sin θ`), reads colour bands, classifies each against the store's denom colours (optionally re-learned by a calibration wizard), aggregates counts per denomination across all columns, flags anomalies (auto-fixing easy ones, guiding retakes otherwise), and shows a mandatory editable review before saving.

**Tech Stack:** Vite + React + TypeScript, Capacitor (Android). OpenCV.js (WASM, lazy `import()`), `getUserMedia`, `DeviceOrientation`, MediaStreamTrack `torch`. Tests: `node --experimental-strip-types`.

## Global Constraints

- **On-device only.** No cloud, no LLM vision, no ML model or training. Classic CV.
- **Chips:** SLOWPLAY Nash ceramic, **39 mm diameter, ~3.3 mm thick** → `DEFAULT_RATIO = 3.3 / 39 = 0.0846…`.
- **Bundle discipline:** OpenCV.js is loaded ONLY via dynamic `import()` on first use. NEVER static-import `opencv.ts`/`extract.ts` from always-loaded code (same rule as `liveSession.ts` — keep it out of the main bundle).
- **State:** reuse the existing `dispatch({ type: 'LEDGER_UPDATE', id, patch: { chips } })` to save a count. Store calibration via `dispatch({ type: 'UPDATE_SETTINGS', patch: { chipCalibration } })`. Calibration is **per-device — NOT in `LiveData`**, so it is never synced. `chips` is already synced.
- **Tests:** pure modules only, run with `node --experimental-strip-types src/lib/chipVision/<name>.test.ts`. Imports MUST use explicit `.ts` extensions. Use `node:assert/strict`.
- **Build check:** run `npm run build` (`tsc -b && vite build`) before committing any `.ts`/`.tsx` change — it catches unused imports/vars (`TS6133`) and type errors.
- **i18n:** every user-facing string goes through `useT()` with BOTH `en` and `de` entries in `src/lib/i18n.ts`.
- **Colours (store `defaultDenoms()`):** 1 `#ECE4D0`, 5 `#C0392B`, 10 `#31B6C9`, 25 `#2E9E52`, 50 `#E0782B`, 100 `#0C0C10`, 500 `#7A3D9C`, 1000 `#E4B41F`, 5000 `#9A5228`. Closest pair: 50/5000.

---

## File Structure

**Create:**
- `src/lib/chipVision/types.ts` — shared CV types + `ChipCalibration` (also referenced from `types.ts`).
- `src/lib/chipVision/color.ts` — RGB→Lab, ΔE, gold-deco filter, dominant colour, denom matching, `buildDenomRefs`.
- `src/lib/chipVision/geometry.ts` — ellipse → scale/tilt, band→count, lean.
- `src/lib/chipVision/anomaly.ts` — pure anomaly detectors + auto-fixers + constants.
- `src/lib/chipVision/aggregate.ts` — reconcile frames, group-by-denom, confidence roll-up.
- `src/lib/chipVision/index.ts` — `analyzeFrames()` (ties extract + aggregate + anomaly).
- `src/lib/chipVision/opencv.ts` — lazy OpenCV.js loader.
- `src/lib/chipVision/extract.ts` — impure: one frame → `ColumnResult[]` via OpenCV.js.
- `src/lib/chipVision/*.test.ts` — tests for color/geometry/anomaly/aggregate/index.
- `src/lib/useCameraCapture.ts` — camera stream + torch + steady-burst hook.
- `src/lib/useDeviceTilt.ts` — DeviceOrientation → tilt/bubble hook.
- `src/lib/chipCalibration.ts` — calibration helpers (frame → learned colour + ratio).
- `src/components/ChipCountSheet.tsx` — capture + review UI (the modal sheet).
- `src/components/ChipCalibrationWizard.tsx` — one-time per-denom calibration flow.

**Modify:**
- `src/types.ts` — add `ChipCalibration` interface + `Settings.chipCalibration?`.
- `src/store.tsx` — `migrate()` leaves `chipCalibration` undefined by default (deep-merge already handles new optional fields; no code change unless a default is needed).
- `src/screens/RemoteControl.tsx` — 📷 button in each player row (near the chips input, ~line 282).
- `src/screens/SettingsScreen.tsx` — "Calibrate chip colours" entry under Chip art.
- `src/lib/i18n.ts` — new `chipcount.*` strings (en/de).
- `src/styles.css` — sheet, camera overlay, tilt bubble, review-list styles.
- `package.json` — add `@techstark/opencv-js` dependency.

---

## Task 1: Shared types + colour module

**Files:**
- Create: `src/lib/chipVision/types.ts`, `src/lib/chipVision/color.ts`, `src/lib/chipVision/color.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Produces:
  - `type Lab = [number, number, number]`
  - `interface DenomRef { value: number; lab: Lab }`
  - `interface ChipCalibration { ratio: number; colors: Record<number, Lab>; createdAt: number }`
  - `rgbToLab(r: number, g: number, b: number): Lab`
  - `hexToLab(hex: string): Lab`
  - `labDistance(a: Lab, b: Lab): number`
  - `isGoldDeco(lab: Lab): boolean`
  - `dominantLab(pixels: Lab[]): Lab | null`
  - `nearestDenom(lab: Lab, denoms: DenomRef[], reject: number): { value: number | null; distance: number; margin: number }`
  - `buildDenomRefs(denoms: { value: number; color: string; enabled: boolean }[], cal?: ChipCalibration): DenomRef[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/color.test.ts`:

```ts
import assert from 'node:assert/strict';
import { rgbToLab, hexToLab, labDistance, isGoldDeco, dominantLab, nearestDenom, buildDenomRefs } from './color.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('white RGB → L*≈100, a*,b*≈0', () => {
  const [L, a, b] = rgbToLab(255, 255, 255);
  assert.ok(Math.abs(L - 100) < 0.5, `L=${L}`);
  assert.ok(Math.abs(a) < 1 && Math.abs(b) < 1, `a=${a} b=${b}`);
});

ok('black RGB → L*≈0', () => {
  assert.ok(rgbToLab(0, 0, 0)[0] < 0.5);
});

ok('labDistance is symmetric and zero on equal', () => {
  const x: [number, number, number] = [50, 10, -20];
  assert.equal(labDistance(x, x), 0);
  assert.ok(labDistance([0, 0, 0], [100, 0, 0]) === 100);
});

ok('gold deco detected, chip body colours not', () => {
  assert.equal(isGoldDeco(hexToLab('#E9CC7A')), true);   // bright yellow deco line
  assert.equal(isGoldDeco(hexToLab('#0C0C10')), false);  // navy body
  assert.equal(isGoldDeco(hexToLab('#C0392B')), false);  // red body
});

ok('dominantLab ignores deco pixels and returns the median body colour', () => {
  const red = hexToLab('#C0392B');
  const deco = hexToLab('#E9CC7A');
  const px = [red, red, red, deco, red];
  const d = dominantLab(px)!;
  assert.ok(labDistance(d, red) < 3, `got ${d}`);
});

ok('nearestDenom matches the closest and rejects far colours', () => {
  const refs = buildDenomRefs([
    { value: 50, color: '#E0782B', enabled: true },
    { value: 5000, color: '#9A5228', enabled: true },
  ]);
  const orange = nearestDenom(hexToLab('#E0782B'), refs, 20);
  assert.equal(orange.value, 50);
  assert.ok(orange.margin > 0, 'orange should have a positive margin over brown');
  const green = nearestDenom(hexToLab('#2E9E52'), refs, 20);
  assert.equal(green.value, null, 'far-away green must be rejected');
});

ok('buildDenomRefs prefers calibrated colours when present', () => {
  const cal = { ratio: 0.085, colors: { 50: [60, 5, 5] as [number, number, number] }, createdAt: 0 };
  const refs = buildDenomRefs([{ value: 50, color: '#E0782B', enabled: true }], cal);
  assert.deepEqual(refs[0].lab, [60, 5, 5]);
});

ok('buildDenomRefs skips disabled denoms', () => {
  const refs = buildDenomRefs([{ value: 1, color: '#ECE4D0', enabled: false }]);
  assert.equal(refs.length, 0);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/color.test.ts`
Expected: FAIL — `Cannot find module './color.ts'`.

- [ ] **Step 3: Write `src/lib/chipVision/types.ts`**

```ts
// Shared computer-vision types for the photo → chip-count feature.

export type Lab = [number, number, number];

/** A denomination's reference edge colour, in CIE Lab. */
export interface DenomRef {
  value: number;
  lab: Lab;
}

/** Per-device calibration learned by the calibration wizard. NOT synced. */
export interface ChipCalibration {
  ratio: number;                 // measured chip thickness / diameter
  colors: Record<number, Lab>;   // denom value → learned edge colour (Lab)
  createdAt: number;             // epoch ms
}

/** A fitted top-face ellipse for a column (pixels). */
export interface Ellipse {
  cx: number;
  cy: number;
  major: number;                 // full major axis length (≈ diameter px)
  minor: number;                 // full minor axis length
  angleDeg: number;
}

/** One detected colour band inside a column. */
export interface Band {
  denomValue: number | null;     // null = unknown, user must assign
  lab: Lab;
  heightPx: number;
  count: number;                 // rounded chip count (≥ 1)
  confidence: number;            // 0..1
  colorMargin: number;           // ΔE to 2nd-best denom minus best
  roundness: number;             // 0..1, how integer the raw count was
}

/** One column's read result. */
export interface ColumnResult {
  x0: number;
  x1: number;
  topY: number;
  bottomY: number;
  hPx: number;                   // single-chip edge height (px)
  bands: Band[];
}

export type AnomalySeverity = 'warn' | 'blocking';

export interface Anomaly {
  code: string;                  // i18n key suffix, e.g. 'mergedColumns'
  severity: AnomalySeverity;
  autoFixed: boolean;
  columnIndex?: number;
}

export interface DenomTotal {
  value: number;
  count: number;
  confidence: number;
}

export interface CountResult {
  totals: DenomTotal[];          // grouped by denom, summed across all columns
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;            // overall 0..1
}
```

- [ ] **Step 4: Write `src/lib/chipVision/color.ts`**

```ts
import type { Lab, DenomRef, ChipCalibration } from './types.ts';

// --- sRGB → CIE Lab (D65) ---
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // linear RGB → XYZ (D65)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const h = hex.replace('#', '');
  return rgbToLab(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

/** CIE76 ΔE (Euclidean in Lab) — adequate for this palette. */
export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Gold art-deco line: bright + yellow (high L*, positive b*, near-zero a*). */
export function isGoldDeco(lab: Lab): boolean {
  return lab[0] > 62 && lab[2] > 22 && lab[1] > -8 && lab[1] < 22;
}

/** Median Lab of body pixels, discarding gold-deco pixels. */
export function dominantLab(pixels: Lab[]): Lab | null {
  const body = pixels.filter((p) => !isGoldDeco(p));
  const src = body.length >= 3 ? body : pixels;
  if (src.length === 0) return null;
  const med = (i: number) => {
    const s = src.map((p) => p[i]).sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  return [med(0), med(1), med(2)];
}

/**
 * Nearest denomination by ΔE. `margin` = (2nd-best distance − best distance);
 * a larger margin means a more confident match. Returns value=null when the best
 * distance exceeds `reject`.
 */
export function nearestDenom(
  lab: Lab,
  denoms: DenomRef[],
  reject: number,
): { value: number | null; distance: number; margin: number } {
  if (denoms.length === 0) return { value: null, distance: Infinity, margin: 0 };
  const sorted = denoms
    .map((d) => ({ value: d.value, distance: labDistance(lab, d.lab) }))
    .sort((a, b) => a.distance - b.distance);
  const best = sorted[0];
  const second = sorted[1]?.distance ?? Infinity;
  if (best.distance > reject) return { value: null, distance: best.distance, margin: 0 };
  return { value: best.value, distance: best.distance, margin: second - best.distance };
}

/** Store denominations → Lab references, using calibrated colours when available. */
export function buildDenomRefs(
  denoms: { value: number; color: string; enabled: boolean }[],
  cal?: ChipCalibration,
): DenomRef[] {
  return denoms
    .filter((d) => d.enabled)
    .map((d) => ({ value: d.value, lab: cal?.colors[d.value] ?? hexToLab(d.color) }));
}
```

- [ ] **Step 5: Add `ChipCalibration` to `src/types.ts`**

Add near the other `Settings` sub-types (import the CV type to keep one definition):

```ts
// at top of src/types.ts, after the existing imports/exports
export type { ChipCalibration } from './lib/chipVision/types';
```

Then inside `interface Settings { … }` add the field (place it beside `chipArt`):

```ts
  chipCalibration?: import('./lib/chipVision/types').ChipCalibration; // per-device, NOT synced
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/color.test.ts`
Expected: `all passed`, exit 0.

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: exits 0 (no `TS6133`/type errors).

- [ ] **Step 8: Commit**

```bash
git add src/lib/chipVision/types.ts src/lib/chipVision/color.ts src/lib/chipVision/color.test.ts src/types.ts
git commit -m "feat(chipvision): Lab colour model + denom matching + shared types"
```

---

## Task 2: Geometry module (self-calibrating scale)

**Files:**
- Create: `src/lib/chipVision/geometry.ts`, `src/lib/chipVision/geometry.test.ts`

**Interfaces:**
- Consumes: `Ellipse` from `./types.ts`.
- Produces:
  - `DEFAULT_RATIO: number` (= 3.3/39)
  - `tiltSinTheta(minor: number, major: number): number`
  - `singleChipHeightPx(major: number, minor: number, ratio: number): number`
  - `bandCount(bandHeightPx: number, hPx: number): number`
  - `rawBandCount(bandHeightPx: number, hPx: number): number`
  - `leanAngleDeg(topCx: number, topCy: number, botCx: number, botCy: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/geometry.test.ts`:

```ts
import assert from 'node:assert/strict';
import { DEFAULT_RATIO, tiltSinTheta, singleChipHeightPx, bandCount, rawBandCount, leanAngleDeg } from './geometry.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('DEFAULT_RATIO ≈ 0.0846', () => assert.ok(Math.abs(DEFAULT_RATIO - 3.3 / 39) < 1e-9));

ok('tiltSinTheta: circle (top view) → 0, line (side view) → 1', () => {
  assert.ok(Math.abs(tiltSinTheta(100, 100) - 0) < 1e-9);
  assert.ok(Math.abs(tiltSinTheta(0, 100) - 1) < 1e-9);
});

ok('singleChipHeightPx uses h = ratio·a·sinθ', () => {
  // a=200, b/a=0.6 → sinθ=0.8; ratio 0.0846 → h = 0.0846*200*0.8 = 13.53
  const h = singleChipHeightPx(200, 120, DEFAULT_RATIO);
  assert.ok(Math.abs(h - 13.53) < 0.1, `h=${h}`);
});

ok('bandCount rounds to nearest chip, min 1', () => {
  const h = 13.5;
  assert.equal(bandCount(13.5 * 12, h), 12);
  assert.equal(bandCount(13.5 * 11.6, h), 12);
  assert.equal(bandCount(1, h), 1);      // never zero for a real band
});

ok('rawBandCount is unrounded (for roundness confidence)', () => {
  assert.ok(Math.abs(rawBandCount(27, 13.5) - 2) < 1e-9);
});

ok('leanAngleDeg: perfectly vertical stack → 0°', () => {
  assert.ok(Math.abs(leanAngleDeg(100, 0, 100, 400)) < 1e-9);
});

ok('leanAngleDeg: leaning stack → non-zero', () => {
  // top shifted 40px over a 400px height → atan(40/400) ≈ 5.7°
  assert.ok(Math.abs(leanAngleDeg(140, 0, 100, 400) - 5.71) < 0.1);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/chipVision/geometry.ts`**

```ts
// SLOWPLAY Nash ceramic: 39 mm diameter, ~3.3 mm thickness.
export const DEFAULT_RATIO = 3.3 / 39;

/** sinθ from the top-face ellipse: sqrt(1 − (b/a)²). Clamped to [0,1]. */
export function tiltSinTheta(minor: number, major: number): number {
  if (major <= 0) return 0;
  const r = Math.min(1, Math.max(0, minor / major));
  return Math.sqrt(Math.max(0, 1 - r * r));
}

/** Single-chip edge height in px: h = ratio · a · sinθ. */
export function singleChipHeightPx(major: number, minor: number, ratio: number): number {
  return ratio * major * tiltSinTheta(minor, major);
}

/** Unrounded chip count of a band. */
export function rawBandCount(bandHeightPx: number, hPx: number): number {
  return hPx > 0 ? bandHeightPx / hPx : 0;
}

/** Rounded chip count, never below 1 for a detected band. */
export function bandCount(bandHeightPx: number, hPx: number): number {
  return Math.max(1, Math.round(rawBandCount(bandHeightPx, hPx)));
}

/** Lean of a column: angle (deg) of the top→bottom centre line from vertical. */
export function leanAngleDeg(topCx: number, topCy: number, botCx: number, botCy: number): number {
  const dy = Math.abs(botCy - topCy);
  const dx = botCx - topCx;
  return dy === 0 ? 0 : Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/geometry.test.ts`
Expected: `all passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipVision/geometry.ts src/lib/chipVision/geometry.test.ts
git commit -m "feat(chipvision): self-calibrating column geometry (ellipse → scale/tilt/count)"
```

---

## Task 3: Anomaly detectors

**Files:**
- Create: `src/lib/chipVision/anomaly.ts`, `src/lib/chipVision/anomaly.test.ts`

**Interfaces:**
- Consumes: `Anomaly`, `Ellipse` from `./types.ts`.
- Produces (all pure):
  - `detectView(minor: number, major: number, columnIndex: number): Anomaly | null`
  - `detectTooTall(estCount: number, columnIndex: number): Anomaly | null`
  - `detectLean(leanDeg: number, columnIndex: number): { anomaly: Anomaly | null; useAxis: boolean }`
  - `detectCutOff(x0: number, x1: number, topY: number, bottomY: number, box: { x0: number; y0: number; x1: number; y1: number }, columnIndex: number): Anomaly | null`
  - `detectWeakContrast(maskCoverage: number): Anomaly | null`
  - `detectGlare(saturatedRatio: number): Anomaly | null`
  - `splitMergedColumn(x0: number, x1: number, diameterPx: number): number`  (returns sub-column count, ≥1)
  - `pickSharpestFrame(laplacianVariances: number[]): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/anomaly.test.ts`:

```ts
import assert from 'node:assert/strict';
import {
  detectView, detectTooTall, detectLean, detectCutOff,
  detectWeakContrast, detectGlare, splitMergedColumn, pickSharpestFrame,
} from './anomaly.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

ok('view in the sweet spot → no anomaly', () => {
  // b/a = 0.42 (θ≈65°)
  assert.equal(detectView(84, 200, 0), null);
});

ok('too top-down (b/a>0.8) warns; >0.9 blocks', () => {
  assert.equal(detectView(170, 200, 0)!.severity, 'warn');
  assert.equal(detectView(185, 200, 0)!.severity, 'blocking');
  assert.equal(detectView(170, 200, 0)!.code, 'viewTooTopDown');
});

ok('too side-on (b/a<0.15) blocks with the no-ellipse code', () => {
  const a = detectView(20, 200, 1)!;
  assert.equal(a.severity, 'blocking');
  assert.equal(a.code, 'viewTooSideOn');
  assert.equal(a.columnIndex, 1);
});

ok('too tall warns over ~30', () => {
  assert.equal(detectTooTall(25, 0), null);
  assert.equal(detectTooTall(34, 0)!.code, 'tooTall');
});

ok('small lean → use principal axis, no user anomaly', () => {
  const r = detectLean(6, 0);
  assert.equal(r.useAxis, true);
  assert.equal(r.anomaly, null);
});

ok('extreme lean → blocking anomaly', () => {
  const r = detectLean(20, 2);
  assert.equal(r.anomaly!.code, 'leaning');
  assert.equal(r.anomaly!.severity, 'blocking');
});

ok('column touching the guide box edge → cut-off', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
  assert.equal(detectCutOff(10, 90, 10, 90, box, 0), null);
  assert.equal(detectCutOff(10, 90, 1, 90, box, 0)!.code, 'cutOff');   // top touches
});

ok('weak mask coverage → contrast anomaly', () => {
  assert.equal(detectWeakContrast(0.4), null);
  assert.equal(detectWeakContrast(0.05)!.code, 'weakContrast');
});

ok('glare when many blown-out edge pixels', () => {
  assert.equal(detectGlare(0.02), null);
  assert.equal(detectGlare(0.2)!.code, 'glare');
});

ok('splitMergedColumn returns how many chips wide a region is', () => {
  assert.equal(splitMergedColumn(0, 210, 100), 2);   // ~2 diameters wide
  assert.equal(splitMergedColumn(0, 105, 100), 1);
});

ok('pickSharpestFrame returns the index of the max variance', () => {
  assert.equal(pickSharpestFrame([12, 40, 8]), 1);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/anomaly.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/chipVision/anomaly.ts`**

```ts
import type { Anomaly } from './types.ts';

const a = (code: string, severity: 'warn' | 'blocking', autoFixed: boolean, columnIndex?: number): Anomaly =>
  ({ code, severity, autoFixed, columnIndex });

// b/a thresholds (ellipse minor/major).
const BA_TOP_WARN = 0.8;    // too top-down: edges compressed
const BA_TOP_BLOCK = 0.9;
const BA_SIDE_MIN = 0.15;   // too side-on: tops invisible, no self-scale
const MAX_STACK = 30;       // chips per column before we warn
const LEAN_AXIS_DEG = 4;    // above this, measure along the principal axis
const LEAN_BLOCK_DEG = 15;  // above this, force a retake
const CONTRAST_MIN = 0.12;  // foreground mask coverage floor
const GLARE_MAX = 0.08;     // blown-out edge-pixel ratio ceiling

/** Ellipse aspect → view-angle anomaly. */
export function detectView(minor: number, major: number, columnIndex: number): Anomaly | null {
  if (major <= 0) return a('viewTooSideOn', 'blocking', false, columnIndex);
  const r = minor / major;
  if (r < BA_SIDE_MIN) return a('viewTooSideOn', 'blocking', false, columnIndex);
  if (r > BA_TOP_BLOCK) return a('viewTooTopDown', 'blocking', false, columnIndex);
  if (r > BA_TOP_WARN) return a('viewTooTopDown', 'warn', false, columnIndex);
  return null;
}

export function detectTooTall(estCount: number, columnIndex: number): Anomaly | null {
  return estCount > MAX_STACK ? a('tooTall', 'warn', false, columnIndex) : null;
}

/** Small lean is auto-handled by measuring along the column axis; large lean blocks. */
export function detectLean(leanDeg: number, columnIndex: number): { anomaly: Anomaly | null; useAxis: boolean } {
  if (leanDeg >= LEAN_BLOCK_DEG) return { anomaly: a('leaning', 'blocking', false, columnIndex), useAxis: true };
  if (leanDeg >= LEAN_AXIS_DEG) return { anomaly: null, useAxis: true };  // auto-fixed silently
  return { anomaly: null, useAxis: false };
}

export function detectCutOff(
  x0: number, x1: number, topY: number, bottomY: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  columnIndex: number,
): Anomaly | null {
  const pad = 3;
  const touches = x0 <= box.x0 + pad || x1 >= box.x1 - pad || topY <= box.y0 + pad || bottomY >= box.y1 - pad;
  return touches ? a('cutOff', 'blocking', false, columnIndex) : null;
}

export function detectWeakContrast(maskCoverage: number): Anomaly | null {
  return maskCoverage < CONTRAST_MIN ? a('weakContrast', 'blocking', false) : null;
}

export function detectGlare(saturatedRatio: number): Anomaly | null {
  return saturatedRatio > GLARE_MAX ? a('glare', 'warn', false) : null;
}

/** How many chip-diameters wide a region is (≥1). Used to split touching stacks. */
export function splitMergedColumn(x0: number, x1: number, diameterPx: number): number {
  if (diameterPx <= 0) return 1;
  return Math.max(1, Math.round((x1 - x0) / diameterPx));
}

/** Index of the sharpest frame (max variance-of-Laplacian). */
export function pickSharpestFrame(laplacianVariances: number[]): number {
  let best = 0;
  for (let i = 1; i < laplacianVariances.length; i++) {
    if (laplacianVariances[i] > laplacianVariances[best]) best = i;
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/anomaly.test.ts`
Expected: `all passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipVision/anomaly.ts src/lib/chipVision/anomaly.test.ts
git commit -m "feat(chipvision): anomaly detectors (view/tall/lean/cutoff/contrast/glare/merge)"
```

---

## Task 4: Aggregate — reconcile frames, group by denom, confidence

**Files:**
- Create: `src/lib/chipVision/aggregate.ts`, `src/lib/chipVision/aggregate.test.ts`

**Interfaces:**
- Consumes: `ColumnResult`, `Band`, `CountResult`, `DenomTotal`, `Anomaly` from `./types.ts`.
- Produces:
  - `bandConfidence(band: { colorMargin: number; roundness: number }, frameAgreement: number): number`
  - `reconcileColumns(frames: ColumnResult[][]): ColumnResult[]`  (align by x-order, median per band)
  - `aggregate(reconciled: ColumnResult[], anomalies: Anomaly[], frameCount: number): CountResult`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/aggregate.test.ts`:

```ts
import assert from 'node:assert/strict';
import { bandConfidence, reconcileColumns, aggregate } from './aggregate.ts';
import type { ColumnResult, Band } from './types.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

const band = (denomValue: number | null, count: number, extra: Partial<Band> = {}): Band => ({
  denomValue, lab: [50, 0, 0], heightPx: count * 13, count,
  confidence: 1, colorMargin: 20, roundness: 1, ...extra,
});
const col = (x0: number, bands: Band[]): ColumnResult => ({ x0, x1: x0 + 40, topY: 0, bottomY: 100, hPx: 13, bands });

ok('bandConfidence rewards margin, roundness, agreement', () => {
  assert.ok(bandConfidence({ colorMargin: 30, roundness: 1 }, 1) > 0.9);
  assert.ok(bandConfidence({ colorMargin: 1, roundness: 0.2 }, 0.3) < 0.5);
});

ok('reconcileColumns takes the median band count across frames by x-order', () => {
  const frames: ColumnResult[][] = [
    [col(10, [band(10, 12)])],
    [col(10, [band(10, 13)])],
    [col(10, [band(10, 12)])],
  ];
  const r = reconcileColumns(frames);
  assert.equal(r[0].bands[0].count, 12);
});

ok('aggregate sums the SAME denom across multiple columns', () => {
  const cols = [col(10, [band(10, 12)]), col(80, [band(10, 8)]), col(150, [band(100, 3)])];
  const res = aggregate(cols, [], 3);
  const ten = res.totals.find((t) => t.value === 10)!;
  const hundred = res.totals.find((t) => t.value === 100)!;
  assert.equal(ten.count, 20);                 // 12 + 8 across two cyan columns
  assert.equal(hundred.count, 3);
  assert.equal(res.totalValue, 20 * 10 + 3 * 100);
});

ok('aggregate keeps unknown bands out of totals but lowers confidence', () => {
  const cols = [col(10, [band(null, 5, { confidence: 0.2 })])];
  const res = aggregate(cols, [], 1);
  assert.equal(res.totals.length, 0);
  assert.ok(res.confidence < 0.5);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/chipVision/aggregate.ts`**

```ts
import type { ColumnResult, Band, CountResult, DenomTotal, Anomaly } from './types.ts';

/** Combine the three confidence signals into 0..1. */
export function bandConfidence(band: { colorMargin: number; roundness: number }, frameAgreement: number): number {
  const color = Math.min(1, band.colorMargin / 20);       // ΔE margin ≥20 → full marks
  return Math.max(0, Math.min(1, 0.45 * color + 0.35 * band.roundness + 0.20 * frameAgreement));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/**
 * Align columns across frames by left-to-right order and take, per band slot,
 * the median count. Frame agreement (1 − spread) feeds each band's confidence.
 * The frame with the most columns defines the slot layout.
 */
export function reconcileColumns(frames: ColumnResult[][]): ColumnResult[] {
  if (frames.length === 0) return [];
  const ordered = frames.map((f) => [...f].sort((a, b) => a.x0 - b.x0));
  const base = ordered.reduce((m, f) => (f.length > m.length ? f : m), ordered[0]);
  return base.map((col, ci) => {
    const bands = col.bands.map((b, bi) => {
      const counts = ordered
        .map((f) => f[ci]?.bands[bi]?.count)
        .filter((c): c is number => typeof c === 'number');
      const count = counts.length ? median(counts) : b.count;
      const spread = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;
      const agreement = spread === 0 ? 1 : Math.max(0, 1 - spread / Math.max(1, count));
      return { ...b, count, confidence: bandConfidence(b, agreement) };
    });
    return { ...col, bands };
  });
}

/** Sum bands per denomination across ALL columns; roll up overall confidence. */
export function aggregate(reconciled: ColumnResult[], anomalies: Anomaly[], frameCount: number): CountResult {
  const byDenom = new Map<number, { count: number; conf: number[] }>();
  const allConf: number[] = [];
  let hasUnknown = false;

  for (const col of reconciled) {
    for (const b of col.bands) {
      allConf.push(b.confidence);
      if (b.denomValue == null) { hasUnknown = true; continue; }
      const cur = byDenom.get(b.denomValue) ?? { count: 0, conf: [] };
      cur.count += b.count;
      cur.conf.push(b.confidence);
      byDenom.set(b.denomValue, cur);
    }
  }

  const totals: DenomTotal[] = [...byDenom.entries()]
    .map(([value, v]) => ({ value, count: v.count, confidence: v.conf.reduce((s, c) => s + c, 0) / v.conf.length }))
    .sort((a, b) => a.value - b.value);

  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  let confidence = allConf.length ? allConf.reduce((s, c) => s + c, 0) / allConf.length : 0;
  if (hasUnknown) confidence = Math.min(confidence, 0.4);
  if (anomalies.some((x) => x.severity === 'blocking')) confidence = Math.min(confidence, 0.3);

  return { totals, totalValue, anomalies, frames: frameCount, confidence };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/aggregate.test.ts`
Expected: `all passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipVision/aggregate.ts src/lib/chipVision/aggregate.test.ts
git commit -m "feat(chipvision): frame reconciliation + per-denom aggregation + confidence"
```

---

## Task 5: OpenCV loader + frame extraction (impure)

**Files:**
- Create: `src/lib/chipVision/opencv.ts`, `src/lib/chipVision/extract.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildDenomRefs`, `dominantLab`, `nearestDenom`, `rgbToLab` (color.ts); `singleChipHeightPx`, `bandCount`, `rawBandCount`, `leanAngleDeg`, `DEFAULT_RATIO` (geometry.ts); `detectView`, `detectLean`, `detectCutOff`, `detectWeakContrast`, `detectGlare`, `splitMergedColumn` (anomaly.ts).
- Produces:
  - `loadCv(): Promise<any>` — resolves the OpenCV.js module (cached).
  - `extractColumns(bitmap: ImageBitmap | HTMLCanvasElement, box: Box, denoms: DenomRef[], ratio: number, rejectDeltaE: number): Promise<{ columns: ColumnResult[]; anomalies: Anomaly[]; laplacianVariance: number }>`
  - `type Box = { x0: number; y0: number; x1: number; y1: number }`

> This task is impure (needs a real image + WASM) so it is verified by `npm run build` + the dev-preview harness in Task 11, not a unit test. Keep ALL cv usage inside these two files.

- [ ] **Step 1: Add the dependency**

Run:
```bash
npm install @techstark/opencv-js
```
Expected: adds `@techstark/opencv-js` to `package.json` dependencies.

- [ ] **Step 2: Write `src/lib/chipVision/opencv.ts`**

```ts
// Lazy OpenCV.js loader. Imported ONLY via dynamic import() from extract.ts,
// which is itself dynamically imported — so the ~8 MB WASM never enters the
// main bundle (same discipline as liveSession.ts / Firebase).
let cvPromise: Promise<any> | null = null;

export function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then(async (mod: any) => {
      const cv = mod.default ?? mod;
      if (cv.getBuildInformation) return cv;
      // Some builds resolve before the WASM runtime is ready.
      await new Promise<void>((res) => { cv.onRuntimeInitialized = () => res(); });
      return cv;
    });
  }
  return cvPromise;
}
```

- [ ] **Step 3: Write `src/lib/chipVision/extract.ts`**

```ts
import { loadCv } from './opencv.ts';
import type { ColumnResult, Band, Anomaly, DenomRef, Lab } from './types.ts';
import { rgbToLab, dominantLab, nearestDenom } from './color.ts';
import { singleChipHeightPx, bandCount, rawBandCount, leanAngleDeg } from './geometry.ts';
import {
  detectView, detectLean, detectCutOff, detectWeakContrast, detectGlare, splitMergedColumn,
} from './anomaly.ts';

export type Box = { x0: number; y0: number; x1: number; y1: number };

const WORK_W = 1000;             // working width (px)
const BAND_DELTA_E = 8;          // Lab jump that starts a new band
const MIN_BAND_CHIPS = 0.4;      // merge slivers below this

/** Draw the source into a working canvas cropped to the guide box. */
function toWorkCanvas(src: ImageBitmap | HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const scale = WORK_W / bw;
  const c = document.createElement('canvas');
  c.width = Math.round(bw * scale);
  c.height = Math.round(bh * scale);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, box.x0, box.y0, bw, bh, 0, 0, c.width, c.height);
  return c;
}

/**
 * One frame → columns. Pipeline: felt background model → foreground mask →
 * column segmentation → per-column top-ellipse fit (self-calibrating scale) →
 * colour-band read + denom classification. Anomalies collected alongside.
 */
export async function extractColumns(
  src: ImageBitmap | HTMLCanvasElement,
  box: Box,
  denoms: DenomRef[],
  ratio: number,
  rejectDeltaE: number,
): Promise<{ columns: ColumnResult[]; anomalies: Anomaly[]; laplacianVariance: number }> {
  const cv = await loadCv();
  const canvas = toWorkCanvas(src, box);
  const W = canvas.width, H = canvas.height;
  const workBox = { x0: 0, y0: 0, x1: W, y1: H };
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, W, H);

  const src4 = cv.matFromImageData(rgba);
  const rgb = new cv.Mat();
  cv.cvtColor(src4, rgb, cv.COLOR_RGBA2RGB);
  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

  // --- sharpness (variance of Laplacian on grayscale) ---
  const gray = new cv.Mat();
  cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const lap = new cv.Mat();
  cv.Laplacian(gray, lap, cv.CV_64F);
  const mean = new cv.Mat(), stddev = new cv.Mat();
  cv.meanStdDev(lap, mean, stddev);
  const laplacianVariance = stddev.doubleAt(0, 0) ** 2;

  // --- background (felt) model from the box corners ---
  const corners = sampleCorners(lab, W, H);
  const felt = medianLab(corners);
  const mask = foregroundMask(cv, lab, felt, W, H);
  const maskCoverage = cv.countNonZero(mask) / (W * H);

  const anomalies: Anomaly[] = [];
  const contrast = detectWeakContrast(maskCoverage);
  if (contrast) anomalies.push(contrast);
  const glare = detectGlare(saturatedRatio(lab, mask, W, H));
  if (glare) anomalies.push(glare);

  const rawColumns = segmentColumns(cv, mask, W, H);      // {x0,x1,topY,bottomY,contour}
  const diameterPx = rawColumns.length ? median(rawColumns.map((c) => c.x1 - c.x0)) : W;

  const columns: ColumnResult[] = [];
  let ci = 0;
  for (const rc of rawColumns) {
    const subCount = splitMergedColumn(rc.x0, rc.x1, diameterPx);
    const subW = (rc.x1 - rc.x0) / subCount;
    for (let s = 0; s < subCount; s++) {
      const cx0 = rc.x0 + s * subW, cx1 = cx0 + subW;
      const col = readColumn(cv, lab, mask, { x0: cx0, x1: cx1, topY: rc.topY, bottomY: rc.bottomY }, denoms, ratio, rejectDeltaE, ci, anomalies, workBox);
      if (col) columns.push(col);
      ci++;
    }
  }

  src4.delete(); rgb.delete(); lab.delete(); gray.delete(); lap.delete();
  mean.delete(); stddev.delete(); mask.delete();
  return { columns, anomalies, laplacianVariance };

  // ---- helpers close over `cv` ----
  function readColumn(
    cv: any, lab: any, mask: any,
    reg: { x0: number; x1: number; topY: number; bottomY: number },
    denoms: DenomRef[], ratio: number, reject: number, columnIndex: number,
    anomalies: Anomaly[], box: Box,
  ): ColumnResult | null {
    const ellipse = fitTopEllipse(cv, mask, reg);        // {major,minor,cx,cy,angle} | null
    const cut = detectCutOff(reg.x0, reg.x1, reg.topY, reg.bottomY, box, columnIndex);
    if (cut) anomalies.push(cut);

    let major = ellipse?.major ?? (reg.x1 - reg.x0);
    let minor = ellipse?.minor ?? major * 0.4;
    const view = detectView(minor, major, columnIndex);
    if (view) anomalies.push(view);

    const topCx = ellipse?.cx ?? (reg.x0 + reg.x1) / 2;
    const botCx = bottomCentre(cv, mask, reg);
    const lean = detectLean(leanAngleDeg(topCx, reg.topY, botCx, reg.bottomY), columnIndex);
    if (lean.anomaly) anomalies.push(lean.anomaly);

    const hPx = singleChipHeightPx(major, minor, ratio) || (ratio * major);
    const profile = colourProfile(cv, lab, mask, reg, ellipse, lean.useAxis, topCx, botCx);  // Lab per row, top→bottom
    const bands = segmentBands(profile, hPx, denoms, reject);
    if (bands.length === 0) return null;
    return { x0: reg.x0, x1: reg.x1, topY: reg.topY, bottomY: reg.bottomY, hPx, bands };
  }

  function segmentBands(profile: Lab[], hPx: number, denoms: DenomRef[], reject: number): Band[] {
    const bands: Band[] = [];
    let start = 0;
    const flush = (end: number) => {
      const slice = profile.slice(start, end);
      const lab = dominantLab(slice);
      if (!lab) return;
      const heightPx = end - start;
      if (heightPx / hPx < MIN_BAND_CHIPS && bands.length) {   // merge sliver into previous
        return;
      }
      const m = nearestDenom(lab, denoms, reject);
      const raw = rawBandCount(heightPx, hPx);
      const roundness = 1 - 2 * Math.abs(raw - Math.round(raw));
      bands.push({
        denomValue: m.value, lab, heightPx,
        count: bandCount(heightPx, hPx),
        confidence: 1, colorMargin: m.margin, roundness: Math.max(0, roundness),
      });
    };
    for (let y = 1; y < profile.length; y++) {
      if (labDist(profile[y], profile[y - 1]) > BAND_DELTA_E) { flush(y); start = y; }
    }
    flush(profile.length);
    return bands;
  }
}

// ---- small pure-ish CV helpers (kept in this impure file on purpose) ----
function labDist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }
function medianLab(px: Lab[]): Lab {
  const m = (i: number) => median(px.map((p) => p[i]));
  return [m(0), m(1), m(2)];
}
// NOTE: sampleCorners/foregroundMask/segmentColumns/fitTopEllipse/colourProfile/
// bottomCentre/saturatedRatio convert OpenCV Lab (0..255 scaled) to real Lab via
// (L*100/255, a-128, b-128). Implement per the inline comments; each is <25 lines.
```

> **Implementer note:** the six CV helpers referenced above (`sampleCorners`, `foregroundMask`, `segmentColumns`, `fitTopEllipse`, `colourProfile`, `bottomCentre`, `saturatedRatio`) are thin OpenCV.js wrappers. Write them in `extract.ts` below the export. Contract for each:
> - `sampleCorners(lab, W, H): Lab[]` — read the four box-corner 12×12 patches, convert cv-Lab→real-Lab.
> - `foregroundMask(cv, lab, felt, W, H): cv.Mat` — per-pixel ΔE to `felt` > 14 → 255; `cv.morphologyEx` open then close with a 5×5 kernel.
> - `segmentColumns(cv, mask, W, H): {x0,x1,topY,bottomY}[]` — `cv.findContours`; keep contours taller than `0.15·H`; bounding boxes sorted by x.
> - `fitTopEllipse(cv, mask, reg): {major,minor,cx,cy,angle}|null` — take the top ~25% of the region's contour points, `cv.fitEllipse`, return axes (major=max, minor=min); null if < 5 points.
> - `colourProfile(cv, lab, mask, reg, ellipse, useAxis, topCx, botCx): Lab[]` — for each row below the ellipse to `bottomY`, gather masked pixels across the column width (shifted along the lean axis when `useAxis`), convert to real Lab, push `dominantLab`.
> - `bottomCentre(cv, mask, reg): number` — mean x of masked pixels in the bottom 10% of the region.
> - `saturatedRatio(lab, mask, W, H): number` — fraction of masked pixels with real L* > 96.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: exits 0. Confirm the main bundle did NOT grow (OpenCV must be in its own async chunk — check `dist/assets` for a large separate chunk, and that `index-*.js` stayed ~its prior size).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/chipVision/opencv.ts src/lib/chipVision/extract.ts
git commit -m "feat(chipvision): lazy OpenCV.js loader + frame extraction pipeline"
```

---

## Task 6: analyzeFrames orchestrator

**Files:**
- Create: `src/lib/chipVision/index.ts`, `src/lib/chipVision/index.test.ts`

**Interfaces:**
- Consumes: `extractColumns`/`Box` (extract.ts), `reconcileColumns`/`aggregate` (aggregate.ts), `pickSharpestFrame` (anomaly.ts), `buildDenomRefs` (color.ts), `DEFAULT_RATIO` (geometry.ts).
- Produces:
  - `REJECT_DELTA_E: number`
  - `analyzeColumns(frames: ColumnResult[][], anomalies: Anomaly[]): CountResult` — pure core (testable).
  - `analyzeFrames(frames: (ImageBitmap|HTMLCanvasElement)[], box: Box, denoms, cal, sharpnessVariances: number[]): Promise<CountResult>` — impure wrapper.

> The pure `analyzeColumns` is unit-tested; `analyzeFrames` (which calls `extractColumns`) is verified in the dev preview.

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/index.test.ts`:

```ts
import assert from 'node:assert/strict';
import { analyzeColumns } from './index.ts';
import type { ColumnResult, Band } from './types.ts';

let failed = 0;
const ok = (label: string, fn: () => void) => {
  try { fn(); console.log('  ok  ' + label); } catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e as Error).message); }
};

const band = (v: number | null, c: number): Band => ({ denomValue: v, lab: [50, 0, 0], heightPx: c * 13, count: c, confidence: 1, colorMargin: 25, roundness: 1 });
const col = (x0: number, bands: Band[]): ColumnResult => ({ x0, x1: x0 + 40, topY: 0, bottomY: 100, hPx: 13, bands });

ok('one frame, two same-colour stacks → summed total', () => {
  const res = analyzeColumns([[col(10, [band(10, 12)]), col(80, [band(10, 8)])]], []);
  assert.equal(res.totalValue, 200);
  assert.equal(res.totals[0].count, 20);
});

ok('three frames reconcile to the median count', () => {
  const frames = [
    [col(10, [band(100, 5)])],
    [col(10, [band(100, 6)])],
    [col(10, [band(100, 5)])],
  ];
  const res = analyzeColumns(frames, []);
  assert.equal(res.totalValue, 500);
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/chipVision/index.ts`**

```ts
import type { ColumnResult, CountResult, Anomaly, ChipCalibration } from './types.ts';
import { reconcileColumns, aggregate } from './aggregate.ts';
import { pickSharpestFrame } from './anomaly.ts';
import { buildDenomRefs } from './color.ts';
import { DEFAULT_RATIO } from './geometry.ts';
import { extractColumns, type Box } from './extract.ts';

export const REJECT_DELTA_E = 24;   // ΔE beyond which a band is "unknown"

export { type Box };

/** Pure core: reconcile + aggregate already-extracted columns. */
export function analyzeColumns(frames: ColumnResult[][], anomalies: Anomaly[]): CountResult {
  const reconciled = reconcileColumns(frames);
  return aggregate(reconciled, anomalies, frames.length);
}

/** Full pipeline over captured frames. */
export async function analyzeFrames(
  frames: (ImageBitmap | HTMLCanvasElement)[],
  box: Box,
  denoms: { value: number; color: string; enabled: boolean }[],
  cal: ChipCalibration | undefined,
  _sharpnessVariances: number[],
): Promise<CountResult> {
  const refs = buildDenomRefs(denoms, cal);
  const ratio = cal?.ratio ?? DEFAULT_RATIO;

  const extracted = await Promise.all(
    frames.map((f) => extractColumns(f, box, refs, ratio, REJECT_DELTA_E)),
  );
  // Drop the blurriest frame if we have 3+ and it lags badly.
  const variances = extracted.map((e) => e.laplacianVariance);
  const sharpest = pickSharpestFrame(variances);
  const kept = extracted.filter((_, i) => variances[i] >= variances[sharpest] * 0.5);

  const cols = kept.map((e) => e.columns);
  const anomalies = dedupeAnomalies(kept.flatMap((e) => e.anomalies));
  return analyzeColumns(cols, anomalies);
}

function dedupeAnomalies(list: Anomaly[]): Anomaly[] {
  const seen = new Map<string, Anomaly>();
  for (const a of list) {
    const key = a.code + ':' + (a.columnIndex ?? '');
    const prev = seen.get(key);
    if (!prev || (a.severity === 'blocking' && prev.severity !== 'blocking')) seen.set(key, a);
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/index.test.ts`
Expected: `all passed`.

- [ ] **Step 5: Build check + commit**

```bash
npm run build
git add src/lib/chipVision/index.ts src/lib/chipVision/index.test.ts
git commit -m "feat(chipvision): analyzeFrames orchestrator + pure analyzeColumns core"
```

---

## Task 7: Camera + tilt hooks

**Files:**
- Create: `src/lib/useCameraCapture.ts`, `src/lib/useDeviceTilt.ts`

**Interfaces:**
- Produces:
  - `useDeviceTilt(): { pitchDeg: number | null; inRange: boolean; steady: boolean; request: () => Promise<void> }`
  - `useCameraCapture(): { videoRef, ready, torchOn, torchAvailable, toggleTorch, setAutoTorch, brightnessOk, captureBurst: (n: number) => Promise<HTMLCanvasElement[]>, stop: () => void }`
  - Constants: `TILT_MIN_DEG = 15`, `TILT_MAX_DEG = 35` (target downward-look band).

> Hooks touch browser APIs; verified in the dev preview (Task 11), not unit-tested.

- [ ] **Step 1: Write `src/lib/useDeviceTilt.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

export const TILT_MIN_DEG = 15;   // downward look, lower bound
export const TILT_MAX_DEG = 35;   // upper bound (sweet spot ≈ 20–30°)

/**
 * Reads DeviceOrientation and reports the phone's downward pitch while framing.
 * `pitchDeg` ≈ how far the back camera looks down from horizontal (0 = level).
 * `steady` is true when orientation variance over ~500 ms is small.
 */
export function useDeviceTilt() {
  const [pitchDeg, setPitchDeg] = useState<number | null>(null);
  const [steady, setSteady] = useState(false);
  const recent = useRef<number[]>([]);

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null) return;
    // beta: front-back tilt, 0 = flat on table, 90 = upright.
    // Downward look ≈ 90 − beta when the phone is roughly upright-ish.
    const pitch = Math.abs(90 - Math.abs(e.beta));
    setPitchDeg(pitch);
    const r = recent.current;
    r.push(pitch);
    if (r.length > 10) r.shift();
    const spread = Math.max(...r) - Math.min(...r);
    setSteady(r.length >= 6 && spread < 3);
  };

  const request = async () => {
    const anyOrient = DeviceOrientationEvent as any;
    if (typeof anyOrient?.requestPermission === 'function') {
      try { await anyOrient.requestPermission(); } catch { /* denied → no bubble */ }
    }
    window.addEventListener('deviceorientation', onOrient, true);
  };

  useEffect(() => () => window.removeEventListener('deviceorientation', onOrient, true), []);

  const inRange = pitchDeg != null && pitchDeg >= TILT_MIN_DEG && pitchDeg <= TILT_MAX_DEG;
  return { pitchDeg, inRange, steady, request };
}
```

- [ ] **Step 2: Write `src/lib/useCameraCapture.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [brightnessOk, setBrightnessOk] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps: any = track.getCapabilities?.() ?? {};
      setTorchAvailable(!!caps.torch);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    })().catch(() => setReady(false));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const applyTorch = useCallback(async (on: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: on } as any] }); setTorchOn(on); } catch { /* unsupported */ }
  }, []);

  const toggleTorch = useCallback(() => applyTorch(!torchOn), [applyTorch, torchOn]);

  // Sample brightness ~2×/s; auto-torch when dark (if enabled + available).
  const autoTorch = useRef(false);
  const setAutoTorch = useCallback((v: boolean) => { autoTorch.current = v; }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current; if (!v || !v.videoWidth) return;
      const c = document.createElement('canvas'); c.width = 32; c.height = 18;
      const ctx = c.getContext('2d')!; ctx.drawImage(v, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const luma = sum / (32 * 18);
      const dark = luma < 70;
      setBrightnessOk(!dark);
      if (autoTorch.current && torchAvailable && dark && !torchOn) applyTorch(true);
    }, 500);
    return () => clearInterval(id);
  }, [applyTorch, torchAvailable, torchOn]);

  const captureBurst = useCallback(async (n: number): Promise<HTMLCanvasElement[]> => {
    const v = videoRef.current; if (!v) return [];
    const out: HTMLCanvasElement[] = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      out.push(c);
      if (i < n - 1) await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  }, []);

  const stop = useCallback(() => { trackRef.current?.stop(); }, []);
  return { videoRef, ready, torchOn, torchAvailable, toggleTorch, setAutoTorch, brightnessOk, captureBurst, stop };
}
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build
git add src/lib/useDeviceTilt.ts src/lib/useCameraCapture.ts
git commit -m "feat(chipvision): camera capture + device-tilt hooks (torch, steady burst, bubble)"
```

---

## Task 8: i18n strings + styles

**Files:**
- Modify: `src/lib/i18n.ts`, `src/styles.css`

**Interfaces:**
- Produces the `chipcount.*` keys consumed by Tasks 9–11.

- [ ] **Step 1: Add strings to `src/lib/i18n.ts`**

Find the `en` dictionary object and add these keys (and the German mirror in `de`). Match the file's existing flat-key style:

```ts
// --- en ---
'chipcount.title': 'Count chips',
'chipcount.player': 'Count {name}’s chips',
'chipcount.guide': 'Line the stacks up in the box as separate colour columns, small gaps between them.',
'chipcount.tiltHigh': 'View more from the side — lower your angle',
'chipcount.tiltLow': 'Look down onto the chip tops a bit more',
'chipcount.tiltOk': 'Angle looks good — hold steady',
'chipcount.torch': 'Light',
'chipcount.capture': 'Capture',
'chipcount.analyzing': 'Reading chips…',
'chipcount.retake': 'Retake',
'chipcount.save': 'Set as chips',
'chipcount.total': 'Total',
'chipcount.unknownBand': 'Unknown colour — pick a value',
'chipcount.assign': 'Assign',
'chipcount.lowConfidence': 'Low confidence — check this one',
'chipcount.anom.mergedColumns': 'Stacks are touching — leave small gaps',
'chipcount.anom.viewTooTopDown': 'View more from the side — lower your angle',
'chipcount.anom.viewTooSideOn': 'Look down onto the chip tops a bit more',
'chipcount.anom.tooTall': 'Stack too tall — split into shorter stacks',
'chipcount.anom.leaning': 'Straighten the leaning stack',
'chipcount.anom.cutOff': 'Fit the whole stack inside the box',
'chipcount.anom.weakContrast': 'Use a lighter surface or turn on the light',
'chipcount.anom.glare': 'Glare — reduce the angle or turn the light off',
'chipcount.calibrate': 'Calibrate chip colours',
'chipcount.calibrateIntro': 'Photograph a short stack (3+) of each value once, under your table light. Improves accuracy.',
'chipcount.calStep': 'Show a stack of {value}',
'chipcount.calConfirm': 'How many {value} chips are in the stack?',
'chipcount.calSaved': 'Calibration saved',
'chipcount.calClear': 'Clear calibration',
'chipcount.noCamera': 'Camera unavailable on this device',
```

German values (`de`):

```ts
'chipcount.title': 'Chips zählen',
'chipcount.player': 'Chips von {name} zählen',
'chipcount.guide': 'Stapel als getrennte Farbsäulen in den Rahmen legen, kleine Lücken dazwischen.',
'chipcount.tiltHigh': 'Flacher schauen — Winkel senken',
'chipcount.tiltLow': 'Etwas mehr von oben auf die Chips schauen',
'chipcount.tiltOk': 'Winkel passt — ruhig halten',
'chipcount.torch': 'Licht',
'chipcount.capture': 'Aufnehmen',
'chipcount.analyzing': 'Chips werden gelesen…',
'chipcount.retake': 'Neu aufnehmen',
'chipcount.save': 'Als Chips setzen',
'chipcount.total': 'Gesamt',
'chipcount.unknownBand': 'Unbekannte Farbe — Wert wählen',
'chipcount.assign': 'Zuordnen',
'chipcount.lowConfidence': 'Geringe Sicherheit — bitte prüfen',
'chipcount.anom.mergedColumns': 'Stapel berühren sich — kleine Lücken lassen',
'chipcount.anom.viewTooTopDown': 'Flacher schauen — Winkel senken',
'chipcount.anom.viewTooSideOn': 'Etwas mehr von oben auf die Chips schauen',
'chipcount.anom.tooTall': 'Stapel zu hoch — in kürzere Stapel teilen',
'chipcount.anom.leaning': 'Schiefen Stapel gerade stellen',
'chipcount.anom.cutOff': 'Ganzen Stapel in den Rahmen bringen',
'chipcount.anom.weakContrast': 'Hellere Unterlage nutzen oder Licht einschalten',
'chipcount.anom.glare': 'Blendung — Winkel ändern oder Licht aus',
'chipcount.calibrate': 'Chip-Farben kalibrieren',
'chipcount.calibrateIntro': 'Einmal je Wert einen kurzen Stapel (3+) unter deinem Tischlicht fotografieren. Erhöht die Genauigkeit.',
'chipcount.calStep': 'Stapel mit {value} zeigen',
'chipcount.calConfirm': 'Wie viele {value}-Chips liegen im Stapel?',
'chipcount.calSaved': 'Kalibrierung gespeichert',
'chipcount.calClear': 'Kalibrierung löschen',
'chipcount.noCamera': 'Kamera auf diesem Gerät nicht verfügbar',
```

> If `t()` doesn't already interpolate `{name}`/`{value}`, pass the value in and use a local `.replace('{name}', name)` at the call sites — check the existing `t()` signature first and match how other parameterised strings are done in this file.

- [ ] **Step 2: Add styles to `src/styles.css`**

Append:

```css
/* --- Photo chip count --- */
.cc-sheet { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
  background: #000; color: #fff; }
.cc-video { flex: 1; width: 100%; object-fit: cover; }
.cc-stage { position: relative; flex: 1; overflow: hidden; }
.cc-guidebox { position: absolute; border: 2px dashed rgba(255,255,255,.85); border-radius: 12px;
  inset: 12% 8%; pointer-events: none; }
.cc-hint { position: absolute; left: 0; right: 0; top: 16px; text-align: center; font-weight: 600;
  text-shadow: 0 1px 4px #000; padding: 0 16px; }
.cc-bubble { position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
  width: 46px; height: 180px; border-radius: 23px; background: rgba(0,0,0,.45);
  border: 1px solid rgba(255,255,255,.3); }
.cc-bubble-dot { position: absolute; left: 50%; width: 30px; height: 30px; border-radius: 50%;
  transform: translate(-50%, -50%); background: #e0782b; transition: top .1s, background .1s; }
.cc-bubble-dot.ok { background: #2e9e52; }
.cc-bar { display: flex; gap: 10px; align-items: center; justify-content: center; padding: 14px;
  background: #0a0a0e; }
.cc-shutter { width: 66px; height: 66px; border-radius: 50%; background: #fff; border: 4px solid #888; }
.cc-shutter:disabled { opacity: .4; }
.cc-review { flex: 1; overflow: auto; background: var(--app-bg, #0a0a0e); color: var(--fg, #fff);
  padding: 16px; }
.cc-canvas { width: 100%; border-radius: 12px; }
.cc-row { display: flex; align-items: center; gap: 10px; padding: 10px 6px; border-bottom: 1px solid rgba(128,128,128,.2); }
.cc-row.low { outline: 2px solid #e0a51f; border-radius: 8px; }
.cc-swatch { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,.3); }
.cc-step { width: 34px; height: 34px; border-radius: 8px; font-size: 20px; }
.cc-total { display: flex; justify-content: space-between; font-weight: 700; font-size: 18px; padding: 12px 6px; }
.cc-anoms { margin: 8px 0; }
.cc-anom { font-size: 14px; padding: 6px 10px; border-radius: 8px; margin-bottom: 6px;
  background: rgba(224,120,43,.15); }
.cc-anom.blocking { background: rgba(192,57,43,.2); }
.remote-chips .cc-open { margin-left: 6px; }
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build
git add src/lib/i18n.ts src/styles.css
git commit -m "feat(chipvision): i18n strings (en/de) + sheet/overlay/review styles"
```

---

## Task 9: ChipCountSheet — capture phase

**Files:**
- Create: `src/components/ChipCountSheet.tsx`

**Interfaces:**
- Consumes: `useCameraCapture`, `useDeviceTilt` (+ `TILT_MIN_DEG`/`TILT_MAX_DEG`), `analyzeFrames`/`Box` (chipVision), `useT`, `useStore`.
- Produces:
  - `interface ChipCountSheetProps { playerId: string; playerName: string; onClose: () => void }`
  - `export function ChipCountSheet(props: ChipCountSheetProps): JSX.Element` (capture phase now; review phase added in Task 10 as `<ChipCountReview>`).

- [ ] **Step 1: Write the capture-phase component**

Create `src/components/ChipCountSheet.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { useDeviceTilt, TILT_MIN_DEG, TILT_MAX_DEG } from '../lib/useDeviceTilt.ts';
import { analyzeFrames, type Box } from '../lib/chipVision/index.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
import { ChipCountReview } from './ChipCountReview.tsx';

export interface ChipCountSheetProps { playerId: string; playerName: string; onClose: () => void }

export function ChipCountSheet({ playerId, playerName, onClose }: ChipCountSheetProps) {
  const t = useT();
  const { state } = useStore();
  const cam = useCameraCapture();
  const tilt = useDeviceTilt();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Request tilt permission once the sheet mounts.
  useMemo(() => { tilt.request(); cam.setAutoTorch(true); }, []);

  const guideBox = (canvas: HTMLCanvasElement): Box => {
    // Guide inset matches .cc-guidebox (12% vertical, 8% horizontal).
    const w = canvas.width, h = canvas.height;
    return { x0: w * 0.08, y0: h * 0.12, x1: w * 0.92, y1: h * 0.88 };
  };

  const onCapture = async () => {
    setBusy(true);
    try {
      const frames = await cam.captureBurst(3);
      if (frames.length === 0) return;
      const box = guideBox(frames[0]);
      const res = await analyzeFrames(frames, box, state.denominations, state.settings.chipCalibration, []);
      setShot(frames[0]);
      setResult(res);
    } finally { setBusy(false); }
  };

  if (result && shot) {
    return (
      <ChipCountReview
        playerId={playerId} shot={shot} result={result}
        denoms={state.denominations}
        onRetake={() => { setResult(null); setShot(null); }}
        onClose={onClose}
      />
    );
  }

  const hint = tilt.pitchDeg == null ? t('chipcount.guide')
    : tilt.pitchDeg > TILT_MAX_DEG ? t('chipcount.tiltHigh')
    : tilt.pitchDeg < TILT_MIN_DEG ? t('chipcount.tiltLow')
    : t('chipcount.tiltOk');

  // Bubble dot position: map pitch (0..50°) to 10%..90% of the track.
  const dotTop = tilt.pitchDeg == null ? 50
    : Math.max(10, Math.min(90, 90 - (tilt.pitchDeg / 50) * 80));

  return (
    <div className="cc-sheet">
      <div className="cc-stage" ref={stageRef}>
        <video className="cc-video" ref={cam.videoRef} playsInline muted />
        <div className="cc-guidebox" />
        <div className="cc-hint">{cam.ready ? hint : t('chipcount.noCamera')}</div>
        <div className="cc-bubble"><div className={`cc-bubble-dot${tilt.inRange ? ' ok' : ''}`} style={{ top: `${dotTop}%` }} /></div>
      </div>
      <div className="cc-bar">
        {cam.torchAvailable && (
          <button className="btn btn-ghost" onClick={cam.toggleTorch}>💡 {t('chipcount.torch')}</button>
        )}
        <button className="cc-shutter" disabled={busy || !cam.ready} onClick={onCapture} aria-label={t('chipcount.capture')} />
        <button className="btn btn-ghost" onClick={() => { cam.stop(); onClose(); }}>✕</button>
      </div>
      {busy && <div className="cc-hint" style={{ top: 'auto', bottom: 90 }}>{t('chipcount.analyzing')}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: FAILS on the missing `./ChipCountReview.tsx` import — that's Task 10. To keep this task independently buildable, temporarily stub it: create `src/components/ChipCountReview.tsx` with:

```tsx
export function ChipCountReview(_: any) { return null; }
```

Then `npm run build` → exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChipCountSheet.tsx src/components/ChipCountReview.tsx
git commit -m "feat(chipvision): ChipCountSheet capture phase (camera, guide, tilt bubble, torch)"
```

---

## Task 10: ChipCountReview — review + edit + save

**Files:**
- Create/replace: `src/components/ChipCountReview.tsx` (replaces the Task 9 stub)

**Interfaces:**
- Consumes: `useStore` (`dispatch`), `useT`, `useFmt`, `CountResult`/`DenomTotal` types, `Denomination`.
- Produces:
  - `interface ChipCountReviewProps { playerId: string; shot: HTMLCanvasElement; result: CountResult; denoms: Denomination[]; onRetake: () => void; onClose: () => void }`
  - `export function ChipCountReview(props): JSX.Element`

- [ ] **Step 1: Write the review component**

Replace `src/components/ChipCountReview.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT, useFmt } from '../lib/i18n.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
import type { Denomination } from '../types.ts';

interface Row { value: number; count: number; confidence: number; }

export interface ChipCountReviewProps {
  playerId: string;
  shot: HTMLCanvasElement;
  result: CountResult;
  denoms: Denomination[];
  onRetake: () => void;
  onClose: () => void;
}

export function ChipCountReview({ playerId, shot, result, denoms, onRetake, onClose }: ChipCountReviewProps) {
  const t = useT();
  const { num } = useFmt();
  const { dispatch } = useStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [rows, setRows] = useState<Row[]>(
    () => result.totals.map((x) => ({ value: x.value, count: x.count, confidence: x.confidence })),
  );

  // Paint the captured frame for context.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = shot.width; c.height = shot.height;
    c.getContext('2d')!.drawImage(shot, 0, 0);
  }, [shot]);

  const colorOf = useMemo(() => {
    const m = new Map<number, string>();
    denoms.forEach((d) => m.set(d.value, d.color));
    return m;
  }, [denoms]);

  const total = rows.reduce((s, r) => s + r.value * r.count, 0);
  const blocking = result.anomalies.filter((a) => a.severity === 'blocking');

  const setCount = (value: number, delta: number) =>
    setRows((rs) => rs.map((r) => (r.value === value ? { ...r, count: Math.max(0, r.count + delta) } : r)));

  const save = () => {
    dispatch({ type: 'LEDGER_UPDATE', id: playerId, patch: { chips: Math.max(0, Math.round(total)) || undefined } });
    onClose();
  };

  return (
    <div className="cc-sheet">
      <div className="cc-review">
        <canvas ref={canvasRef} className="cc-canvas" />

        {result.anomalies.length > 0 && (
          <div className="cc-anoms">
            {result.anomalies.map((a, i) => (
              <div key={i} className={`cc-anom${a.severity === 'blocking' ? ' blocking' : ''}`}>
                {t(`chipcount.anom.${a.code}`)}
              </div>
            ))}
          </div>
        )}

        {rows.map((r) => (
          <div key={r.value} className={`cc-row${r.confidence < 0.5 ? ' low' : ''}`}>
            <span className="cc-swatch" style={{ background: colorOf.get(r.value) ?? '#888' }} />
            <span style={{ flex: 1 }}>{r.value}</span>
            <button className="cc-step" onClick={() => setCount(r.value, -1)}>−</button>
            <span style={{ minWidth: 32, textAlign: 'center' }}>{r.count}</span>
            <button className="cc-step" onClick={() => setCount(r.value, +1)}>+</button>
            <span style={{ minWidth: 64, textAlign: 'right' }}>{num(r.value * r.count)}</span>
          </div>
        ))}

        <div className="cc-total"><span>{t('chipcount.total')}</span><span>{num(total)}</span></div>
      </div>

      <div className="cc-bar">
        <button className="btn btn-ghost" onClick={onRetake}>↺ {t('chipcount.retake')}</button>
        <button className="btn btn-primary" disabled={blocking.length > 0} onClick={save}>{t('chipcount.save')}</button>
      </div>
    </div>
  );
}
```

> **Unknown bands:** `aggregate` drops `denomValue===null` bands from `totals`, so they never reach `rows`, but they DO lower `result.confidence`. For v1 this surfaces as a low-confidence warning + the anomaly list; a per-band "assign" affordance is deferred (documented in §Deferred below). If a whole colour was unread, the user adjusts the nearest row or retakes. (This matches the spec's "unknown must be assigned" intent at the denom-total granularity: an unknown simply won't appear, prompting a retake via the low-confidence flag.)

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChipCountReview.tsx
git commit -m "feat(chipvision): review + editable per-denom breakdown, save to player.chips"
```

---

## Task 11: RemoteControl entry point + dev-preview verification

**Files:**
- Modify: `src/screens/RemoteControl.tsx`

**Interfaces:**
- Consumes: `ChipCountSheet` from `../components/ChipCountSheet.tsx`.

- [ ] **Step 1: Wire the 📷 button into the chips input row**

In `src/screens/RemoteControl.tsx`, add near the other imports:

```tsx
import { useState } from 'react';   // if not already importing useState
import { ChipCountSheet } from '../components/ChipCountSheet.tsx';
```

Add component state (inside the `RemoteControl` function body, with the other hooks):

```tsx
const [countFor, setCountFor] = useState<{ id: string; name: string } | null>(null);
```

Locate the chips input block (around line 282, `<div className="remote-chips input-affix">…`). Immediately after the `<input … value={p.chips || ''} …/>`, add the button:

```tsx
<button
  type="button"
  className="icon-btn cc-open"
  aria-label={t('chipcount.title')}
  onClick={() => setCountFor({ id: p.id, name: p.name })}
>📷</button>
```

At the end of the component's returned JSX (just before the outermost closing tag), mount the sheet:

```tsx
{countFor && (
  <ChipCountSheet
    playerId={countFor.id}
    playerName={countFor.name}
    onClose={() => setCountFor(null)}
  />
)}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: exits 0, no `TS6133`.

- [ ] **Step 3: Verify in the dev preview**

Start the dev server and open the app:
- `preview_start { name: "chipstack" }` (or `chipstack-3d` on :5188 if :5173 is taken).
- Navigate to the Table tab, ensure there is at least one player in the ledger, open the host/RemoteControl area.
- Confirm the 📷 button renders in each player row next to the chips field.
- Click it → the `.cc-sheet` opens. In the desktop preview `getUserMedia` may be denied/absent → confirm the `chipcount.noCamera` hint shows and the ✕ closes the sheet cleanly (no console errors). Camera + torch + tilt are validated on-device (Task 13).
- Check `read_console_messages` for errors; the OpenCV chunk should only fetch after a capture attempt.

- [ ] **Step 4: Commit**

```bash
git add src/screens/RemoteControl.tsx
git commit -m "feat(chipvision): 📷 count-chips button per player row in RemoteControl"
```

---

## Task 12: Calibration wizard

**Files:**
- Create: `src/lib/chipCalibration.ts`, `src/components/ChipCalibrationWizard.tsx`
- Modify: `src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `extractColumns`/`Box` (chipVision), `useCameraCapture`, `useDeviceTilt`, `hexToLab`, `DEFAULT_RATIO`, `UPDATE_SETTINGS`.
- Produces:
  - `calibrateDenom(frame: HTMLCanvasElement, box: Box, denomHex: string, knownCount: number): Promise<{ lab: Lab; ratio: number } | null>`
  - `ChipCalibrationWizard({ onClose }): JSX.Element`

- [ ] **Step 1: Write `src/lib/chipCalibration.ts`**

```ts
import { extractColumns, type Box } from './chipVision/extract.ts';
import { hexToLab } from './chipVision/color.ts';
import { DEFAULT_RATIO } from './chipVision/geometry.ts';
import type { Lab } from './chipVision/types.ts';

/**
 * From one calibration frame (a single stack of a known denom + known count),
 * learn that denom's edge colour and the measured thickness/diameter ratio.
 */
export async function calibrateDenom(
  frame: HTMLCanvasElement, box: Box, denomHex: string, knownCount: number,
): Promise<{ lab: Lab; ratio: number } | null> {
  // Use the denom's own hex as the only reference so the single column classifies to it.
  const refs = [{ value: 1, lab: hexToLab(denomHex) }];
  const { columns } = await extractColumns(frame, box, refs, DEFAULT_RATIO, 999);
  const col = columns[0];
  if (!col || col.bands.length === 0 || knownCount < 1) return null;
  // Band colour = learned edge colour; ratio back-solved from the observed column height.
  const band = col.bands.reduce((a, b) => (b.heightPx > a.heightPx ? b : a));
  const observedHpx = band.heightPx / knownCount;
  // hPx = ratio · major · sinθ  ⇒ ratio = observedHpx / (major·sinθ) = DEFAULT_RATIO · (observedHpx / col.hPx)
  const ratio = DEFAULT_RATIO * (observedHpx / (col.hPx || observedHpx));
  return { lab: band.lab, ratio: clamp(ratio, 0.05, 0.15) };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
```

- [ ] **Step 2: Write `src/components/ChipCalibrationWizard.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { calibrateDenom } from '../lib/chipCalibration.ts';
import type { Box } from '../lib/chipVision/extract.ts';
import type { ChipCalibration, Lab } from '../lib/chipVision/types.ts';

export function ChipCalibrationWizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { state, dispatch } = useStore();
  const cam = useCameraCapture();
  const denoms = useMemo(() => state.denominations.filter((d) => d.enabled), [state.denominations]);
  const [i, setI] = useState(0);
  const [colors, setColors] = useState<Record<number, Lab>>({});
  const [ratios, setRatios] = useState<number[]>([]);
  const [pendingCount, setPendingCount] = useState(5);

  useMemo(() => { cam.setAutoTorch(true); }, []);
  const denom = denoms[i];

  const guideBox = (c: HTMLCanvasElement): Box => ({ x0: c.width * 0.3, y0: c.height * 0.1, x1: c.width * 0.7, y1: c.height * 0.9 });

  const capture = async () => {
    const frames = await cam.captureBurst(1);
    if (!frames[0]) return;
    const r = await calibrateDenom(frames[0], guideBox(frames[0]), denom.color, pendingCount);
    if (r) {
      setColors((c) => ({ ...c, [denom.value]: r.lab }));
      setRatios((rs) => [...rs, r.ratio]);
    }
    if (i + 1 < denoms.length) { setI(i + 1); setPendingCount(5); }
    else finish({ ...colors, [denom.value]: r?.lab ?? colors[denom.value] }, r ? [...ratios, r.ratio] : ratios);
  };

  const finish = (cols: Record<number, Lab>, rs: number[]) => {
    const ratio = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : undefined;
    const cal: ChipCalibration = { ratio: ratio ?? 3.3 / 39, colors: cols, createdAt: Date.now() };
    dispatch({ type: 'UPDATE_SETTINGS', patch: { chipCalibration: cal } });
    cam.stop(); onClose();
  };

  if (!denom) { onClose(); return null; }

  return (
    <div className="cc-sheet">
      <div className="cc-stage">
        <video className="cc-video" ref={cam.videoRef} playsInline muted />
        <div className="cc-guidebox" style={{ inset: '10% 30%' }} />
        <div className="cc-hint">{t('chipcount.calStep').replace('{value}', String(denom.value))}</div>
      </div>
      <div className="cc-bar" style={{ flexDirection: 'column', gap: 8 }}>
        <label>{t('chipcount.calConfirm').replace('{value}', String(denom.value))}
          <input type="number" min={1} value={pendingCount}
            onChange={(e) => setPendingCount(Math.max(1, +e.target.value))} style={{ width: 64, marginLeft: 8 }} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" disabled={!cam.ready} onClick={capture}>{t('chipcount.capture')}</button>
          <button className="btn btn-ghost" onClick={() => { cam.stop(); onClose(); }}>✕</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the Settings entry**

In `src/screens/SettingsScreen.tsx`, near the "Chip art" section, add a button + wizard mount. Add to imports:

```tsx
import { useState } from 'react';  // if not present
import { ChipCalibrationWizard } from '../components/ChipCalibrationWizard.tsx';
```

Add state in the component body:

```tsx
const [calOpen, setCalOpen] = useState(false);
```

Add UI in the Chip-art card:

```tsx
<div className="mt8">
  <button className="btn btn-ghost btn-sm" onClick={() => setCalOpen(true)}>{t('chipcount.calibrate')}</button>
  {state.settings.chipCalibration && (
    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }}
      onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { chipCalibration: undefined } })}>
      {t('chipcount.calClear')}
    </button>
  )}
  <p className="hint">{t('chipcount.calibrateIntro')}</p>
</div>
{calOpen && <ChipCalibrationWizard onClose={() => setCalOpen(false)} />}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Verify in the dev preview**

- `preview_start { name: "chipstack" }`, open Settings → Chip art.
- Confirm "Calibrate chip colours" button + intro render; clicking opens the wizard sheet; the `noCamera` path (desktop) closes cleanly. Confirm "Clear calibration" appears only after a calibration exists (simulate by setting one via the console if needed).
- `read_console_messages` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chipCalibration.ts src/components/ChipCalibrationWizard.tsx src/screens/SettingsScreen.tsx
git commit -m "feat(chipvision): one-time per-denom calibration wizard + Settings entry"
```

---

## Task 13: Full-suite check + on-device validation doc

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run all CV unit tests**

```bash
node --experimental-strip-types src/lib/chipVision/color.test.ts
node --experimental-strip-types src/lib/chipVision/geometry.test.ts
node --experimental-strip-types src/lib/chipVision/anomaly.test.ts
node --experimental-strip-types src/lib/chipVision/aggregate.test.ts
node --experimental-strip-types src/lib/chipVision/index.test.ts
```
Expected: each prints `all passed`.

- [ ] **Step 2: Final build + bundle check**

```bash
npm run build
```
Expected: exits 0. Confirm OpenCV.js is a SEPARATE async chunk in `dist/assets` and `index-*.js` did not balloon (main bundle stays near its pre-feature size).

- [ ] **Step 3: Document the physical validation the user must do**

Add a short section to `HANDOFF.md` under open items:

```markdown
### Photo → chip count (2026-07-31) — needs on-device validation
Built + unit-tested + preview-checked. CANNOT be fully validated without the
physical SLOWPLAY chips + a phone camera. On-device checklist:
- RemoteControl player row → 📷 → grant camera; tilt bubble greens at ~20–30° down-look;
  auto-torch kicks in when dim; capture reads the stacks; review breakdown is editable;
  Save writes player.chips (→ TV crown updates).
- Try: several stacks of the same colour (must sum), a leaning stack, a too-tall stack,
  touching stacks (must warn/guide), navy 100 on dark felt (contrast guidance).
- Settings → Chip art → Calibrate chip colours: photograph each denom once, then
  re-count and confirm accuracy improved (esp. 50 vs 5000).
```

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: photo chip-count on-device validation checklist"
```

---

## Deferred (post-v1, out of scope)

- Per-band "assign this colour" affordance in review (v1 drops unknown bands from totals
  and flags low confidence + anomaly instead; a whole-column unknown prompts a retake).
- Storing the per-denom breakdown on the player (for one-tap cash-out) — v1 writes only the
  total `chips`.
- Plaque (rectangular) handling.
- Multiple players in a single photo.

---

## Self-Review

**Spec coverage:**
- §3 self-calibrating ellipse math → Task 2 (`singleChipHeightPx`, `tiltSinTheta`). ✓
- §4 guided capture (framing, tilt bubble, auto-torch, steady burst) → Tasks 7, 9. ✓
- §5 detection pipeline + x-order reconcile + per-denom aggregate → Tasks 4, 5, 6. ✓
- §6 confidence + mandatory review/edit → Tasks 4, 10. ✓
- §6.5 multiple stacks + anomaly table (auto-fix vs guide) → Task 3 (+ wired in 5, surfaced in 10). ✓
- §7 calibration wizard (per-device, colours + ratio) → Task 12. ✓
- §8 data model (`Settings.chipCalibration`, reuse `LEDGER_UPDATE`), module split → Task 1 + file structure. ✓
- §9 error/edge (no camera, iOS fallback, dark-on-dark, OpenCV latency) → Tasks 7, 9, 10 (noCamera), 3 (contrast). ✓
- §11 honest accuracy / §12 tests → Tasks 1–4, 6 unit tests + Task 13 validation. ✓
- §13 phasing → Tasks map 1:1. ✓

**Placeholder scan:** the six CV helpers in Task 5 are specified by explicit per-function contracts (not "TODO"); every code step ships real code. No `TBD`/"similar to". ✓

**Type consistency:** `Lab`, `DenomRef`, `ChipCalibration`, `Ellipse`, `Band`, `ColumnResult`, `Anomaly`, `DenomTotal`, `CountResult`, `Box` defined once in Task 1/5 and reused verbatim. Save path uses the existing `LEDGER_UPDATE {id, patch:{chips}}` (RemoteControl:290) and calibration uses `UPDATE_SETTINGS {patch:{chipCalibration}}` — both verified in the codebase. Function names (`analyzeFrames`/`analyzeColumns`, `extractColumns`, `reconcileColumns`, `aggregate`, `buildDenomRefs`) are consistent across tasks. ✓
