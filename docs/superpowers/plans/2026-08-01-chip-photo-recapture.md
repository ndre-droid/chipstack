# Chip Photo Recapture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the photo chip-count capture into auto-capture + adaptive second angle + on-device seam-line correction, without inflating API cost.

**Architecture:** Split the pure counting logic (vote/geometry fusion, seam-line geometry, frame-content score) out of the DOM/network engine into focused, node-testable modules. The Gemini engine is reused as-is; a second angle re-reads only the flagged stacks and folds its votes into the existing fusion. A new editor lets the user fix a flagged stack by editing evenly-spaced seam lines (chips are uniform), costing zero API calls.

**Tech Stack:** Vite + React + TypeScript, Capacitor (Android). Google Gemini vision via direct browser fetch with the user's own key. Tests: `node --experimental-strip-types` with assertion helpers (imports use `.ts` extensions).

## Global Constraints

- **Model is AUTO-DISCOVERED, never hardcoded** — keep `resolveModel`/`FALLBACK_MODEL`; do not reintroduce a hardcoded Gemini id.
- **On-device only** — captured frames, crops, and all `HTMLCanvasElement`s never leave the phone except the JPEG image bytes already sent to Gemini. The new `crop`/`span`/`box`/`votes` fields on `StackResult` are on-device only.
- **Cost guardrail** — easy photo ≈ 3 calls (`SAMPLES` = 2), hard photo adds one detection + `SAMPLES` reads for the flagged subset only. Do not raise `SAMPLES` or re-read confident stacks.
- **Pure modules stay DOM-free** — `seams.ts`, `fuse.ts`, `frame.ts` must not reference `document`/`window`/canvas at module load or in exported pure fns, so `node --experimental-strip-types` can import them.
- **Save contract unchanged** — the review still writes the summed chip total to `LedgerPlayer.chips` via `dispatch({ type: 'LEDGER_UPDATE', id, patch: { chips } })`.
- **Confidence flag threshold = 0.85** — a stack is "flagged" when `confidence < 0.85` (matches `ChipCountReview`).
- **Tests run directly:** `node --experimental-strip-types <file>` (no `npm test` script exists). Typecheck with `npx tsc -b`. Build with `npm run build`.

---

### Task 1: `seamLines` seam-geometry helper

**Files:**
- Create: `src/lib/chipVision/seams.ts`
- Test: `src/lib/chipVision/seams.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `seamLines(span: [number, number], count: number): number[]` — returns the `count - 1` interior seam y-positions that evenly divide `span = [yTop, yBottom]`. `count <= 1` → `[]`. Used by the seam editor (Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/seams.test.ts`:

```ts
import { seamLines } from './seams.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`FAIL ${label}: got ${g}, want ${w}`); }
  else console.log(`ok   ${label}`);
}
function approx(label: string, got: number[], want: number[]) {
  const ok = got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) < 1e-9);
  if (!ok) { failures++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
}

eq('count 1 -> no interior lines', seamLines([0, 1], 1), []);
eq('count 0 -> no lines', seamLines([0, 1], 0), []);
approx('count 2 -> midpoint', seamLines([0, 1], 2), [0.5]);
approx('count 4 even', seamLines([0, 1], 4), [0.25, 0.5, 0.75]);
approx('offset span', seamLines([0.2, 0.6], 2), [0.4]);
approx('count 3 within [0.1,0.7]', seamLines([0.1, 0.7], 3), [0.3, 0.5]);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/seams.test.ts`
Expected: FAIL — `Cannot find module './seams.ts'` (or "seamLines is not a function").

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chipVision/seams.ts`:

```ts
/**
 * Interior seam positions for a stack of identical chips. The chips are uniform
 * (same SLOWPLAY ceramic), so seams are evenly spaced: divide the stack span
 * [yTop, yBottom] into `count` equal chips and return the count-1 boundaries.
 * count <= 1 yields no interior seams.
 */
