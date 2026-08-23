/**
 * Which shell the app is running in.
 *
 * Capacitor injects a global `Capacitor` object into the native WebView, so this can
 * be answered synchronously — importing `@capacitor/core` would be async and would
 * pull the plugin bridge into the web bundle for no reason.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

const cap = (): CapacitorGlobal | undefined =>
  (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

/** True inside the Android APK, false in a browser or an installed PWA. */
export function isNative(): boolean {
  try {
    return cap()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** 'android' | 'ios' | 'web' */
export function platform(): string {
  try {
    return cap()?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

/**
 * A short buzz for something that just happened — a rebuy landing, a level change,
 * a player busting. Silent by design (the app never makes noise), and a no-op on
 * hardware or browsers that don't support it.
 */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
