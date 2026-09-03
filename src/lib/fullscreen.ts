/**
 * Fullscreen, on the browsers the big screen actually runs on.
 *
 * The standard API is `Element.requestFullscreen`, and a TV browser or desktop
 * Chrome has it. Safari — iPad included — still only ships the WebKit-prefixed
 * pair, so a big screen on a tablet was offered no fullscreen at all: the whole
 * feature was gated on the unprefixed name existing. Everything here is
 * best-effort by design; a device with neither (an iPhone-class WebKit, an old
 * set-top) simply reports `false` and the button is not offered.
 */

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

/** Both spellings of the change event — listening to both is harmless. */
export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FsDocument;
  const root = document.documentElement as FsElement;
  if (doc.fullscreenEnabled === false && !root.webkitRequestFullscreen) return false;
  return !!root.requestFullscreen || !!root.webkitRequestFullscreen;
}

export function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FsDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function enterFullscreen(el: HTMLElement = document.documentElement): void {
  const target = el as FsElement;
  try {
    const p = target.requestFullscreen ? target.requestFullscreen() : target.webkitRequestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* refused (no gesture, or a browser that only pretends to have the API) */
  }
}

export function exitFullscreen(): void {
  const doc = document as FsDocument;
  try {
    const p = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * An iOS/iPadOS browser that is NOT already running as a home-screen app.
 *
 * This is the one case where fullscreen genuinely cannot be granted from script,
 * so the big screen says what does work instead: install it to the home screen,
 * where iOS runs it chromeless (`display: standalone`).
 *
 * iPadOS 13+ reports a Mac user agent, so the platform string alone is not
 * enough — a touch-capable "Mac" is an iPad.
 */
export function isIosBrowserChrome(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOsUa = /iPad|iPhone|iPod/.test(ua);
  const iPadAsMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  if (!iOsUa && !iPadAsMac) return false;
  const standalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false);
  return !standalone;
}
