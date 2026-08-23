import { useEffect, useState } from 'react';
import { initialClock, type ClockState } from './clockLogic';
import { queueClock } from './liveSyncQueue';

/**
 * The clock as seen by a HOSTING phone: the TV owns the countdown, this device
 * mirrors it and sends commands.
 *
 * It lives in a hook (rather than inside the remote panel) so the Table tab has a
 * single clock to render — the sticky bar at the top and the remote further down
 * are two views of the same state instead of two subscriptions that can disagree.
 *
 * There is deliberately no local countdown here: the value is derived from the
 * shared deadline, so a backgrounded phone that misses a hundred ticks is still
 * showing the right time the moment it wakes up.
 */
export function useHostClock(code: string | null, active: boolean): {
  clock: ClockState;
  send: (next: ClockState) => void;
} {
  const [clock, setClock] = useState<ClockState>(() => initialClock(20));
  const [, repaint] = useState(0);

  useEffect(() => {
    if (!active || !code) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    import('./liveSession')
      .then(({ subscribeSession }) => {
        if (cancelled) return;
        // The TV owns the clock; a doc may briefly exist with data but no clock (a
        // stale or dead code). Never overwrite a valid clock with undefined.
        unsub = subscribeSession(code, (doc) => {
          if (doc.clock) setClock(doc.clock);
        });
      })
      .catch(() => {
        /* offline, or the on-demand live-sync chunk didn't load — the phone keeps
           showing the clock it last saw rather than crashing the Table tab. */
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [active, code]);

  // repaint once a second so the derived countdown stays fresh; never writes state
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => repaint((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const send = (next: ClockState) => {
    setClock(next); // optimistic — the TV echoes it back a moment later
    // Queued rather than fired and forgotten: a failed command is retried instead
    // of silently leaving the TV on the old level.
    if (code) queueClock(code, next);
  };

  return { clock, send };
}
