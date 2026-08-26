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
 * The fix is on the receiving side, where it costs nothing: hold a DISPLAYED count
 * per denomination and walk it toward whatever the phone last said, a few chips
 * every `GLIDE_STEP_MS`. Each step is one ordinary height change, so the existing
 * chip-drop animation plays per chip and the pile is fed a steady stream instead of
 * a lump. The target is re-read on every step, so a drag that is still moving is
 * followed rather than replayed.
 *
 * Deliberately NOT used on the phone: there the slider is local and instant, and
 * inserting a glide would only put lag where there was none.
 */

/** How often the displayed spread takes a step toward the real one. */
export const GLIDE_STEP_MS = 55;
/**
 * Steps a change is spread over — the budget, not a fixed cost: a one-chip change
 * still lands in one step, because the stride is the remainder divided by the steps
 * left (see `glideStep`).
 *
 * Ten steps at 55ms is 550ms, deliberately just under `MIN_GAP_MS` (lib/pushPacing).
 * A big change then takes almost exactly as long to walk in as it takes the next one
 * to arrive, so a finger dragging the slider keeps the pile in continuous motion
 * rather than moving it in visible bursts with a pause between them.
 */
export const GLIDE_STEPS = 10;
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
 * One step of the walk from `shown` toward `target`.
 *
 * `stepsLeft` is how many steps this change is still allowed to take, and the stride
 * is whatever divides the remainder into that many — so the walk moves at a CONSTANT
 * speed and lands exactly on time. Dividing the remainder by a fixed number instead
 * eases out, which sounds nicer and is not: the last few chips then trickle in one
 * per tick and a 40-chip change takes two and a half push-gaps to finish, so a hard
 * drag of the slider falls further behind the longer it goes on.
 *
 * Returns `shown` ITSELF when there is nothing left to do, so the caller can stop
 * its timer on identity rather than by comparing maps.
 *
 * Only denominations the target knows about survive: a pile that has left the plan
 * is a whole column going, which the column flow animates on its own (see
 * lib/columnFlow) — dragging its chips down to zero first would fold an empty
 * column away instead of a pile of chips.
 */
export function glideStep(
  shown: Record<string, number>,
  target: Record<string, number>,
  stepsLeft: number = GLIDE_STEPS,
): Record<string, number> {
  const out: Record<string, number> = {};
  let moved = false;
  let sameShape = true;
  for (const id of Object.keys(target)) {
    const want = target[id] ?? 0;
    const have = shown[id] ?? 0;
    if (!(id in shown)) sameShape = false;
    if (have === want) {
      out[id] = want;
      continue;
    }
    const delta = want - have;
    const stride = Math.min(Math.abs(delta), Math.max(1, Math.ceil(Math.abs(delta) / Math.max(1, stepsLeft))));
    out[id] = have + Math.sign(delta) * stride;
    moved = true;
  }
  // A denomination that dropped out of the target is a column leaving, not a step.
  if (!moved && sameShape && Object.keys(shown).length === Object.keys(out).length) return shown;
  return out;
}

/** The cheapest thing that changes iff the spread changed. */
function signatureOf(counts: Record<string, number>): string {
  const ids = Object.keys(counts).sort();
  let sig = '';
  for (const id of ids) sig += `${id}:${counts[id]}|`;
  return sig;
}

/**
 * The spread to actually draw: `target`, walked toward a chip at a time.
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
  const timer = useRef<number | null>(null);
  const started = useRef(false);
  /** Steps this change may still take. Reset by every new target, so a slider that
   *  keeps moving keeps getting a full budget instead of crawling to a halt. */
  const stepsLeft = useRef(GLIDE_STEPS);
  const sig = signatureOf(target);

  useEffect(() => {
    const stop = () => {
      if (timer.current !== null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
    const snap = () => {
      stop();
      shownRef.current = targetRef.current;
      setShown(targetRef.current);
    };

    // Not gliding here, or nothing to glide from, or so far behind that stepping
    // would be a crawl rather than a movement.
    if (!enabled || !started.current || glideDistance(shownRef.current, targetRef.current) > GLIDE_MAX_LAG) {
      started.current = true;
      snap();
      return;
    }
    stepsLeft.current = GLIDE_STEPS;
    // Already walking: the timer re-reads the target every step, so a new one needs
    // no new timer — starting a second would double the speed of the drag.
    if (timer.current !== null) return;

    timer.current = window.setInterval(() => {
      const next = glideStep(shownRef.current, targetRef.current, stepsLeft.current);
      stepsLeft.current = Math.max(1, stepsLeft.current - 1);
      if (next === shownRef.current) {
        stop();
        return;
      }
      shownRef.current = next;
      setShown(next);
    }, GLIDE_STEP_MS);
    // `sig` is what actually changed; `target` is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  return enabled ? shown : target;
}
