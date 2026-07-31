import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { firebaseConfigured } from './firebaseConfig';
import { liveSignature } from './liveData';

/**
 * Mounted once at the app root. While this phone is the host of a Live Session
 * (Table → Connect to TV), it pushes the shared game data to the cloud a moment
 * after ANY change — regardless of which screen is open — so the TV stays current
 * even while the phone is used for something else.
 *
 * Reliability note: this deliberately reacts to a signature of the ENTIRE synced
 * slice (see `liveSignature`) rather than a hand-maintained list of dependencies.
 * The old version listed each field it cared about; any field left off the list
 * silently never reached the TV (that was the "some changes don't get pushed" bug).
 * Keying off the whole slice means a new synced field can never be forgotten.
 *
 * The Firebase SDK is only dynamically imported once a session exists, so it costs
 * nothing for users who never pair a TV.
 */
export function useLiveHostSync() {
  const { state } = useStore();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const timer = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // A cheap string that changes iff something the TV mirrors changes. Debounced so
  // rapid edits (typing a name, dragging the stack slider) collapse into one write.
  const sig = firebaseConfigured && liveSessionRole === 'host' && liveSessionCode ? liveSignature(state) : '';

  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      import('./liveSession')
        .then(({ hostPushData }) => hostPushData(liveSessionCode, stateRef.current))
        .catch(() => {
          /* offline or transient — the next change (or a manual Push) retries */
        });
    }, 150);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, liveSessionCode, liveSessionRole]);
}
