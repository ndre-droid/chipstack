import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { firebaseConfigured } from './firebaseConfig';

/**
 * Mounted once at the app root. Whenever this phone is connected to a TV as the
 * host (Table -> Connect to TV), pushes the latest players, rebuys, blinds and
 * inventory to the cloud a moment after any change — regardless of which screen
 * is open, so the TV stays current even while the phone is used for something
 * else. The TV owns the session document; the host only merges its data in. The
 * Firebase SDK is only dynamically imported once a session actually exists, so it
 * never costs anything for users who don't use this feature.
 */
export function useLiveHostSync() {
  const { state } = useStore();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const timer = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // TV look & behaviour the host flips from the remote (design, timer length,
  // players/quips toggles) push IMMEDIATELY so the big screen reacts at once —
  // these are discrete taps, not rapid typing, so there's nothing to debounce.
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    import('./liveSession')
      .then(({ hostPushData }) => hostPushData(liveSessionCode, stateRef.current))
      .catch(() => {
        /* offline or transient — a later change retries */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveSessionCode,
    liveSessionRole,
    state.settings.minutesPerLevel,
    state.settings.skin,
    state.settings.tvSkin,
    state.settings.accents,
    state.settings.tvQuips,
    state.settings.tvCustomQuips,
    state.settings.tvShowPlayers,
    state.settings.tvShowPayouts,
    state.settings.tvShowBustOrder,
    state.settings.breakMinutes,
    state.settings.breakEvery,
  ]);

  // Bulk data that changes by typing (names, buy-ins, blinds, inventory) or is
  // large (the background photo) is debounced so we don't write on every keystroke.
  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      import('./liveSession')
        .then(({ hostPushData }) => hostPushData(liveSessionCode, stateRef.current))
        .catch(() => {
          /* offline or transient error — the next change will retry */
        });
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveSessionCode,
    liveSessionRole,
    state.denominations,
    state.session,
    state.ledger,
    state.settings.currency,
    state.settings.unitValue,
    state.settings.tvBackground,
    state.settings.tvBackgroundFocus,
    state.settings.tvBackgroundTone,
  ]);
}
