/**
 * Where the whole app lives on disk, and how to read it without the store.
 *
 * `store.tsx` owns the state; this owns nothing but its ADDRESS. It is a separate
 * module because the crash screen (see components/ErrorBoundary) has to be able to
 * export and park the user's data at a moment when the store is exactly what is
 * broken — importing `store.tsx` there would mean the recovery path depends on the
 * thing it is recovering from.
 *
 * The value itself is load-bearing and must never change: it, together with the
 * webview origin, IS the identity of the user's data (see the persistence notes in
 * HANDOFF.md). A new key is a new, empty app.
 */
export const STATE_KEY = 'chipstack.state.v1';

/** Where a state that would not load is parked, so "start fresh" never means "gone". */
export const CRASH_KEY_PREFIX = 'chipstack.state.crash.';

/** The raw JSON as stored, or null. Never throws — private-mode browsers deny access. */
export function readRawState(): string | null {
  try {
    return localStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}

/**
 * Move the stored state aside under a timestamped crash key and return that key.
 * The next boot therefore starts from defaults while the old state stays on the
 * device, recoverable by hand (or by the backup file the crash screen offers first).
 */
export function parkState(at = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw === null) return null;
    const key = CRASH_KEY_PREFIX + at;
    localStorage.setItem(key, raw);
    localStorage.removeItem(STATE_KEY);
    return key;
  } catch {
    return null;
  }
}