export function seamLines(span: [number, number], count: number): number[] {
  if (!Number.isFinite(count) || count <= 1) return [];
  const [top, bottom] = span;
  const step = (bottom - top) / count;
  const out: number[] = [];
  for (let i = 1; i < count; i++) out.push(top + step * i);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/seams.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chipVision/seams.ts src/lib/chipVision/seams.test.ts
git commit -m "feat(chipvision): seamLines helper for even seam spacing"
```

---

### Task 2: Extract pure fusion into `fuse.ts` (parity-preserving)

**Files:**
- Create: `src/lib/chipVision/fuse.ts`
- Test: `src/lib/chipVision/fuse.test.ts`
- Modify: `src/lib/chipVision/visionCount.ts` (replace inline `tally`, `median`, and the per-stack fusion block with imports from `fuse.ts`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SeamVote { count: number; agreement: number }`
  - `tally(counts: number[]): SeamVote`
  - `median(xs: number[]): number | null`
  - `interface StackFuseInput { seam: SeamVote; geo: number | null; dsp: { count: number; strength: number } | null }`
  - `fuseStack(inp: StackFuseInput): { count: number; confidence: number }` — the exact current fusion rules.
  - `mergeAngles(a: { votes: number[]; ratios: number[] }, b: { votes: number[]; ratios: number[] }): { votes: number[]; ratios: number[] }`
  - `flaggedStackIds(stacks: { id: string; confidence: number }[], threshold?: number): string[]`
  - `matchStacks(prior: { id: string; value: number; box: [number, number, number, number] }[], fresh: { value: number; box: [number, number, number, number] }[]): Map<string, [number, number, number, number]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/fuse.test.ts`:

```ts
import { tally, median, fuseStack, mergeAngles, flaggedStackIds, matchStacks } from './fuse.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`FAIL ${label}: got ${g}, want ${w}`); }
  else console.log(`ok   ${label}`);
}

// tally: majority, ties toward smaller
eq('tally majority', tally([3, 4, 4]), { count: 4, agreement: 2 / 3 });
eq('tally tie -> smaller', tally([2, 3]), { count: 2, agreement: 0.5 });
eq('median odd', median([3, 1, 2]), 2);
eq('median even', median([1, 2, 3, 4]), 2.5);
eq('median empty', median([]), null);

// fuseStack parity with the current inline rules
eq('agree short -> 0.9', fuseStack({ seam: { count: 3, agreement: 1 }, geo: 3, dsp: null }), { count: 3, confidence: 0.9 });
eq('agree tall no dsp -> 0.8', fuseStack({ seam: { count: 9, agreement: 1 }, geo: 9, dsp: null }), { count: 9, confidence: 0.8 });
eq('agree tall dsp-backed -> 0.95', fuseStack({ seam: { count: 9, agreement: 1 }, geo: 9, dsp: { count: 9, strength: 0.5 } }), { count: 9, confidence: 0.95 });
eq('off-by-one confident -> seam 0.6', fuseStack({ seam: { count: 5, agreement: 0.9 }, geo: 6, dsp: null }), { count: 5, confidence: 0.6 });
eq('off-by-one dsp picks geo -> 0.6', fuseStack({ seam: { count: 5, agreement: 0.9 }, geo: 6, dsp: { count: 6, strength: 0.5 } }), { count: 6, confidence: 0.6 });
eq('geometry only -> 0.55', fuseStack({ seam: { count: 0, agreement: 0 }, geo: 7, dsp: null }), { count: 7, confidence: 0.55 });
eq('seam only no geo -> agreement', fuseStack({ seam: { count: 4, agreement: 0.8 }, geo: null, dsp: null }), { count: 4, confidence: 0.8 });
eq('seam only dsp-confirmed -> 0.9', fuseStack({ seam: { count: 4, agreement: 0.5 }, geo: null, dsp: { count: 4, strength: 0.5 } }), { count: 4, confidence: 0.9 });
eq('real disagree dsp abstain -> 0.5', fuseStack({ seam: { count: 3, agreement: 0.6 }, geo: 8, dsp: null }), { count: 8, confidence: 0.5 });

// mergeAngles: a second, steeper angle that splits a merged seam wins the vote
eq('mergeAngles merged-seam win', tally(mergeAngles({ votes: [3, 3], ratios: [] }, { votes: [4, 4, 4], ratios: [] }).votes), { count: 4, agreement: 3 / 5 });
eq('mergeAngles concat ratios', mergeAngles({ votes: [], ratios: [0.3] }, { votes: [], ratios: [0.4, 0.5] }).ratios, [0.3, 0.4, 0.5]);

// flaggedStackIds: below threshold
eq('flagged below 0.85', flaggedStackIds([{ id: 'a', confidence: 0.9 }, { id: 'b', confidence: 0.5 }]), ['b']);

// matchStacks: same denom, nearest center
const fresh = matchStacks(
  [{ id: 's1', value: 25, box: [0.1, 0.1, 0.2, 0.5] }],
  [{ value: 100, box: [0.1, 0.1, 0.2, 0.5] }, { value: 25, box: [0.12, 0.12, 0.22, 0.52] }],
);
eq('matchStacks by denom+position', fresh.get('s1'), [0.12, 0.12, 0.22, 0.52]);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: FAIL — `Cannot find module './fuse.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chipVision/fuse.ts`:

```ts
export interface SeamVote { count: number; agreement: number }

/** Majority vote over a list of counts. Ties break toward the smaller count. */
export function tally(counts: number[]): SeamVote {
  const m = new Map<number, number>();
  let best = counts[0], bestN = 0;
  for (const c of counts) {
    const n = (m.get(c) ?? 0) + 1; m.set(c, n);
    if (n > bestN || (n === bestN && c < best)) { best = c; bestN = n; }
  }
  return { count: best, agreement: bestN / counts.length };
}

/** Median of a numeric list, or null if empty. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface StackFuseInput {
  seam: SeamVote;                                   // pooled seam vote (all angles/samples)
  geo: number | null;                               // geometry count = round(ratio / k), or null
  dsp: { count: number; strength: number } | null;  // on-device DSP read, or null
}

/**
 * Fuse the seam-vote, geometry, and DSP channels for one stack into a count +
 * a cross-channel confidence. DSP is CONFIRM-ONLY: it must have strong periodicity
 * (strength >= 0.45) and land exactly on a candidate, else it abstains.
 * (Verbatim port of the previous inline fusion in visionCount.ts.)
 */
export function fuseStack(inp: StackFuseInput): { count: number; confidence: number } {
  const { seam, geo, dsp } = inp;
  const nSeam = seam.count, a = seam.agreement, nGeo = geo;
  const dspBacks = (n: number) => !!dsp && dsp.strength >= 0.45 && dsp.count === n;

  if (!nSeam && nGeo == null) return { count: 0, confidence: 0 };
  if (nGeo == null) {
    if (dspBacks(nSeam)) return { count: nSeam, confidence: Math.max(a, 0.9) };
    return { count: nSeam, confidence: a };
  }
  if (!nSeam) return { count: nGeo, confidence: 0.55 };

  if (nSeam === nGeo) {
    const conf = dspBacks(nSeam) ? 0.95 : nSeam <= 4 ? 0.9 : 0.8;
    return { count: nSeam, confidence: conf };
  }
  if (Math.abs(nSeam - nGeo) === 1 && a >= 0.8) {
    if (dspBacks(nSeam)) return { count: nSeam, confidence: 0.9 };
    if (dspBacks(nGeo)) return { count: nGeo, confidence: 0.6 };
    return { count: nSeam, confidence: 0.6 };
  }
  if (dspBacks(nSeam)) return { count: nSeam, confidence: 0.75 };
  if (dspBacks(nGeo)) return { count: nGeo, confidence: 0.75 };
  return { count: a >= 0.8 ? nSeam : nGeo, confidence: 0.5 };
}

/** Pool a second angle's votes/ratios into the first angle's for re-fusing. */
export function mergeAngles(
  a: { votes: number[]; ratios: number[] },
  b: { votes: number[]; ratios: number[] },
): { votes: number[]; ratios: number[] } {
  return { votes: [...a.votes, ...b.votes], ratios: [...a.ratios, ...b.ratios] };
}

/** Ids of stacks whose confidence is below the flag threshold (default 0.85). */
export function flaggedStackIds(stacks: { id: string; confidence: number }[], threshold = 0.85): string[] {
  return stacks.filter((s) => s.confidence < threshold).map((s) => s.id);
}

type Box = [number, number, number, number];
const cx = (b: Box) => (b[0] + b[2]) / 2, cy = (b: Box) => (b[1] + b[3]) / 2;

/**
 * Match prior (angle-1) stacks to freshly detected (angle-2) boxes of the SAME
 * denomination, choosing the nearest center. Returns prior-id -> fresh box for
 * every prior stack that found a same-denom match.
 */
export function matchStacks(
  prior: { id: string; value: number; box: Box }[],
  fresh: { value: number; box: Box }[],
): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const p of prior) {
    let best: Box | null = null, bestD = Infinity;
    for (const f of fresh) {
      if (f.value !== p.value) continue;
      const d = (cx(f.box) - cx(p.box)) ** 2 + (cy(f.box) - cy(p.box)) ** 2;
      if (d < bestD) { bestD = d; best = f.box; }
    }
    if (best) out.set(p.id, best);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 5: Rewire `visionCount.ts` to use `fuse.ts`**

In `src/lib/chipVision/visionCount.ts`:
1. Add at the top: `import { tally, median, fuseStack, type SeamVote } from './fuse.ts';`
2. Delete the local `tally` (lines ~153-162) and `median` (lines ~164-170) definitions.
3. Replace the per-stack fusion block inside `countChipsWithVision` (the `valid.map(async (b, i) => { ... })` body, ~lines 501-541) with a call to `fuseStack`, preserving the geometry/dsp assembly:

```ts
const perStack = valid.map((b, i) => {
  const geo = rMed[i] != null ? Math.max(1, Math.round(rMed[i]! / kStar)) : null;
  const { count, confidence } = fuseStack({ seam: seam[i], geo, dsp: dsp[i] });
  return { value: b.value, count, confidence };
});
```

Note: `fuseStack`'s "seam only, no geometry" branch (`nGeo == null`) reproduces the old DSP-confirm bump; the old code's `Math.max(1, round(...))` for geometry is preserved above.

- [ ] **Step 6: Verify parity — typecheck + build + engine still runs**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chipVision/fuse.ts src/lib/chipVision/fuse.test.ts src/lib/chipVision/visionCount.ts
git commit -m "refactor(chipvision): extract pure fusion into fuse.ts (parity)"
```

---

### Task 3: Per-stack result — types, measured span, and `stacks[]`

**Files:**
- Modify: `src/lib/chipVision/types.ts`
- Modify: `src/lib/chipVision/fuse.ts` (add `parseRead` returning count + ratio + extent + seams)
- Modify: `src/lib/chipVision/fuse.test.ts` (test `parseRead`)
- Modify: `src/lib/chipVision/visionCount.ts` (extend `readAllStacks` schema; populate `stacks[]`)

**Interfaces:**
- Consumes: `SeamVote`, `tally`, `median`, `fuseStack` (Task 2).
- Produces:
  - `interface StackResult { id: string; value: number; count: number; confidence: number; crop: HTMLCanvasElement; span: [number, number]; flagged: boolean; box: [number, number, number, number]; votes: number[]; ratios: number[] }`
  - `CountResult` gains `stacks: StackResult[]`.
  - `interface StackRead { count: number; r: number | null; extent: [number, number] | null; seams: number[] | null }`
  - `parseRead(obj: any): StackRead | null`

- [ ] **Step 1: Write the failing test (parseRead)**

Append to `src/lib/chipVision/fuse.test.ts` (before the final summary lines):

```ts
import { parseRead } from './fuse.ts';

eq('parseRead full', parseRead({ count: 5, stackHeight: 0.4, chipDiameter: 0.2, extent: [0.1, 0.5], seams: [0.2, 0.3] }),
  { count: 5, r: 2, extent: [0.1, 0.5], seams: [0.2, 0.3] });
eq('parseRead no geometry', parseRead({ count: 3 }), { count: 3, r: null, extent: null, seams: null });
eq('parseRead bad count', parseRead({ count: -1 }), null);
eq('parseRead clamps insane ratio', parseRead({ count: 2, stackHeight: 5, chipDiameter: 0.01 }).r, null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: FAIL — `parseRead` is not exported.

- [ ] **Step 3: Add `parseRead` to `fuse.ts`**

Append to `src/lib/chipVision/fuse.ts`:

```ts
export interface StackRead {
  count: number;
  r: number | null;                    // height:diameter ratio, or null
  extent: [number, number] | null;     // [yTop, yBottom] 0..1 in the crop, or null
  seams: number[] | null;              // optional model seam positions 0..1, or null
}

/** Parse one model stack object into a StackRead (or null when unusable). */
export function parseRead(obj: any): StackRead | null {
  const n = Math.round(Number(obj?.count));
  if (!Number.isFinite(n) || n < 0) return null;
  const h = Number(obj?.stackHeight), d = Number(obj?.chipDiameter);
  const rr = Number.isFinite(h) && Number.isFinite(d) && d > 0.01 && h > 0 ? h / d : NaN;
  const r = Number.isFinite(rr) && rr >= 0.03 && rr <= 4 ? rr : null;
  const ex = Array.isArray(obj?.extent) && obj.extent.length >= 2
    ? [Number(obj.extent[0]), Number(obj.extent[1])] : null;
  const extent = ex && ex.every(Number.isFinite) && ex[1] > ex[0] ? [ex[0], ex[1]] as [number, number] : null;
  const seams = Array.isArray(obj?.seams)
    ? obj.seams.map(Number).filter((v: number) => Number.isFinite(v) && v >= 0 && v <= 1) : null;
  return { count: n, r, extent, seams: seams && seams.length ? seams : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 5: Extend `types.ts`**

In `src/lib/chipVision/types.ts`, add `StackResult` and extend `CountResult`:

```ts
export interface StackResult {
  id: string;                          // stable id, e.g. `${value}-${index}`
  value: number;
  count: number;
  confidence: number;
  crop: HTMLCanvasElement;             // cleaned crop for the editor (on-device only)
  span: [number, number];             // [yTop, yBottom] 0..1 of the crop, for end-caps
  flagged: boolean;
  // internal, on-device only — used to merge a second angle:
  box: [number, number, number, number];
  votes: number[];
  ratios: number[];
}
```

Add `stacks: StackResult[];` to the `CountResult` interface (keep `totals`, `totalValue`, `anomalies`, `frames`, `confidence`).

- [ ] **Step 6: Update `visionCount.ts` — remove the local `parseRead`, extend the read prompt/schema, populate `stacks[]`**

1. Remove the local `parseRead` (lines ~358-365) and `type StackRead` (line ~7); import from `fuse.ts`: `import { tally, median, fuseStack, parseRead, type StackRead } from './fuse.ts';`
2. In `readAllStacks`, extend the prompt task 2 to also request the extent and seams, and change the JSON shape line to:

```ts
`2) MEASURE, as fractions (0..1) of THAT image: "stackHeight" (bottom edge of the lowest chip ` +
`to the top edge of the highest), "chipDiameter" (width of a single chip), and "extent":[yTop,yBottom] ` +
`= the top and bottom y of the stack in the image. Optionally include "seams":[y,...] = the y of each seam.\n` +
`Respond with ONLY a JSON array with EXACTLY ${n} entries, in image order: ` +
`[{"count":<int>,"stackHeight":<0..1>,"chipDiameter":<0..1>,"extent":[<0..1>,<0..1>],"seams":[<0..1>,...]}, ...].`
```

3. Change the samples accumulation to also collect extents and seams. Replace the votes/ratios collection loop with:

```ts
const votes: number[][] = valid.map(() => []);
const ratios: number[][] = valid.map(() => []);
const extents: [number, number][][] = valid.map(() => []);
for (const reads of samples) {
  reads.forEach((res, i) => {
    if (res) {
      votes[i].push(res.count);
      if (res.r != null) ratios[i].push(res.r);
      if (res.extent) extents[i].push(res.extent);
    }
  });
}
```

4. After computing `perStack` (now via `fuseStack`, Task 2 Step 5), build `stacks[]` alongside `totals`. Replace the perStack map so it keeps the index/box, then assemble StackResult:

```ts
const stacks: StackResult[] = valid.map((b, i) => {
  const geo = rMed[i] != null ? Math.max(1, Math.round(rMed[i]! / kStar)) : null;
  const { count, confidence } = fuseStack({ seam: seam[i], geo, dsp: dsp[i] });
  const exT = median(extents[i].map((e) => e[0])), exB = median(extents[i].map((e) => e[1]));
  const span: [number, number] = exT != null && exB != null && exB > exT ? [exT, exB] : [0.06, 0.94];
  return {
    id: `${b.value}-${i}`, value: b.value, count, confidence,
    crop: cropCanvases[i], span, flagged: confidence < 0.85,
    box: b.box, votes: votes[i], ratios: ratios[i],
  };
});
totals = sumStacksToDenoms(stacks); // helper below
```

5. Add a small local helper to sum stacks into denom totals (replaces the old inline `byValue` block):

```ts
function sumStacksToDenoms(stacks: StackResult[]): DenomTotal[] {
  const byValue = new Map<number, { count: number; confidence: number }>();
  for (const s of stacks) {
    const prev = byValue.get(s.value);
    byValue.set(s.value, { count: (prev?.count ?? 0) + s.count, confidence: Math.min(prev?.confidence ?? 1, s.confidence) });
  }
  return [...byValue.entries()]
    .map(([value, { count, confidence }]) => ({ value, count, confidence }))
    .filter((t) => t.count > 0)
    .sort((a, b) => a.value - b.value);
}
```

6. The no-detection fallback path (`countWholeVoted`) has no per-stack crops — return `stacks: []` there. Update the final `return` to include `stacks` (from the detected path, or `[]` from the fallback). Import `StackResult` from `./types.ts`.

- [ ] **Step 7: Verify — typecheck, build, tests**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/chipVision/types.ts src/lib/chipVision/fuse.ts src/lib/chipVision/fuse.test.ts src/lib/chipVision/visionCount.ts
git commit -m "feat(chipvision): per-stack results with measured span + parseRead extent"
```

---

### Task 4: Second-angle recount (`recountStacks`)

**Files:**
- Modify: `src/lib/chipVision/visionCount.ts` (add `recountStacks`)

**Interfaces:**
- Consumes: `mergeAngles`, `matchStacks`, `flaggedStackIds`, `tally`, `median`, `fuseStack` (Task 2); `StackResult`, `CountResult` (Task 3); existing `detectStacks`, crop/clean helpers, `readAllStacks`, `dspCount`.
- Produces: `recountStacks(canvas: HTMLCanvasElement, denoms: VisionDenom[], apiKey: string, prior: CountResult): Promise<CountResult>` — re-reads only the flagged stacks from a second-angle frame and folds the new votes into the prior result. Non-flagged stacks pass through unchanged.

- [ ] **Step 1: Implement `recountStacks`**

Add to `src/lib/chipVision/visionCount.ts` (after `countChipsWithVision`). It reuses the module's crop/clean helpers:

```ts
/**
 * Second-angle recount. Detect stacks in the new (steeper-angle) frame, match the
 * flagged prior stacks to same-denomination boxes, re-read just those, pool the new
 * votes/ratios with the prior via mergeAngles, recompute the calibration k across
 * ALL stacks, and re-fuse the flagged ones. Confident stacks are returned unchanged.
 * ~1 detection + SAMPLES reads on the flagged subset only.
 */
export async function recountStacks(
  canvas: HTMLCanvasElement,
  denoms: VisionDenom[],
  apiKey: string,
  prior: CountResult,
): Promise<CountResult> {
  const flaggedIds = new Set(flaggedStackIds(prior.stacks));
  const flagged = prior.stacks.filter((s) => flaggedIds.has(s.id));
  if (!flagged.length) return prior;

  const list = denoms.map((d) => `${d.value} = ${colorName(d.color)} (${d.color})`).join('; ');
  const fullB64 = toJpegBase64(canvas, 1024);
  const fresh = await detectStacks(apiKey, fullB64, list).catch(() => [] as StackBox[]);
  const match = matchStacks(
    flagged.map((s) => ({ id: s.id, value: s.value, box: s.box })),
    fresh.map((f) => ({ value: f.value, box: f.box })),
  );

  // Crop + clean each matched flagged stack from the new frame.
  const colorByValue = new Map(denoms.map((d) => [d.value, d.color]));
  const targets = flagged.filter((s) => match.has(s.id));
  if (!targets.length) return prior; // second angle found nothing to improve
  const cropCanvases = targets.map((s) => {
    const base = resized(cropCanvas(canvas, match.get(s.id)!, CROP_PAD), 1024);
    const hex = colorByValue.get(s.value);
    const tight = hex ? tightenByColor(base, hex) : base;
    return autoLevels(tight);
  });
  const crops = cropCanvases.map((cc) => toJpegBase64(cc, 768));
  const dsp2 = cropCanvases.map((cc) => dspCount(cc));
  const values = targets.map((s) => s.value);
  const samples = await mapPool(Array.from({ length: SAMPLES }, (_, i) => i), POOL, () =>
    readAllStacks(apiKey, crops, values, 0.5).catch(() => targets.map(() => null)),
  );

  // Pool angle-2 votes/ratios with the prior per target, recompute k, re-fuse.
  const a2votes: number[][] = targets.map(() => []);
  const a2ratios: number[][] = targets.map(() => []);
  for (const reads of samples) reads.forEach((res, i) => { if (res) { a2votes[i].push(res.count); if (res.r != null) a2ratios[i].push(res.r); } });

  const merged = targets.map((s, i) => mergeAngles({ votes: s.votes, ratios: s.ratios }, { votes: a2votes[i], ratios: a2ratios[i] }));
  const mergedSeam = merged.map((m) => tally(m.votes));
  const mergedR = merged.map((m) => median(m.ratios));

  // Recalibrate k across ALL stacks: confident prior stacks + newly-unanimous flagged.
  const ks: number[] = [];
  for (const s of prior.stacks) {
    if (!flaggedIds.has(s.id)) {
      const r = median(s.ratios), v = tally(s.votes);
      if (v.agreement >= 0.999 && v.count >= 2 && r != null) ks.push(r / v.count);
    }
  }
  targets.forEach((_, i) => { if (mergedSeam[i].agreement >= 0.999 && mergedSeam[i].count >= 2 && mergedR[i] != null) ks.push(mergedR[i]! / mergedSeam[i].count); });
  const kStar = Math.max(K_MIN, Math.min(K_MAX, median(ks) ?? NOMINAL_K));

  const updated = new Map<string, StackResult>();
  targets.forEach((s, i) => {
    const geo = mergedR[i] != null ? Math.max(1, Math.round(mergedR[i]! / kStar)) : null;
    const { count, confidence } = fuseStack({ seam: mergedSeam[i], geo, dsp: dsp2[i] ?? null });
    updated.set(s.id, { ...s, count, confidence, flagged: confidence < 0.85, votes: merged[i].votes, ratios: merged[i].ratios });
  });

  const stacks = prior.stacks.map((s) => updated.get(s.id) ?? s);
  const totals = sumStacksToDenoms(stacks);
  const totalValue = totals.reduce((sum, t) => sum + t.value * t.count, 0);
  const confidence = totals.length ? Math.min(...totals.map((t) => t.confidence)) : 0;
  return { totals, stacks, totalValue, anomalies: [], frames: (prior.frames ?? 1) + 1, confidence };
}
```

Note: hoist `sumStacksToDenoms` (Task 3) to module scope so both `countChipsWithVision` and `recountStacks` use it.

- [ ] **Step 2: Verify — typecheck + build**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Sanity-run the existing pure tests**

Run: `node --experimental-strip-types src/lib/chipVision/fuse.test.ts`
Expected: `ALL PASS` (recount reuses the already-tested pure fns; the network path is verified manually in Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/lib/chipVision/visionCount.ts
git commit -m "feat(chipvision): recountStacks — adaptive second-angle re-read of flagged stacks"
```

---

### Task 5: Tilt-band parameter + frame-content gate

**Files:**
- Create: `src/lib/chipVision/frame.ts`
- Test: `src/lib/chipVision/frame.test.ts`
- Modify: `src/lib/useDeviceTilt.ts` (accept a band)
- Modify: `src/lib/useCameraCapture.ts` (add `frameHasContent`)

**Interfaces:**
- Produces:
  - `contentScore(luma: number[]): number` — normalized 0..1 spread of a downscaled luma grid; ~0 for a flat frame, higher when objects are present.
  - `useDeviceTilt(band?: { min: number; max: number })` — `inRange` uses the band (default `{ min: 15, max: 35 }`).
  - `useCameraCapture().frameHasContent(): boolean` — grabs a 32×18 luma grid and returns `contentScore(...) > 0.02`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/chipVision/frame.test.ts`:

```ts
import { contentScore } from './frame.ts';

let failures = 0;
function assert(label: string, cond: boolean) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); } else console.log(`ok   ${label}`);
}

