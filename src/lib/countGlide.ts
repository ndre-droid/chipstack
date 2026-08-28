import { useEffect, useRef, useState } from 'react';

/**
 * Smoothing a chip spread that arrives in lumps.
 *
 * The phone's chip-mix slider moves continuously under a finger, but the big screen
 * only ever learns about it in steps: every push is a write of the whole game
 * document, paced at `MIN_GAP_MS` (see lib/pushPacing), and then a network round
 * trip on top. So the TV receives "12 chips" and, three quarters of a second later,
 * "19 chips" — seven chips appearing at once, then nothing, then five more. That is
 * what reads as lag: not the delay (a TV across the room is forgiven a beat), but
 * the stutter.
 *
 * The fix is the one every media player uses for the same problem: play the stream
 * back at the rate it arrives, one buffer behind it.
 *
 *  1. **Measure the pace.** The gap between two spreads is not the 700ms the phone
 *     aims for — it is that plus a round trip plus whatever the TV's browser was
 *     busy with, and on a set-top box that is regularly a second or more. The gap is
 *     tracked as a rolling average (`nextSpan`).
 *  2. **Spread each change over that measured gap**, a little past it (`GLIDE_LEAD`)
 *     so the pile is still moving when the next one lands. The old version walked a
 *     fixed ten steps of 55ms and then stood still until the next push arrived —
 *     motion, pause, motion, pause, which is exactly what reads as unsteady.
 *  3. **Drive it from the frame clock, not a timer.** `setInterval` on a busy TV
 *     browser does not tick late, it ticks in a burst: three missed ticks fire
 *     back-to-back and three chips land in one frame. Positions are held as
 *     FRACTIONS and advanced by real elapsed time, so a frame that arrives late
 *     moves the pile exactly as far as that delay earned and no further.
 *
 * A chip is still a whole chip: the fractional position is rounded for display, so
 * each chip appears at its own evenly-spaced moment and the existing drop animation
 * plays per chip (see lib/stackDrop). Commits are throttled to `GLIDE_COMMIT_MS` so
 * a huge change cannot ask React for sixty renders a second.
 *
 * Deliberately NOT used on the phone: there the slider is local and instant, and
 * inserting a glide would only put lag where there was none.
 */

/** What the pace is assumed to be before anything has been measured. */
export const GLIDE_START_SPAN_MS = 700;
/** Floor and ceiling for the measured pace, so one freak gap can't stall the pile. */
export const GLIDE_MIN_SPAN_MS = 380;
export const GLIDE_MAX_SPAN_MS = 1500;
/** How much of the measured gap a new reading is worth (the rest is history). */
export const GLIDE_SPAN_WEIGHT = 0.35;
/**
 * A change is spread over slightly MORE than one measured gap, so the pile is always
 * still moving when the next one arrives. Undershoot and the stack visibly stops
 * between pushes; overshoot badly and it never catches up. A tenth is enough to
 * cover ordinary jitter, and the moment the drag ends the deadline simply expires
 * and the last chips land.
 */
export const GLIDE_LEAD = 1.12;
/**
 * Shortest gap between two renders of the spread — a ceiling on React work.
 *
 * One 60Hz frame. The MOTION is not capped by this and never was: a chip's fall,
 * bounce and the knock it passes down the pile are CSS animations on `transform`,
 * which the compositor runs at whatever the panel does — 60, 120, 144. This only
 * decides how often a NEW chip may start falling, and that is bounded by the change
 * itself (a spread moving 20 chips over 800ms commits 25 times a second, nowhere
 * near this). It exists for the pathological case — a near-`GLIDE_MAX_LAG` change
 * on a 120Hz panel — where committing every frame would ask React for 120 renders a
 * second of ~90 positioned elements to no visible benefit.
 */
export const GLIDE_COMMIT_MS = 16;
/**
 * A frame this far after the last one means the screen was not drawing at all — a
 * hidden tab, a locked box, a long garbage collection. Whatever the phone said in
 * the meantime is now, so it is taken whole rather than played back from history.
 */
