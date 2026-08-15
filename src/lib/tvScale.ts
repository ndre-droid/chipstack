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
 * A sensible default for this device. A real TV browser keeps 1; anything else is
 * assumed to be a laptop or monitor sitting much closer and much smaller, and gets
 * a boost that grows as the window gets shorter (a short window is where the vmin
 * sizing collapses hardest).
 */
export function autoTvScale(): number {
  if (typeof window === 'undefined') return 1;
  if (isTvBrowser()) return 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  // A phone or tablet previewing TV mode is held at arm's length and gets the
  // layout as designed — only a laptop/monitor standing in for the TV is boosted.
  if (long < 1100 || short < 600) return 1;
  return clampTvScale(short >= 950 ? 1.25 : 1.35);
}

export function clampTvScale(n: number) {
  return Math.min(TV_SCALE_MAX, Math.max(TV_SCALE_MIN, Math.round(n * 100) / 100));
}
