import { isNative } from './platform';

/**
 * The big screen without Android's own furniture around it.
 *
 * In a browser the way to lose the chrome is the Fullscreen API (lib/fullscreen.ts).
 * Inside the APK that API is a half-truth: the WebView grants it, the element fills
 * the WebView — and the status bar at the top and the gesture strip at the bottom
 * belong to the WINDOW, not the page, so they stay exactly where they were. A phone
 * propped up as the table's screen keeps a clock, a battery icon and a white pill
 * across the poker table.
 *
 * The window is the activity's to hide, so a four-method plugin does it natively
 * (android/.../ImmersivePlugin.java): `hide(systemBars())` with the transient-swipe
 * behaviour, so a swipe from the edge still brings them back for a moment and they
 * go away again on their own. Everything here is best-effort — off the phone, and in
 * an older APK that has no such plugin, it is a no-op and the browser fullscreen
 * path is still the one doing the work.
 */
type ImmersivePlugin = {
  enter?: () => Promise<void> | void;
  exit?: () => Promise<void> | void;
};

const bridge = (): ImmersivePlugin | undefined => {
  try {
    if (!isNative()) return undefined;
    return (globalThis as unknown as { Capacitor?: { Plugins?: { Immersive?: ImmersivePlugin } } })
      .Capacitor?.Plugins?.Immersive;
  } catch {
    return undefined;
  }
};

/** True where hiding the system bars is actually on offer. */
export function immersiveAvailable(): boolean {
  return !!bridge()?.enter;
}

/** Hide (or give back) the status bar and the navigation bar. */
export function setImmersive(on: boolean): void {
  const p = bridge();
  if (!p) return;
  try {
    const r = on ? p.enter?.() : p.exit?.();
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
  } catch {
    /* an older shell without the plugin — the page simply keeps the bars */
  }
}
