/**
 * How big the big screen should draw itself.
 *
 * The TV layout is sized in `vmin`, tuned for a 55–65" screen seen from across
 * the room. A laptop standing in for the TV has roughly the same pixel count but
 * a quarter of the physical size, so the same layout comes out small and cramped.
 * `--tv-scale` (see `.tv` in styles.css) zooms the whole screen by one factor.
 *
 * The user can set it by hand (Settings.tvScale, per-device); `autoTvScale()` is
 * only the starting point when they haven't.
 */

export const TV_SCALE_MIN = 0.8;
export const TV_SCALE_MAX = 2;
export const TV_SCALE_STEP = 0.1;

/** Smart TV / set-top browsers, which already get the layout it was tuned for. */
const TV_UA = /web0?os|webos|smart-?tv|smarttv|hbbtv|netcast|tizen|viera|bravia|aft[bmst]|googletv|android tv|crkey/i;

export function isTvBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return TV_UA.test(ua);
}

/**
 * A sensible default for this device, used until the user touches the A−/A+ control.
 *
 * Everything here is one notch larger than it was: across a living room, the first
 * thing anyone says about the big screen is that the writing is small, and the
 * A−/A+ buttons are still there for anyone who wants it back. Even a real TV
 * browser — which gets the layout the sizing was tuned for — now starts slightly
 * over 1; a laptop or monitor standing in for the TV sits much closer and much
 * smaller, so it gets more, and more still as the window gets shorter (a short
 * window is where the vmin sizing collapses hardest).
 */
export function autoTvScale(): number {
  if (typeof window === 'undefined') return 1;
  if (isTvBrowser()) return 1.15;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  // A phone or tablet previewing TV mode is held at arm's length and gets the
  // layout close to as designed — only a laptop/monitor standing in for the TV is
  // boosted properly.
  if (long < 1100 || short < 600) return 1.1;
  return clampTvScale(short >= 950 ? 1.35 : 1.45);
}

export function clampTvScale(n: number) {
  return Math.min(TV_SCALE_MAX, Math.max(TV_SCALE_MIN, Math.round(n * 100) / 100));
}