const flat = new Array(100).fill(120);
assert('flat frame ~ 0', contentScore(flat) < 0.02);

const busy: number[] = [];
for (let i = 0; i < 100; i++) busy.push(i % 2 ? 20 : 220);
assert('busy frame high', contentScore(busy) > 0.2);

assert('empty -> 0', contentScore([]) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/lib/chipVision/frame.test.ts`
Expected: FAIL — `Cannot find module './frame.ts'`.

- [ ] **Step 3: Implement `frame.ts`**

Create `src/lib/chipVision/frame.ts`:

```ts
/**
 * Content score of a downscaled luma grid: standard deviation normalized to 0..1.
 * A blank/empty table is near-uniform (~0); chips add edges/contrast (higher).
 * Pure — used to gate auto-capture so it won't fire at nothing.
 */
export function contentScore(luma: number[]): number {
  const n = luma.length;
  if (!n) return 0;
  let mean = 0; for (const v of luma) mean += v; mean /= n;
  let varSum = 0; for (const v of luma) varSum += (v - mean) ** 2;
  return Math.min(1, Math.sqrt(varSum / n) / 128);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/lib/chipVision/frame.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 5: Parameterize `useDeviceTilt`**

In `src/lib/useDeviceTilt.ts`, change the signature and `inRange` (keep the exported default constants):

```ts
export function useDeviceTilt(band: { min: number; max: number } = { min: TILT_MIN_DEG, max: TILT_MAX_DEG }) {
  // ...unchanged body...
  const inRange = pitchDeg != null && pitchDeg >= band.min && pitchDeg <= band.max;
  return { pitchDeg, inRange, steady, request };
}
```

- [ ] **Step 6: Add `frameHasContent` to `useCameraCapture`**

In `src/lib/useCameraCapture.ts`, import the helper and expose a method that reuses the existing 32×18 luma sampling pattern:

```ts
import { contentScore } from './chipVision/frame.ts';
// ...
const frameHasContent = useCallback((): boolean => {
  const v = videoRef.current; if (!v || !v.videoWidth) return false;
  const c = document.createElement('canvas'); c.width = 32; c.height = 18;
  const ctx = c.getContext('2d')!; ctx.drawImage(v, 0, 0, 32, 18);
  const d = ctx.getImageData(0, 0, 32, 18).data;
  const luma: number[] = [];
  for (let i = 0; i < d.length; i += 4) luma.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  return contentScore(luma) > 0.02;
}, []);
// add frameHasContent to the returned object
```

- [ ] **Step 7: Verify — typecheck + build + tests**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Run: `node --experimental-strip-types src/lib/chipVision/frame.test.ts`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/chipVision/frame.ts src/lib/chipVision/frame.test.ts src/lib/useDeviceTilt.ts src/lib/useCameraCapture.ts
git commit -m "feat(chipvision): tilt-band param + frame-content gate for auto-capture"
```

---

### Task 6: `ChipSeamEditor` component

**Files:**
- Create: `src/components/ChipSeamEditor.tsx`
- Modify: `src/styles.css` (editor styles)
- Modify: `src/lib/i18n.ts` (editor strings, en + de)

**Interfaces:**
- Consumes: `seamLines` (Task 1); `StackResult` (Task 3).
- Produces: `ChipSeamEditor({ stack, onDone }: { stack: StackResult; onDone: (count: number) => void })` — renders the crop, draggable top/bottom end-caps, evenly-spaced seam lines, and a live count; calls `onDone(finalCount)`.

- [ ] **Step 1: Add i18n strings**

In `src/lib/i18n.ts`, add to both `en` and `de` dictionaries:

```ts
// en
'chipcount.editTitle': 'Fix this stack',
'chipcount.editHint': 'Tap a gap to add a chip, tap a line to remove one. Drag the ends to fit.',
'chipcount.editDone': 'Done',
'chipcount.editCount': 'Chips',
// de
'chipcount.editTitle': 'Stapel korrigieren',
'chipcount.editHint': 'Tippe in eine Lücke für einen Chip mehr, auf eine Linie für einen weniger. Enden ziehen zum Anpassen.',
'chipcount.editDone': 'Fertig',
'chipcount.editCount': 'Chips',
```

- [ ] **Step 2: Implement the component**

Create `src/components/ChipSeamEditor.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.ts';
import { seamLines } from '../lib/chipVision/seams.ts';
import type { StackResult } from '../lib/chipVision/types.ts';

export function ChipSeamEditor({ stack, onDone }: { stack: StackResult; onDone: (count: number) => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState(Math.max(1, stack.count));
  const [span, setSpan] = useState<[number, number]>(stack.span);
  const [drag, setDrag] = useState<null | 'top' | 'bottom'>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Paint the crop once.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = stack.crop.width; c.height = stack.crop.height;
    c.getContext('2d')!.drawImage(stack.crop, 0, 0);
  }, [stack.crop]);

  const lines = seamLines(span, count);

  // Convert a pointer y within the image box to a 0..1 fraction.
  const fracFromEvent = (clientY: number): number => {
    const r = boxRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag) return;
    const y = fracFromEvent(e.clientY);
    // Near a seam line (within 3%) → remove that chip; else add a chip at the tapped gap.
    const near = lines.some((ly) => Math.abs(ly - y) < 0.03);
    if (near) setCount((c) => Math.max(1, c - 1));
    else if (y > span[0] && y < span[1]) setCount((c) => c + 1);
  };

  const onCapDown = (which: 'top' | 'bottom') => (e: React.PointerEvent) => {
    e.stopPropagation(); setDrag(which);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const y = fracFromEvent(e.clientY);
    setSpan(([tp, bt]) => drag === 'top' ? [Math.min(y, bt - 0.05), bt] : [tp, Math.max(y, tp + 0.05)]);
  };
  const onUp = () => setDrag(null);

  return (
    <div className="cc-editor">
      <div className="cc-editor-hint">{t('chipcount.editHint')}</div>
      <div className="cc-editor-stage" ref={boxRef}
        onPointerDown={onPointerDown} onPointerMove={onMove} onPointerUp={onUp}>
        <canvas ref={canvasRef} className="cc-editor-img" />
        <div className="cc-cap" style={{ top: `${span[0] * 100}%` }} onPointerDown={onCapDown('top')} />
        <div className="cc-cap" style={{ top: `${span[1] * 100}%` }} onPointerDown={onCapDown('bottom')} />
        {lines.map((ly, i) => (
          <div key={i} className="cc-seam" style={{ top: `${ly * 100}%` }} />
        ))}
      </div>
      <div className="cc-editor-bar">
        <span className="cc-editor-count">{t('chipcount.editCount')}: <b>{count}</b></span>
        <button className="btn btn-primary" onClick={() => onDone(count)}>{t('chipcount.editDone')}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add styles**

In `src/styles.css`, add:

```css
.cc-editor { position: absolute; inset: 0; display: flex; flex-direction: column; background: #0b0d10; color: #fff; z-index: 5; }
.cc-editor-hint { padding: 10px 14px; font-size: 13px; opacity: .85; }
.cc-editor-stage { position: relative; flex: 1; margin: 0 auto; touch-action: none; display: flex; }
.cc-editor-img { max-height: 100%; max-width: 100%; object-fit: contain; display: block; margin: auto; }
.cc-seam { position: absolute; left: 0; right: 0; height: 2px; background: rgba(255,209,102,.95); pointer-events: none; }
.cc-cap { position: absolute; left: 0; right: 0; height: 14px; margin-top: -7px; cursor: ns-resize;
  background: rgba(80,200,255,.25); border-top: 2px solid #4cc9f0; border-bottom: 2px solid #4cc9f0; }
.cc-editor-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; gap: 12px; }
.cc-editor-count { font-size: 16px; }
```

- [ ] **Step 4: Verify — typecheck + build + preview render**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Manual: start the dev server (`preview_start {name:"chipstack"}`), temporarily mount `ChipSeamEditor` with a stub `StackResult` (a small canvas + `span:[0.1,0.9]`, `count:5`) on a scratch route or via React devtools. Confirm: 4 seam lines drawn evenly; tapping a gap → count 6 and 5 lines; tapping a line → count back; dragging an end-cap re-spaces the lines. Remove the scratch mount before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChipSeamEditor.tsx src/styles.css src/lib/i18n.ts
git commit -m "feat(chipvision): ChipSeamEditor — tap/drag seam-line correction"
```

---

### Task 7: Review opens the seam editor on flagged stacks

**Files:**
- Modify: `src/components/ChipCountReview.tsx`
- Modify: `src/lib/i18n.ts` (one string if needed)

**Interfaces:**
- Consumes: `ChipSeamEditor` (Task 6); `CountResult.stacks`, `StackResult` (Task 3).
- Produces: review UI that, for each flagged stack, opens `ChipSeamEditor`; applies the corrected count back into that stack; recomputes denom rows + total.

- [ ] **Step 1: Rework `ChipCountReview` to hold per-stack state**

Replace the row state in `src/components/ChipCountReview.tsx` to derive rows from `result.stacks` (falling back to `result.totals` when `stacks` is empty, e.g. the whole-image fallback). Add an editing target.

```tsx
import { ChipSeamEditor } from './ChipSeamEditor.tsx';
import type { StackResult } from '../lib/chipVision/types.ts';
// ...
const hasStacks = result.stacks.length > 0;
const [stacks, setStacks] = useState<StackResult[]>(() => result.stacks);
const [editing, setEditing] = useState<StackResult | null>(null);

// Denom rows: from stacks when present, else from totals (fallback path).
const rows: Row[] = hasStacks
  ? [...new Map(stacks.map((s) => [s.value, 0])).keys()].sort((a, b) => a - b).map((value) => {
      const group = stacks.filter((s) => s.value === value);
      return { value, count: group.reduce((n, s) => n + s.count, 0), confidence: Math.min(...group.map((s) => s.confidence)) };
    })
  : result.totals.map((x) => ({ value: x.value, count: x.count, confidence: x.confidence }));

const total = rows.reduce((s, r) => s + r.value * r.count, 0);

const applyEdit = (id: string, count: number) => {
  setStacks((ss) => ss.map((s) => (s.id === id ? { ...s, count, confidence: 1, flagged: false } : s)));
  setEditing(null);
};
```

- [ ] **Step 2: Render the editor overlay + a "check" affordance on flagged denom rows**

When `editing` is set, render the editor above the review:

```tsx
if (editing) return <ChipSeamEditor stack={editing} onDone={(c) => applyEdit(editing.id, c)} />;
```

In each denom row, when the row is uncertain and `hasStacks`, show a button that opens the first flagged stack of that denom:

```tsx
{uncertain && hasStacks && (
  <button className="cc-check-btn" onClick={() => {
    const target = stacks.find((s) => s.value === r.value && s.flagged) ?? stacks.find((s) => s.value === r.value);
    if (target) setEditing(target);
  }}>⚠ {t('chipcount.checkThis')}</button>
)}
```

Keep the existing +/− stepper as-is for the fallback (no stacks) path. The stepper, when `hasStacks`, should adjust the denom's stacks — simplest: keep +/− adjusting a derived override only in the fallback path; when `hasStacks`, rely on the editor for corrections (hide the +/− or leave them adjusting the first stack of that denom):

```tsx
const step = (value: number, delta: number) => {
  if (!hasStacks) { /* existing totals-based path */ return; }
  setStacks((ss) => {
    const idx = ss.findIndex((s) => s.value === value);
    if (idx < 0) return ss;
    const copy = [...ss]; copy[idx] = { ...copy[idx], count: Math.max(0, copy[idx].count + delta) };
    return copy;
  });
};
```

- [ ] **Step 3: Save uses the recomputed total**

The existing `save()` already writes `Math.round(total)` to `chips`; ensure `total` now comes from `rows` derived above. No signature change.

- [ ] **Step 4: Verify — typecheck + build + preview**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Manual (dev preview): drive a `ChipCountReview` with a stubbed `CountResult` containing 2 stacks (one `flagged:true`). Confirm the flagged denom shows **⚠ check**, tapping opens the editor, finishing updates that denom's count + total and clears the flag outline.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChipCountReview.tsx src/lib/i18n.ts
git commit -m "feat(chipvision): review opens seam editor for flagged stacks"
```

---

### Task 8: Capture state machine — auto-capture + adaptive second angle

**Files:**
- Modify: `src/components/ChipCountSheet.tsx`
- Modify: `src/styles.css` (auto-capture ring, second-angle prompt)
- Modify: `src/lib/i18n.ts` (capture strings, en + de)

**Interfaces:**
- Consumes: `useCameraCapture` (+ `frameHasContent`, Task 5), `useDeviceTilt(band)` (Task 5), `countChipsWithVision` + `recountStacks` (Tasks 3–4), `flaggedStackIds` (Task 2), `ChipCountReview` (Task 7).
- Produces: a sheet driving `framing → analyzing → secondAnglePrompt → framing2 → analyzing2 → review`, with auto-capture and a manual override.

- [ ] **Step 1: Add i18n strings**

In `src/lib/i18n.ts`, add en + de:

```ts
// en
'chipcount.autoHold': 'Hold steady…',
'chipcount.secondAngleTitle': 'One more angle',
'chipcount.secondAngleBody': 'A couple of stacks were unclear. Tilt the phone about 15° more and hold to separate the chips.',
'chipcount.secondAngleSkip': 'Skip — I\'ll fix it by hand',
'chipcount.tiltMore': 'Tilt a bit more…',
// de
'chipcount.autoHold': 'Ruhig halten…',
'chipcount.secondAngleTitle': 'Noch ein Winkel',
'chipcount.secondAngleBody': 'Ein paar Stapel waren unklar. Kipp das Handy ca. 15° mehr und halt still, um die Chips zu trennen.',
'chipcount.secondAngleSkip': 'Überspringen — von Hand korrigieren',
'chipcount.tiltMore': 'Etwas mehr kippen…',
```

- [ ] **Step 2: Introduce the phase state + steeper band for shot 2**

At the top of `ChipCountSheet`, replace the ad-hoc booleans with an explicit phase and keep a `result` for merging. Use a steeper tilt band during the second angle:

```tsx
type Phase = 'framing' | 'analyzing' | 'secondAngle' | 'framing2' | 'analyzing2' | 'review';
const [phase, setPhase] = useState<Phase>('framing');
const cam = useCameraCapture();
const band = (phase === 'framing2') ? { min: 30, max: 45 } : { min: 15, max: 35 };
const tilt = useDeviceTilt(band);
```

- [ ] **Step 3: Auto-capture — fire on steady + in-range + content, held ~600ms**

Add an effect that arms auto-capture only in the two framing phases:

```tsx
const holdRef = useRef<number | null>(null);
useEffect(() => {
  const framing = phase === 'framing' || phase === 'framing2';
  if (!framing || !cam.ready) return;
  const id = window.setInterval(() => {
    const ok = tilt.inRange && tilt.steady && cam.frameHasContent();
    if (ok) { if (holdRef.current == null) holdRef.current = Date.now(); else if (Date.now() - holdRef.current > 600) { holdRef.current = null; void onCapture(); } }
    else holdRef.current = null;
  }, 120);
  return () => window.clearInterval(id);
}, [phase, cam.ready, tilt.inRange, tilt.steady]);
```

(Manual shutter still calls `onCapture` directly. If the tilt sensor never reports, `tilt.inRange` stays false and auto-capture simply never fires — the manual shutter is the path.)

- [ ] **Step 4: `onCapture` routes by phase (shot 1 vs shot 2)**

Rework `onCapture` to branch on phase. Shot 1 runs `countChipsWithVision`; if any stack is flagged → go to the second-angle prompt; else review. Shot 2 runs `recountStacks` merging into the prior result, then review.

```tsx
const priorRef = useRef<CountResult | null>(null);

const onCapture = async () => {
  if (!cam.ready) return;
  navigator.vibrate?.(30); setFlash(true); window.setTimeout(() => setFlash(false), 280);
  const frames = await cam.captureBurst(3); if (!frames.length) return;
  setCaptured(frames[0]); cam.stop();
  if (!state.settings.aiVisionKey) { setAnalyzeErr(t('chipcount.aiNeedsKey')); return; }

  const denoms = state.denominations.filter((d) => d.enabled).map((d) => ({ value: d.value, color: d.color }));
  const secondPass = phase === 'framing2';
  setPhase(secondPass ? 'analyzing2' : 'analyzing'); setAnalyzeErr(null);
  try {
    const res = secondPass && priorRef.current
      ? await withTimeout(recountStacks(frames[0], denoms, state.settings.aiVisionKey, priorRef.current), 60000, t('chipcount.timedOut'))
      : await withTimeout(countChipsWithVision(frames[0], denoms, state.settings.aiVisionKey), 60000, t('chipcount.timedOut'));
    if (res.totals.length === 0) {
      const blocking = res.anomalies.find((x) => x.severity === 'blocking');
      setAnalyzeErr(blocking ? t('chipcount.anom.' + blocking.code) : t('chipcount.noChips')); return;
    }
    priorRef.current = res; setShot(frames[0]); setResult(res);
    const flagged = flaggedStackIds(res.stacks);
    if (!secondPass && flagged.length > 0 && res.stacks.length > 0) setPhase('secondAngle');
    else setPhase('review');
  } catch (e: any) {
    setAnalyzeErr(e?.message || t('chipcount.analyzeFailed'));
  }
};
```

- [ ] **Step 5: Render the second-angle prompt + re-arm the camera**

Add a `secondAngle` branch that offers to shoot another angle or skip straight to review:

```tsx
if (phase === 'secondAngle') {
  return (
    <div className="cc-sheet"><div className="cc-stage"><div className="cc-overlay">
      <div className="cc-overlay-t"><b>{t('chipcount.secondAngleTitle')}</b></div>
      <div className="cc-overlay-t">{t('chipcount.secondAngleBody')}</div>
      <div className="cc-overlay-btns">
        <button className="btn btn-primary" onClick={() => { setCaptured(null); setPhase('framing2'); cam.retry(); }}>📷</button>
        <button className="btn btn-ghost" onClick={() => setPhase('review')}>{t('chipcount.secondAngleSkip')}</button>
      </div>
    </div></div></div>
  );
}
```

The `review` phase renders `ChipCountReview` with the merged `result` (as today). The framing phases render the live camera with the tilt bubble; in `framing2` the hint uses `t('chipcount.tiltMore')` when `!tilt.inRange`. Show an auto-capture ring element while `holdRef` is counting (optional visual — a `.cc-ring` div driven by a `holding` state if you want the fill animation).

- [ ] **Step 6: Add styles**

In `src/styles.css`, add a minimal auto-capture ring (optional) and reuse existing `.cc-overlay*` for the prompt:

```css
.cc-ring { position: absolute; bottom: 96px; left: 50%; transform: translateX(-50%); width: 68px; height: 68px;
  border-radius: 50%; border: 3px solid rgba(255,255,255,.35); box-shadow: 0 0 0 3px rgba(76,201,240,.0); }
.cc-ring.active { border-color: #4cc9f0; box-shadow: 0 0 0 3px rgba(76,201,240,.35); }
```

- [ ] **Step 7: Verify — typecheck + build + full manual flow**

Run: `npx tsc -b`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.
Manual (on device / dev preview with camera): 
  1. Open the count sheet → framing shows the tilt bubble; holding steady in range auto-fires (or tap the shutter).
  2. A photo with a clean short stack → goes straight to review, no flag.
  3. A photo with a merged/tall stack → second-angle prompt appears; shooting a steeper angle re-reads only that stack; if it resolves, the flag clears; otherwise the flagged row opens the seam editor.
  4. Save writes the total to the player (`LedgerPlayer.chips`) — confirm the chip-leader crown / count updates.

- [ ] **Step 8: Commit**

```bash
git add src/components/ChipCountSheet.tsx src/styles.css src/lib/i18n.ts
git commit -m "feat(chipvision): auto-capture + adaptive second-angle capture flow"
```

---

## Self-Review

**Spec coverage:**
- Auto-capture (steady + in-range + content gate, manual override, graceful no-sensor) → Task 5 (`frameHasContent`, tilt band) + Task 8 (ring, hold timer, fallback).
- Adaptive second angle (flagged subset only, steeper band, vote pooling, parallax) → Task 4 (`recountStacks`) + Task 8 (phase routing).
- Seam-line correction (even spacing from uniform chips, tap add/remove, drag caps, 0 API calls) → Task 1 (`seamLines`) + Task 6 (`ChipSeamEditor`) + Task 7 (review wiring).
- Data model (`StackResult`, `CountResult.stacks`, on-device crop/span) → Task 3.
- Engine refactor (`fuseStack`, `mergeAngles`, `matchStacks`, extent schema, auto-discovered model) → Tasks 2–4.
- Barrels-of-10 soft hint → Task 8 framing hint (add `t('chipcount.barrelsTip')` string alongside Step 1 if a persistent line is wanted; the coaching copy lives in the framing overlay).
- Cost guardrail (`SAMPLES` 3→2, subset re-read) → Task 3 Step 6 (note), Task 4, Global Constraints. **`SAMPLES` change:** set `const SAMPLES = 2;` in `visionCount.ts` as part of Task 3 Step 6.
- Error/degradation table → Tasks 3 (fallback returns `stacks:[]`), 4 (no-match returns prior), 6 (even-spacing when model seams absent), 8 (timeout keeps prior).
- Testing (pure node tests + manual UI) → Tasks 1, 2, 3, 5 unit tests; Tasks 6, 7, 8 manual.

**Placeholder scan:** No TBD/TODO; every code step shows real code; UI-manual steps state the exact observation to confirm.

**Type consistency:** `StackResult`/`CountResult.stacks` defined in Task 3 and consumed identically in Tasks 4/6/7/8. `fuseStack`/`mergeAngles`/`matchStacks`/`flaggedStackIds`/`parseRead` signatures defined in Tasks 2–3 match their call sites. `useDeviceTilt(band)` and `frameHasContent` defined in Task 5 match Task 8 usage.

**Note added during review:** Task 3 Step 6 must also set `SAMPLES = 2` (cost guardrail); called out here so it isn't missed.
