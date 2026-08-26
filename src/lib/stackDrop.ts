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
/** A chip taken off the pile is lifted away and only fades once it is well clear. */
export const DROP_OUT_MS = 520;
/** Gap between two neighbouring chips, so a pile builds instead of blinking. */
export const DROP_STAGGER_MS = 45;
/** A whole stack should never take longer than this to build, however tall it is. */
const MAX_SEQUENCE_MS = 620;

/**
 * How far into its fall a chip touches down. The rest of the animation is the chip
 * bouncing on its own edge, so this — not the end of the animation — is the moment
 * the pile underneath has to react.
 *
 * The number is not a taste call: the whole move is one ballistic timeline. A chip
 * dropped from a standstill falls for one unit of time; ceramic on ceramic gives back
 * about a quarter of the speed it arrived with (`RESTITUTION`), so it bounces to e²
 * of the height and stays up for 2e of the time, then does it again, smaller. Adding
 * those up puts the first touchdown 57% of the way through — and `styles.css` places
 * the keyframe there, which stackDrop.test.ts checks it still does.
 */
export const RESTITUTION = 0.28;
export const IMPACT_AT = 0.57;
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

/** A chip that is currently moving, and the moment its animation is over. */
interface Flight {
  motion: DiscMotion;
  endsAt: number;
}

/** How long this chip is in the air, counting the wait before it starts. */
const flightMs = (m: DiscMotion) => m.delay + (m.state === 'in' ? DROP_IN_MS : DROP_OUT_MS);

/**
 * Track a stack whose height changes, and say which of its chips are landing, sitting
 * still, or leaving right now.
 *
 * Chips are only ever added or removed at the top, so the moving ones are the range
 * between the old height and the new one: growing from 4 to 7 lands chips 4, 5, 6 one
 * after the other and leaves 0-3 alone; shrinking does the same in reverse.
 *
 * A chip that is already in the air keeps the timing it was given: dragging the mix
 * slider changes the height again while the last change is still playing, and a chip
 * halfway through its fall must go on falling rather than being snapped onto the pile
 * and thrown again. Only chips that are genuinely new to the move are given fresh
 * timing, so a hard drag reads as a stack being fed chips instead of a stack
 * flickering. One settle timer, always re-aimed at the last chip still moving, puts
 * the pile back to plain 'idle' — so a drag can neither pile timers up nor strand a
 * chip mid-air.
 */
export function useStackDiscs(count: number, animate: boolean, visit = 0): DiscMotion[] {
  // A stack that may move is built rather than found: it starts empty, so opening the
  // screen drops the whole spread in instead of revealing it already stacked.
  const [motions, setMotions] = useState<DiscMotion[]>(() =>
    discMotions(
      animate ? Array.from({ length: count }, (_, i) => ({ i, state: 'in' as const })) : idleList(count),
    ),
  );
  const prev = useRef(animate ? 0 : count);
  const seenVisit = useRef(visit);
  const flying = useRef(new Map<number, Flight>());
  const timer = useRef<number | null>(null);
  const height = useRef(count);
  height.current = count;

  useEffect(() => {
    // Opening the tab again builds the pile from nothing, whatever it held before.
    const reopened = seenVisit.current !== visit;
    seenVisit.current = visit;
    const from = reopened ? 0 : prev.current;
    prev.current = count;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;

    if (!animate) {
      flying.current.clear();
      setMotions(discMotions(idleList(count)));
      return;
    }

    const now = Date.now();
    if (reopened) flying.current.clear();
    for (const [i, f] of flying.current) if (f.endsAt <= now) flying.current.delete(i);

    // Who is moving because of THIS change, on top of whoever is still in the air.
    const landing = new Set<number>();
    const leaving = new Set<number>();
    if (count > from) for (let i = from; i < count; i++) landing.add(i);
    else for (let i = count; i < from; i++) leaving.add(i);
    for (const [i, f] of flying.current) if (f.motion.state === 'out' && i >= count) leaving.add(i);

    const list: Disc[] = [];
    for (let i = 0; i < count; i++) list.push({ i, state: landing.has(i) ? 'in' : 'idle' });
    for (const i of [...leaving].sort((a, b) => a - b)) list.push({ i, state: 'out' });

    // Fresh timing for this move, then hand the still-flying chips back exactly the
    // timing they already had — an unchanged motion keeps its element, and an element
    // that is not replaced does not restart its animation.
    const next = discMotions(list).map((m) => {
      const f = flying.current.get(m.i);
      if (!f || f.endsAt <= now) return m;
      if (m.state === 'out' && f.motion.state === 'in') return m; // taken away mid-fall
      return f.motion;
    });

    let lastEnd = 0;
    for (const m of next) {
      if (m.state === 'idle') continue;
      const existing = flying.current.get(m.i);
      const endsAt = existing && existing.motion === m ? existing.endsAt : now + flightMs(m);
      flying.current.set(m.i, { motion: m, endsAt });
      lastEnd = Math.max(lastEnd, endsAt);
    }
    setMotions(next);

    if (lastEnd > now) {
      timer.current = window.setTimeout(() => {
        timer.current = null;
        flying.current.clear();
        setMotions(discMotions(idleList(height.current)));
      }, lastEnd - now + 30);
    }
  }, [count, animate, visit]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return motions;
}
