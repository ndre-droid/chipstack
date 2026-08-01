# Chip photo count — capture rethink (adaptive multi-angle + auto-capture + seam-line correction)

**Date:** 2026-08-01
**Status:** Design approved; pending spec review → implementation plan.
**Supersedes capture UX of:** `ChipCountSheet.tsx`, `ChipCountReview.tsx`, `useCameraCapture.ts`.
**Keeps:** the Gemini engine (`chipVision/visionCount.ts`), auto-discovered model, user's own key, on-device-only images.

## Problem

The AI count engine is near its algorithmic ceiling (detect → crop → on-device clean → batched
seam-vote + geometry + DSP fuse, ~4 API calls/photo). The remaining error is **capture-bound, not
code-bound** (confirmed in HANDOFF): a chip lying flat, touching/leaning stacks that merge seams, and
rotated phones defeat the geometry/DSP channels. Squeezing the model harder yields diminishing returns
and costs money (the user hit ~2€ during testing).

The fix is to change **what and how we photograph**, and to put a fast human confirmation on the few
hard stacks — not to add more model passes.

## Goals

- Materially cut miscounts on the hard cases (merged/leaning seams) without inflating cost.
- Keep the easy case as cheap or cheaper than today (~4 calls/photo).
- Make correcting a flagged stack a ~2-second, obvious gesture instead of guesswork.
- Reduce bad shots at the source (hand-shake, wrong angle) via auto-capture.
- Degrade gracefully everywhere: sensor denied, detection failed, model junk, network timeout —
  never worse than the current flow.

## Non-goals

- Chip racks / trays as a reference (user owns none; deferred "for home later").
- Requiring players to keep perfect barrels (soft coaching hint only).
- Backend / server-side vision (stays a direct browser call with the user's key).
- Changing the fusion math's core channels (seam vote, geometry, DSP) — we *reuse* them across angles.

## The three features

### 1. Auto-capture (framing)

The live-framing state already renders the camera, a guide box, and a tilt bubble
(`useDeviceTilt` exposes `inRange` + `steady`). Add:

- When `cam.ready && tilt.inRange && tilt.steady` holds for ~600 ms, fill a progress ring and
  auto-fire the shutter. Breaking steadiness resets the ring.
- A cheap on-device `frameHasContent()` gate (luminance-variance / edge-density inside the guide box)
  so it will not fire at an empty table.
- The manual shutter remains as an override.
- If `DeviceOrientation` is unavailable or permission is denied, auto-capture is silently disabled and
  the manual shutter is the path. No hard dependency on the sensor.
- Coaching line in this state: *"rough stacks of ~10 read cleanest"* (soft barrels hint; never enforced).

### 2. Adaptive multi-angle

- **Shot 1** runs the existing pipeline (detection → per-stack crop → on-device clean → batched read
  × `SAMPLES` votes → fuse). `SAMPLES` drops 3 → 2, because the second angle and the seam editor now
  backstop confidence.
- **Fork on the result:**
  - Every stack confident (≥ the review threshold, currently 0.85) → straight to review.
  - Any stack flagged → **second-angle prompt.** Re-arm the camera, shift the tilt bubble's target to a
    steeper band (≈ 30–45°), coach *"tilt ~15°, hold."* Auto-fire **shot 2**.
- **Shot 2 re-reads only the flagged stacks** (reuse shot-1 detection boxes, matched by denom +
  position; re-detect the whole frame only if the match fails). Its counts fold in as **extra votes**
  plus a **second geometry sample** for those stacks.
- **Why it works:** a seam merged at one angle tends to separate under a steeper parallax, so shot 2
  contributes higher, more-agreed counts exactly where shot 1 under-counted. This is handled by the
  existing tally + geometry logic — no new "take the max" heuristic. If, after folding shot 2 in, the
  channels agree → the stack becomes confident. If they still disagree → it stays flagged for the human.

### 3. Seam-line tap-correction (review)

Flagged denominations in the review show a **⚠ check** affordance; tapping steps through that denom's
flagged **stacks** in a new editor.

- **Key insight:** every chip in the set is the same SLOWPLAY ceramic chip, so seams in a clean stack
  are **near-evenly spaced.** The editor therefore does **not** depend on the model returning good seam
  positions. It draws the stack's top and bottom **end-caps** (prefilled from the crop's measured
  extent) and divides the span evenly into `count` chips.
- Gestures on the zoomed crop:
  - **tap a gap** → count + 1 (add a chip), lines re-space evenly;
  - **tap a line** → count − 1 (remove a chip), lines re-space;
  - **drag an end-cap** → adjust the stack span, lines re-space.
- Count updates live. The model's raw seam positions are used only as an optional refinement when
  present and sane; if they are garbage, even-spacing still gives a correct, editable result.
- Finishing marks the stack **user-confirmed** (confidence maxed). Editing costs **0 API calls**.

## Capture flow (state machine)

`ChipCountSheet.tsx` becomes an explicit state machine:

```
framing ──auto/manual shot──▶ analyzing ──all confident──▶ review
                                   │
                                   └─ some flagged ─▶ secondAnglePrompt ─▶ framing2
                                                                              │
                                        analyzing2 ◀── auto/manual shot ──────┘
                                             │
                                             └─▶ review  (flagged rows → seam editor)
```

## Data model

`chipVision/types.ts`:

```ts
// New: per-stack detail (on-device only; crop never leaves the phone).
interface StackResult {
  id: string;                 // stable id to match across angles
  value: number;              // denomination
  count: number;
  confidence: number;
  crop: HTMLCanvasElement;    // cleaned crop for the editor
  span: [number, number];     // [yTop, yBottom] as 0..1 of the crop, for end-caps
  flagged: boolean;
}

interface CountResult {
  totals: DenomTotal[];       // unchanged — denom-summed, for the review rows + total
  stacks: StackResult[];      // NEW — per-stack, drives multi-angle + the editor
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;
}
```

Review sums `stacks` → denoms for display; edits happen per stack; **save still writes the summed total
to `LedgerPlayer.chips`** (unchanged contract with the ledger/crown).

## Engine changes (`chipVision/visionCount.ts`)

- **Extract** the per-stack fuse (seam-vote + geometry + DSP → `{count, confidence}`) into
  `fuseStack(votes, ratios, dsp, kStar)` so it is reusable across angles.
- **`readAllStacks` schema** gains, per crop, an optional `seams: number[]` (0..1 positions) and an
  `extent: [yTop, yBottom]` (0..1). These are a few numbers next to an image tile — negligible tokens.
  `extent` feeds the editor end-caps; `seams` is the optional refinement.
- **`fuseAngles(a1, a2)`** — concatenate votes + ratios from both angles into the existing
  tally/geometry, then `fuseStack`. No separate max heuristic.
- **New entry** `countChips(canvas, denoms, key, opts?)` where `opts.only?: string[]` (stack ids) makes
  shot 2 re-read just the flagged crops; reuse shot-1 boxes, re-detect only on match failure.
- **Unchanged:** auto-discovered model (`resolveModel`, never hardcode an id), per-request
  `AbortController` timeout, bounded concurrency pool, on-device `tightenByColor` + `autoLevels` + `dspCount`.

## Pure helper (testable)

`seamLines(span, count) → number[]`: evenly divide `[yTop, yBottom]` into `count` segments, returning
the `count - 1` interior seam y-positions. `count = lines.length + 1`. Drives the editor; zero network.

## Capture hooks

- `useDeviceTilt.ts`: parameterize the target band (default 15–35°, steeper band 30–45° for shot 2)
  instead of the hard-coded `TILT_MIN_DEG` / `TILT_MAX_DEG`.
- `useCameraCapture.ts`: keep; add `frameHasContent()` (cheap in-box variance check). Auto-capture
  hold-timer + ring live in the sheet, driven by existing `inRange`/`steady`.

## Components

- `ChipCountSheet.tsx` — the state machine above; auto-capture with manual override; second-angle prompt.
- `ChipCountReview.tsx` — flagged denom's **⚠ check** steps through its flagged stacks in the editor;
  the existing +/− stepper stays as a fallback for denoms without per-stack crops.
- **NEW `ChipSeamEditor.tsx`** — zoomed crop, draggable end-caps, evenly-spaced seam lines, tap add/remove,
  live count, done.
- `i18n.ts` — new en/de strings (tilt-more, second-angle, seam-edit hints, barrels tip).

## Error handling / degradation

| Failure | Behaviour |
|---|---|
| Tilt sensor denied/absent | Auto-capture off; manual shutter; second angle via a manual "shoot another angle" button. |
| Detection fails | Existing `countWholeVoted` fallback; those denoms have no crop → +/− stepper only (no editor). |
| Model seam positions garbage | Editor still correct via even-spacing from `span` + `count`. |
| Shot-2 read fails / times out | Keep shot-1 result, leave the stack flagged, fall through to the editor. |

Net: never worse than the current single-shot flow.

## Cost

- Easy photo (all confident): 1 detect + 2 reads (`SAMPLES` 3→2) ≈ **3 calls** (cheaper than today's ~4).
- Hard photo: + shot 2 reading the flagged subset only ≈ **5–6 calls**, paid only when a stack is unsure.
- Seam editing: **0 calls** (on-device).
- Guardrail documented so future edits don't silently re-inflate the call count.

## Testing

- `node --experimental-strip-types` unit tests:
  - `seamLines(span, count)` — positions, and tap add/remove transitions.
  - `fuseAngles` — vote merge, and the merged-seam case (shot 2 higher/agreed wins).
  - `fuseStack` — parity with the current inline fusion (refactor must not change outputs).
- Camera / DOM: manual on-device (APK) + dev-preview against a static image feed. Existing
  `distribution.test.ts` untouched.

## Open questions (resolve during planning)

- Exact steeper-band angles for shot 2 (start 30–45°; tune on-device).
- Whether the second-angle prompt should also be reachable manually from review (e.g. user unhappy with
  a confident-but-wrong stack) — likely yes, low cost.
- `frameHasContent()` threshold tuning (avoid false "empty table" on dark chips / dark surfaces).