export const GLIDE_STALL_MS = 400;
/**
 * Past this many chips out of date the glide gives up and jumps. A whole new spread
 * (a different chip set, a rebuy re-plan, the overlay opening) is not a slider being
 * dragged, and crawling toward it a few chips at a time looks broken rather than
 * smooth.
 */
export const GLIDE_MAX_LAG = 90;

/** Total chips between two spreads — how far out of date the displayed one is. */
export function glideDistance(shown: Record<string, number>, target: Record<string, number>): number {
  let total = 0;
  for (const id of Object.keys(target)) total += Math.abs((target[id] ?? 0) - (shown[id] ?? 0));
  return total;
}

/**
 * The pace to play the next change back at, given the pace so far and how long this
 * spread actually took to arrive.
 *
 * A rolling average rather than the last gap alone: one push held up by a slow write
 * would otherwise stretch the following change to match it, and the pile would crawl
 * for a second for no reason.
 */
export function nextSpan(prev: number, gap: number, weight: number = GLIDE_SPAN_WEIGHT): number {
  const blended = prev * (1 - weight) + gap * weight;
  return Math.min(GLIDE_MAX_SPAN_MS, Math.max(GLIDE_MIN_SPAN_MS, blended));
}

/**
 * Move the fractional spread `pos` toward `target` by whatever `dt` milliseconds out
 * of the remaining `timeLeft` is worth.
 *
 * The stride is the remainder divided by the time left, which is a CONSTANT speed:
 * as the remainder shrinks so does the time, and the ratio holds. Easing toward the
 * target instead (a fixed fraction per frame) never arrives, and a slider that is
 * still moving would fall further behind the longer it is dragged.
 *
 * Only denominations the target knows about survive: a pile that has left the plan
 * is a whole column going, which the column flow animates on its own (see
 * lib/columnFlow) — dragging its chips down to zero first would fold an empty
 * column away instead of a pile of chips. A pile the target has just gained starts
 * from nothing and builds, for the same reason.
 */
export function advance(
  pos: Record<string, number>,
  target: Record<string, number>,
  dt: number,
  timeLeft: number,
): Record<string, number> {
  const frac = timeLeft <= dt ? 1 : Math.max(0, Math.min(1, dt / timeLeft));
  const out: Record<string, number> = {};
  for (const id of Object.keys(target)) {
    const want = target[id] ?? 0;
    const have = pos[id] ?? 0;
    out[id] = frac >= 1 ? want : have + (want - have) * frac;
  }
  return out;
}

/** The whole chips to actually draw for a fractional spread. */
export function roundCounts(pos: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(pos)) out[id] = Math.max(0, Math.round(pos[id]));
  return out;
}

/** Two spreads holding the same piles at the same heights. */
export function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const id of ka) if (a[id] !== b[id]) return false;
  return true;
}

/** The cheapest thing that changes iff the spread changed. */
function signatureOf(counts: Record<string, number>): string {
  const ids = Object.keys(counts).sort();
  let sig = '';
  for (const id of ids) sig += `${id}:${counts[id]}|`;
  return sig;
}

const clockNow = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * The spread to actually draw: `target`, played back at the rate it arrives.
 *
 * The first spread this hook ever sees is not a change — it is what was already
 * there — so it is adopted whole. `enabled` off hands the target straight back,
 * which is what every screen but the big one wants.
 */
