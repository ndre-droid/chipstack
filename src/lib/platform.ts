/**
 * Which shell the app is running in.
 *
 * Capacitor injects a global `Capacitor` object into the native WebView, so this can
 * be answered synchronously — importing `@capacitor/core` would be async and would
 * pull the plugin bridge into the web bundle for no reason.
 */
type HapticsPlugin = {
  vibrate?: (options: { duration: number }) => Promise<void> | void;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  /** the plugin bridge the native shell injects; absent in a browser */
  Plugins?: { Haptics?: HapticsPlugin };
};

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
 * The plugin that actually shakes the phone, or undefined outside the native shell.
 *
 * `navigator.vibrate()` is the obvious way to do this and it is a LIE in an Android
 * WebView: the method exists, it is callable, it returns, and nothing ever moves —
 * the Vibration API is not wired up there the way it is in Chrome. No error and no
 * console warning, which is how every haptic in this app went unnoticed-dead for
 * months. So on the phone we go through Capacitor's Haptics plugin, which talks to
 * `Vibrator` directly; the web path stays as the fallback because it does work in a
 * real browser (and the manifest still needs `android.permission.VIBRATE` either way).
 */
function haptics(): HapticsPlugin | undefined {
  try {
    const c = cap();
    if (c?.isNativePlatform?.() !== true) return undefined;
    return c.Plugins?.Haptics;
  } catch {
    return undefined;
  }
}

/** Which path a buzz would take right now — for the "test the buzz" button. */
export function hapticBackend(): 'native' | 'web' | 'none' {
  if (haptics()?.vibrate) return 'native';
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? 'web' : 'none';
}

/**
 * A short buzz for something that just happened — a rebuy landing, a level change,
 * a player busting. Silent by design (the app never makes noise), and a no-op on
 * hardware that can't do it.
 *
 * An array is a pattern in the `navigator.vibrate` sense: buzz, pause, buzz. The
 * plugin has no pattern call, so the odd entries become timers.
 */
export function haptic(pattern: number | number[] = 12) {
  const plugin = haptics();
  if (plugin?.vibrate) {
    const phases = Array.isArray(pattern) ? pattern : [pattern];
    const fire = (ms: number) => {
      try {
        void Promise.resolve(plugin.vibrate?.({ duration: ms })).catch(() => {});
      } catch {
        /* the bridge went away mid-buzz */
      }
    };
    let at = 0;
    for (let i = 0; i < phases.length; i++) {
      const ms = Math.max(0, Math.round(phases[i]));
      // even entries buzz, odd ones are the silence between
      if (i % 2 === 0 && ms > 0) {
        if (at === 0) fire(ms);
        else setTimeout(() => fire(ms), at);
      }
      at += ms;
    }
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
