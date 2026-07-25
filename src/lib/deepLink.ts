import { useEffect } from 'react';

/**
 * Deep-linking so the TV's QR opens the installed ChipStack APP (with full remote
 * control), not just the web page. The QR encodes the normal https URL with `?tv=NNNN`
 * (so any camera can scan it). When that page loads on Android it hands off to the app
 * via the `chipstack://tv/NNNN` custom scheme; if the app isn't installed the web app
 * just keeps working as the host. Inside the app, @capacitor/app delivers the launch /
 * resume URL and we pull the code out of it.
 */

const CODE_RE = /^\d{4}$/;

/** Pull a 4-digit session code out of any deep-link URL we might be opened with:
 *  `https://…/chipstack/?tv=NNNN` or `chipstack://tv/NNNN` (or `chipstack://tv?tv=NNNN`). */
export function parseTvCode(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('tv');
    if (q && CODE_RE.test(q)) return q;
    // custom scheme chipstack://tv/NNNN  → host 'tv', pathname '/NNNN'
    if (u.protocol === 'chipstack:') {
      const seg = u.pathname.replace(/\//g, '') || u.host;
      if (CODE_RE.test(seg)) return seg;
    }
  } catch {
    /* not a parseable URL — fall through */
  }
  const m = url.match(/tv[/=](\d{4})\b/);
  return m ? m[1] : null;
}

/** The custom-scheme URL a web page uses to hand off into the installed app. */
export function appSchemeUrl(code: string): string {
  return `chipstack://tv/${code}`;
}

/**
 * Native only: when the app is launched or resumed from a `chipstack://` link (or the
 * https App Link), call `onCode` with the session code. No-op on the web, where the
 * plugin import is skipped entirely.
 */
export function useNativeDeepLink(onCode: (code: string) => void) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform?.()) return;
        const { App } = await import('@capacitor/app');
        const launch = await App.getLaunchUrl();
        if (active && launch?.url) {
          const c = parseTvCode(launch.url);
          if (c) onCode(c);
        }
        const sub = await App.addListener('appUrlOpen', (data) => {
          const c = parseTvCode(data.url);
          if (c) onCode(c);
        });
        cleanup = () => sub.remove();
      } catch {
        /* plugin unavailable (web) — nothing to do */
      }
    })();
    return () => {
      active = false;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
