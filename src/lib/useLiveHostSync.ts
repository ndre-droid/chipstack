import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useStore } from '../store';
import { firebaseConfigured } from './firebaseConfig';
import { backgroundOf, backgroundSignature, liveSignature } from './liveData';
import { pushDelay } from './pushPacing';
import {
  cancelLiveSync,
  flushLiveSync,
  getLiveSyncState,
  queueBackground,
  queueData,
  subscribeLiveSync,
  type LiveSyncState,
} from './liveSyncQueue';

/**
 * A big screen beats every 25 seconds. One that has been silent for longer than this
 * and then speaks again is a screen that was just (re)opened — the link typed into a
 * TV browser, a reload, a set-top box waking up — and what it is showing right now is
 * whatever the session document has been carrying since the last time anybody played.
 * That is the "it opened on a very old session" bug: the phone had nothing new to
 * say, so it said nothing, and the TV sat on last week's table until the user hit
 * Push by hand.
 */
const TV_RESTART_GAP_MS = 60_000;

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
  /** When the last game-data write actually went out, so a burst can be paced. */
  const lastPush = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const hosting = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;
  // A cheap string that changes iff something the TV mirrors changes. Paced, so a
  // burst of edits (typing a name, dragging the stack slider) becomes a steady
  // trickle of writes rather than one write per keystroke.
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
    /* Paced, not collapsed — see lib/pushPacing. The first change of a burst leaves
       immediately and the rest are spaced out, so the big screen follows the chip-mix
       slider as it is dragged instead of jumping once the finger lifts. The last
       change always lands: one inside the gap waits for the gap, it is not dropped.
       (Deliberately NOT skipped when no TV is listening — a phone cannot reliably
       tell "no TV" from "TV briefly offline", and a skipped push would leave the big
       screen stale when it comes back. Correctness beats the quota.) */
    const send = () => {
      lastPush.current = Date.now();
      queueData(liveSessionCode, () => stateRef.current);
    };
    timer.current = window.setTimeout(send, pushDelay(lastPush.current, Date.now()));
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

  /* Answer a big screen that has just turned up.
     The host pushes on CHANGE, which is exactly the wrong trigger for "a TV joined":
     nothing about this phone changed, so nothing went out, and the screen showed
     whatever was in the document. Two things now count as "it needs the table":
     the document holding no data at all (a screen that just claimed the code), and a
     TV heartbeat arriving after a long silence (a screen that was just opened). */
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    const code = liveSessionCode;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let lastBeat = 0; // the server stamp we last saw
    let lastBeatAt = 0; // …and when, on THIS device's clock (no skew to reason about)

    const pushNow = () => {
      lastPush.current = Date.now();
      queueData(code, () => stateRef.current);
      flushLiveSync();
    };

    void import('./liveSession')
      .then(({ subscribeSession }) => {
        if (cancelled) return;
        unsub = subscribeSession(code, (doc) => {
          if (doc.data == null) {
            // advertising a code and holding nothing — fill it in at once
            pushNow();
            return;
          }
          const beat = doc.tvSeenAt?.toMillis?.() ?? 0;
          if (!beat || beat === lastBeat) return;
          const now = Date.now();
          const silence = lastBeatAt === 0 ? Number.POSITIVE_INFINITY : now - lastBeatAt;
          lastBeat = beat;
          lastBeatAt = now;
          if (silence > TV_RESTART_GAP_MS) pushNow();
        });
      })
      .catch(() => {
        /* the live-sync chunk is fetched on demand; without it the ordinary
           change-driven push is still in place */
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSessionCode, liveSessionRole]);

  /* Coming back to the phone is the other moment the TV may be behind: Android can
     freeze or discard a backgrounded tab mid-write, and the queue's own
     visibility hook can only re-send what is still pending — it cannot know about a
     write that was dropped on the floor. Re-sending the current state costs one
     write and removes a whole class of "I had to press Push". */
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    const code = liveSessionCode;
    const wake = () => {
      if (document.hidden) return;
      lastPush.current = Date.now();
      queueData(code, () => stateRef.current);
      flushLiveSync();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [liveSessionCode, liveSessionRole]);

  /* Say "still here" on a slow interval. A table where nothing happens for ten
     minutes (no rebuy, no count, clock running on the TV) sends no data at all, and
     without this the big screen could not tell that from a phone Android had quietly
     discarded. A dropped beat is not worth retrying — the next one is 45s away. */
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    let stopped = false;
    const beat = () =>
      import('./liveSession')
        .then(({ hostHeartbeat }) => {
          if (!stopped) return hostHeartbeat(liveSessionCode);
        })
        .catch(() => {
          /* offline — the next beat, or the next real push, covers it */
        });
    const id = window.setInterval(beat, 45000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [liveSessionCode, liveSessionRole]);

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
