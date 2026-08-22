import { useEffect, useState, useSyncExternalStore } from 'react';
import { initialClock, secondsLeft, type ClockState } from './clockLogic';

/**
 * The phone's OWN blind clock — the one on the Table tab when this device is not
 * hosting a live session.
 *
 * It lives outside React on purpose. It used to be `useState` inside `TableScreen`,
 * and `App` remounts the screen on every tab change (`<main key={view}>`), so
 * walking over to the Plan tab and back silently reset the level and the countdown
 * to zero — and the timer stopped running in between. A module-level clock survives
 * both, and because the state is the deadline-based `ClockState` the phone's clock
 * and the big screen speak exactly the same language.
 *
 * Nothing here talks to the cloud: while hosting, the TV owns the clock and this
 * module is not used at all.
 */

let clock: ClockState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getLocalClock(): ClockState {
  if (!clock) clock = initialClock(20);
  return clock;
}

/** First read wins the per-level length; later calls leave a running clock alone. */
function ensure(minutesPerLevel: number): ClockState {
  if (!clock) clock = initialClock(minutesPerLevel);
  return clock;
}

export function setLocalClock(next: ClockState): void {
  if (next === clock) return;
  clock = next;
  emit();
}

export function subscribeLocalClock(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Roll the clock forward over deadlines that passed while nobody was looking —
 * the tab was on another screen, the phone was in a pocket. Levels are advanced
 * from the deadline they actually expired at, not from "now", so a clock that was
 * away for 35 minutes lands mid-level rather than restarting one.
 *
 * Returns true when the level changed, so the caller can buzz once.
 */
export function catchUpLocalClock(maxIdx: number): boolean {
  const c = getLocalClock();
  if (!c.running || c.periodEndsAt == null) return false;
  const durMs = Math.max(1, c.minutesPerLevel) * 60_000;
  let cur = c;
  let advanced = false;
  while (cur.running && cur.periodEndsAt != null && cur.periodEndsAt <= Date.now()) {
    if (cur.levelIdx < maxIdx) {
      cur = { ...cur, levelIdx: cur.levelIdx + 1, remaining: durMs / 1000, periodEndsAt: cur.periodEndsAt + durMs };
      advanced = true;
    } else {
      // last level ran out: stop rather than loop forever
      cur = { ...cur, running: false, periodEndsAt: null, remaining: 0 };
      advanced = true;
    }
  }
  if (cur !== c) setLocalClock(cur);
  return advanced;
}

/**
 * Subscribe a component to the local clock. Repaints once a second while running
 * (the state itself doesn't change between ticks — the countdown is derived from
 * the deadline), catches up when the tab comes back, and buzzes on a level change.
 */
export function useLocalClock(
  minutesPerLevel: number,
  maxIdx: number,
  enabled = true,
): { clock: ClockState; seconds: number } {
  ensure(minutesPerLevel);
  const state = useSyncExternalStore(subscribeLocalClock, getLocalClock, getLocalClock);
  const [, repaint] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const step = () => {
      if (catchUpLocalClock(maxIdx)) {
        try {
          navigator.vibrate?.(400);
        } catch {
          /* ignore */
        }
      }
      repaint((n) => n + 1);
    };
    step();
    if (!state.running) return;
    const id = window.setInterval(step, 1000);
    const onWake = () => {
      if (!document.hidden) step();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [state.running, maxIdx, enabled]);

  return { clock: state, seconds: secondsLeft(state) };
}
