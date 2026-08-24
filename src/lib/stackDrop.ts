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
export const DROP_IN_MS = 300;
export const DROP_OUT_MS = 200;
/** Gap between two neighbouring chips, so a pile builds instead of blinking. */
export const DROP_STAGGER_MS = 45;
/** A whole stack should never take longer than this to build, however tall it is. */
const MAX_SEQUENCE_MS = 620;

/** Stagger for the chip at `i`, given the run of chips moving with it. */
export function dropDelay(i: number, from: number, to: number, reverse: boolean): number {
  const n = Math.max(1, to - from);
  const step = Math.min(DROP_STAGGER_MS, MAX_SEQUENCE_MS / n);
  const rank = reverse ? to - 1 - i : i - from;
  return Math.round(rank * step);
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
