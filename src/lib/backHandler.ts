import { useEffect, useRef } from 'react';

/**
 * The Android back stack for a single-page app.
 *
 * Anything that covers the screen — a sheet, a dialog, an inline editor — registers
 * a handler while it is open. A back press runs the NEWEST handler that claims it,
 * so closing works in the order things were opened. `App.tsx` owns the last two
 * fallbacks (go back a tab, then press-again-to-exit).
 *
 * Handlers return `true` when they consumed the press. Returning `false` lets the
 * press fall through to whatever was open before it.
 */
type Handler = () => boolean;

const stack: { id: number; fn: Handler }[] = [];
let seq = 0;

/** Register a back handler. Returns the unregister function. */
export function pushBackHandler(fn: Handler): () => void {
  const id = ++seq;
  stack.push({ id, fn });
  return () => {
    const i = stack.findIndex((h) => h.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Give the newest handler that wants it a go. True = the press was consumed. */
export function runBackHandlers(): boolean {
  // iterate over a copy: a handler may unregister itself while running
  for (const h of [...stack].reverse()) {
    try {
      if (h.fn()) return true;
    } catch {
      /* a broken overlay must not swallow the back press */
    }
  }
  return false;
}

/** True while anything is registered — used only for diagnostics/tests. */
export const backHandlerCount = () => stack.length;

/**
 * Close `onBack()` when the hardware/browser back button is pressed while `active`.
 * The callback is read through a ref, so passing an inline arrow is fine.
 */
export function useBackHandler(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => {
      ref.current();
      return true;
    });
  }, [active]);
}