export function useGlidedCounts(target: Record<string, number>, enabled: boolean): Record<string, number> {
  const [shown, setShown] = useState<Record<string, number>>(target);
  const targetRef = useRef(target);
  targetRef.current = target;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  /** Where every pile is between two whole chips. */
  const pos = useRef<Record<string, number>>(target);
  /** The measured pace of the phone, and when the last spread turned up. */
  const span = useRef(GLIDE_START_SPAN_MS);
  const lastTargetAt = useRef(0);
  /** When the change being played should be finished. */
  const deadline = useRef(0);
  const lastFrame = useRef(0);
  const lastCommit = useRef(0);
  const frame = useRef<number | null>(null);
  /** Backstop for a screen that never paints — see `armWatchdog`. */
  const watchdog = useRef<number | null>(null);
  const started = useRef(false);
  const sig = signatureOf(target);

  useEffect(() => {
    const stop = () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      if (watchdog.current !== null) {
        window.clearTimeout(watchdog.current);
        watchdog.current = null;
      }
    };
    const snap = () => {
      stop();
      pos.current = targetRef.current;
      shownRef.current = targetRef.current;
      setShown(targetRef.current);
    };

    const t = clockNow();
    /* Not gliding here at all — the phone, where the slider is local and instant.
       The target is handed straight back below, so this deliberately does NOT set
       state: doing so cost the Plan screen a second render of the whole spread on
       every step of a drag, for a value nothing reads. */
    if (!enabled) {
      stop();
      started.current = false;
      lastTargetAt.current = t;
      pos.current = targetRef.current;
      return;
    }
    // Nothing to glide from, or so far behind that stepping would be a crawl rather
    // than a movement.
    if (!started.current || glideDistance(shownRef.current, targetRef.current) > GLIDE_MAX_LAG) {
      started.current = true;
      lastTargetAt.current = t;
      snap();
      return;
    }

    // How fast the phone is actually feeding this screen, and therefore how long
    // this change has to play before the next one is due.
    if (lastTargetAt.current) span.current = nextSpan(span.current, t - lastTargetAt.current);
    lastTargetAt.current = t;
    deadline.current = t + span.current * GLIDE_LEAD;

    /* A screen that never paints never gets a frame, and a glide driven by frames
       would then sit half-finished forever — the pile showing nineteen chips under a
       caption that says nine. A hidden tab is the usual way in (the browser stops
       serving frames but keeps running timers), a heavily throttled TV browser the
       other. So: a plain timer, re-aimed at every new spread, that takes the target
       whole if the frames never came. It costs nothing when they do, because by then
       the loop has already stopped. */
    const armWatchdog = () => {
      if (watchdog.current !== null) window.clearTimeout(watchdog.current);
      watchdog.current = window.setTimeout(
        () => {
          watchdog.current = null;
          if (frame.current !== null) snap();
        },
        Math.max(0, deadline.current - clockNow()) + GLIDE_STALL_MS,
      );
    };
    armWatchdog();

    // Already playing: the loop re-reads the target and the deadline every frame, so
    // a new spread needs no new loop — a second one would double the speed.
    if (frame.current !== null) return;

    const step = (at: number) => {
      frame.current = null;
      const dt = at - lastFrame.current;
      lastFrame.current = at;
      // The screen was not drawing at all — take what the phone says now.
      if (dt > GLIDE_STALL_MS) {
        snap();
        return;
      }
      pos.current = advance(pos.current, targetRef.current, dt, deadline.current - at);
      const drawn = roundCounts(pos.current);
      const arrived = at >= deadline.current;
      if (!sameCounts(drawn, shownRef.current) && (arrived || at - lastCommit.current >= GLIDE_COMMIT_MS)) {
        lastCommit.current = at;
        shownRef.current = drawn;
        setShown(drawn);
      }
      if (arrived && sameCounts(drawn, targetRef.current)) {
        if (watchdog.current !== null) {
          window.clearTimeout(watchdog.current);
          watchdog.current = null;
        }
        return;
      }
      frame.current = requestAnimationFrame(step);
    };

    lastFrame.current = t;
    frame.current = requestAnimationFrame(step);
    // `sig` is what actually changed; `target` is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (watchdog.current !== null) window.clearTimeout(watchdog.current);
    },
    [],
  );

  return enabled ? shown : target;
}
