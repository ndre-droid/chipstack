import { useEffect, useRef, useState } from 'react';

/**
 * The life of one disc in a stack that is allowed to move.
 *
 * 'in'   — it has just been added: it starts above the pile, invisible, and falls in.
 * 'idle' — it is part of the pile and stays put.
 * 'out'  — it has just been taken away: it lifts off the pile and fades out. It is
 *          still in the list (and still drawn) until its animation has run.
 */
export type DiscState = 'in' | 'idle' | 'out';

export interface Disc {
  /** Position in the pile, 0 = bottom. */
  i: number;
  state: DiscState;
}

/** How long one chip takes to land, and to leave again. Mirrored in styles.css. */
export const DROP_IN_MS = 420;
export const DROP_OUT_MS = 240;
/** Gap between two neighbouring chips, so a pile builds instead of blinking. */
export const DROP_STAGGER_MS = 45;
/** A whole stack should never take longer than this to build, however tall it is. */
const MAX_SEQUENCE_MS = 620;

/**
 * How far into its fall a chip touches down. The rest of the animation is the chip
 * bouncing on its own edge, so this — not the end of the animation — is the moment
 * the pile underneath has to react.
 */
export const IMPACT_AT = 0.64;
export const IMPACT_MS = Math.round(DROP_IN_MS * IMPACT_AT);
/** How long a knock takes to travel down one chip of the pile. */
const SHOCK_STEP_MS = 26;
/** Below this many chips down, a landing is no longer felt. */
const SHOCK_DEPTH = 3;

/** Stagger for the chip at `i`, given the run of chips moving with it. */
export function dropDelay(i: number, from: number, to: number, reverse: boolean): number {
  const n = Math.max(1, to - from);
  const step = Math.min(DROP_STAGGER_MS, MAX_SEQUENCE_MS / n);
  const rank = reverse ? to - 1 - i : i - from;
  return Math.round(rank * step);
}

/**
 * A real chip is not stacked dead straight, and two chips in a pile are never at the
 * same angle. Each one gets a small alternating tilt and a hair of side-shift, fixed
 * per position so a chip does not jump when the pile around it changes.
 */
export function chipTilt(i: number): { deg: number; shift: number } {
  const sign = i % 2 === 0 ? -1 : 1;
  // Multipliers coprime with the moduli, so the angles scatter down the pile instead
  // of climbing in step with the index.
  return {
    deg: sign * (1.3 + ((i * 73) % 11) / 10),
    shift: sign * (0.25 + ((i * 41) % 7) / 12),
  };
}

/** What one disc does during a change: when it moves, and when it is struck. */
export interface DiscMotion extends Disc {
  /** Milliseconds after the change begins that this chip starts moving. */
  delay: number;
  /** When this disc takes a knock from above, or null if nothing lands on it. */
  impactAt: number | null;
  /** Chips between the landing and this one. 0 = the chip that landed. */
  depth: number;
}

/**
 * Turn the list of discs into the timing every one of them needs.
 *
 * A landing chip carries its own touchdown; the chips under it take the knock a
 * moment later, weaker the further down it travels, which is what makes the pile
 * read as a stack of solid objects rather than a row of sprites.
 */
export function discMotions(discs: Disc[]): DiscMotion[] {
  const moving = (s: DiscState) => discs.filter((d) => d.state === s).map((d) => d.i);
  const landing = moving('in');
  const leaving = moving('out');
  const firstLanding = landing.length ? Math.min(...landing) : null;
  const lastLanding = landing.length ? Math.max(...landing) + 1 : 0;
  const outFrom = leaving.length ? Math.min(...leaving) : 0;
  const outTo = leaving.length ? Math.max(...leaving) + 1 : 0;

  return discs.map((d) => {
    if (d.state === 'in') {
      const delay = dropDelay(d.i, firstLanding ?? 0, lastLanding, false);
      return { ...d, delay, impactAt: delay + IMPACT_MS, depth: 0 };
    }
    if (d.state === 'out') {
      return { ...d, delay: dropDelay(d.i, outFrom, outTo, true), impactAt: null, depth: 0 };
    }
    // Sitting still — but the first chip of the run lands on the pile it is part of.
    if (firstLanding === null) return { ...d, delay: 0, impactAt: null, depth: 0 };
    const depth = firstLanding - d.i;
    if (depth < 1 || depth > SHOCK_DEPTH) return { ...d, delay: 0, impactAt: null, depth: 0 };
    return { ...d, delay: 0, impactAt: IMPACT_MS + depth * SHOCK_STEP_MS, depth };
  });
}

/** How hard a knock lands, this far down the pile: a shove in px and a squash. */
export function impactStrength(depth: number, size: number): { jolt: number; squash: number } {
  const fade = 1 + depth * 1.15;
  return {
    jolt: Math.round(((size * 0.03) / fade) * 100) / 100,
    squash: Math.round((1 - 0.042 / fade) * 1000) / 1000,
  };
}

/** A pile that is simply there — nothing moving. */
export const idleDiscs = (count: number): Disc[] => Array.from({ length: count }, (_, i) => ({ i, state: 'idle' as const }));

const idleList = idleDiscs;

/**
 * Track a stack whose height changes, and say which of its chips are landing, sitting
 * still, or leaving right now.
 *
 * Chips are only ever added or removed at the top, so the moving ones are the range
 * between the old height and the new one: growing from 4 to 7 lands chips 4, 5, 6 one
 * after the other and leaves 0-3 alone; shrinking does the same in reverse. Every
 * change re-arms one settle timer that puts the list back to plain 'idle' — dragging a
 * slider therefore can't pile timers up or strand a chip mid-air.
 */
export function useStackDiscs(count: number, animate: boolean, visit = 0): Disc[] {
  // A stack that may move is built rather than found: it starts empty, so opening the
  // screen drops the whole spread in instead of revealing it already stacked.
  const [discs, setDiscs] = useState<Disc[]>(() =>
    animate ? Array.from({ length: count }, (_, i) => ({ i, state: 'in' as const })) : idleList(count),
  );
  const prev = useRef(animate ? 0 : count);
  const seenVisit = useRef(visit);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Opening the tab again builds the pile from nothing, whatever it held before.
    const reopened = seenVisit.current !== visit;
    seenVisit.current = visit;
    const from = reopened ? 0 : prev.current;
    prev.current = count;
    if (timer.current !== null) clearTimeout(timer.current);

    if (!animate || from === count) {
      setDiscs(idleList(count));
      timer.current = null;
      return;
    }

    if (count > from) {
      setDiscs(
        Array.from({ length: count }, (_, i) => ({ i, state: i >= from ? ('in' as const) : ('idle' as const) })),
      );
    } else {
      setDiscs((cur) => {
        const kept = idleList(count);
        const leaving: Disc[] = [];
        for (let i = count; i < from; i++) if (cur.some((d) => d.i === i)) leaving.push({ i, state: 'out' });
        return [...kept, ...leaving];
      });
    }

    const settleIn = (count > from ? DROP_IN_MS : DROP_OUT_MS) + MAX_SEQUENCE_MS;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setDiscs(idleList(count));
    }, settleIn);
  }, [count, animate, visit]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return discs;
}
