import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useStore } from '../store';
import { firebaseConfigured } from './firebaseConfig';
import { backgroundOf, backgroundSignature, liveSignature } from './liveData';
import {
  cancelLiveSync,
  getLiveSyncState,
  queueBackground,
  queueData,
  subscribeLiveSync,
  type LiveSyncState,
} from './liveSyncQueue';

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
 * The write itself goes through `liveSyncQueue`, which retries failures and exposes
 * the outcome — a dropped push used to be swallowed and lost until an app reload.
 * The Firebase SDK is only dynamically imported once there is something to send, so
 * it costs nothing for users who never pair a TV.
 */
export function useLiveHostSync() {
  const { state } = useStore();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const timer = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const hosting = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;
  // A cheap string that changes iff something the TV mirrors changes. Debounced so
  // rapid edits (typing a name, dragging the stack slider) collapse into one write.
  /* Memoised on the state object: the store hands out a new one per dispatch, so
     this serialises the ledger once per actual change instead of once per render
     of the whole app. */
  const sig = useMemo(() => (hosting ? liveSignature(state) : ''), [hosting, state]);
  // The background photo has its own document and its own signature: it is orders
  // of magnitude bigger than the rest, so it must only go out when it changed.
  const bgSig = useMemo(() => (hosting ? backgroundSignature(state) : ''), [hosting, state]);

  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    if (timer.current) window.clearTimeout(timer.current);
    // The queue is handed a getter, not a snapshot, so a retry sends the state as
    // it is at that moment rather than replaying whatever it was when this fired.
    timer.current = window.setTimeout(() => queueData(liveSessionCode, () => stateRef.current), 150);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, liveSessionCode, liveSessionRole]);

  // The photo is pushed on its own, and only when it actually changed.
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    queueBackground(liveSessionCode, () => backgroundOf(stateRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgSig, liveSessionCode, liveSessionRole]);

  // Left the session (or never in one): drop anything still queued, so a retry can
  // never land on a session this device has walked away from. Keyed on the CODE, not
  // the role — the TV writes the clock through the same queue, so cancelling merely
  // because this device isn't the host would throw away its pending commands.
  useEffect(() => {
    if (liveSessionCode) return;
    cancelLiveSync();
  }, [liveSessionCode]);
}

/** Live view of the outbound queue — drives the sync line on the Table tab. */
export function useLiveSyncStatus(): LiveSyncState {
  return useSyncExternalStore(subscribeLiveSync, getLiveSyncState, getLiveSyncState);
}
