import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { firebaseConfigured } from './firebaseConfig';

/**
 * Mounted once at the app root. Whenever this device is hosting a Live
 * Session (Settings -> Live Session -> Start), pushes the latest players,
 * rebuys, blinds and inventory to the cloud a moment after any change —
 * regardless of which screen is open, so the TV stays current even while
 * the phone is being used for something else. The Firebase SDK is only
 * dynamically imported once a Live Session actually exists, so it never
 * costs anything for users who don't use this feature.
 */
export function useLiveHostSync() {
  const { state } = useStore();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || liveSessionRole !== 'host' || !liveSessionCode) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      import('./liveSession')
        .then(({ hostPushData }) => hostPushData(liveSessionCode, state))
        .catch(() => {
          /* offline or transient error — the next change will retry */
        });
    }, 700);
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
  ]);
}
