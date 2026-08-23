import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> | void };

/**
 * Keep the screen awake while `active`.
 *
 * A wake lock is NOT permanent: the browser releases it the moment the document is
 * hidden — switching apps, another tab — and never hands it back on return. Without
 * the re-request on `visibilitychange` the screen goes to sleep mid-game, which is
 * exactly when nobody is touching the device.
 *
 * Used by the big screen (always) and by the Table tab while the blind clock runs,
 * so a phone propped up on the table behaves like the TV does.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: Sentinel | null = null;
    let stopped = false;

    const req = async () => {
      if (stopped || document.hidden || lock) return;
      try {
        const api = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<Sentinel> } }).wakeLock;
        lock = (await api?.request('screen')) ?? null;
        // the browser can drop it on its own; forget ours so the next wake re-asks
        (lock as unknown as { addEventListener?: (t: string, f: () => void) => void })?.addEventListener?.(
          'release',
          () => {
            lock = null;
          },
        );
      } catch {
        /* not supported, or refused while hidden */
      }
    };

    const onVisible = () => {
      if (document.hidden) lock = null;
      else void req();
    };

    void req();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        void lock?.release();
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}
