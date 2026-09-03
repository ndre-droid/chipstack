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
 * A touch device standing in for the TV — in practice a tablet propped on the table.
 *
 * It matters because the boost below is about VIEWING DISTANCE, not pixels, and a
 * tablet lies between the two cases the sizing was tuned for: an iPad in landscape
 * reports a laptop-sized viewport (1180x820, 1366x1024) and was therefore zoomed
 * like a laptop across the room — while it actually sits an arm's length away, so
 * the layout came out far too big. A coarse pointer with no hover is every touch
 * screen and no desktop; a TV browser is asked about first and never reaches here.
 */
export function isTouchScreen(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia;
  if (!mm) return (navigator.maxTouchPoints ?? 0) > 1;
  return mm('(pointer: coarse)').matches && mm('(hover: none)').matches;
}

/**
 * Is the panel behind this viewport a 4K one?
 *
 * A TV browser almost never hands out a 3840-wide CSS viewport: it reports a
 * 1080-class one and paints it at a device pixel ratio of 2. So the `vmin` the whole
 * layout is sized in resolves against 1080 either way, and a 4K panel gets exactly
 * the same physical letter height as a 1080p one — bigger pixels, not bigger text.
 * The panel being 4K is nevertheless a real signal about the room: nobody buys a 4K
 * set to watch it from a desk, so it is a hint that the viewer is further away.
 */
export function isUhd(): boolean {
  if (typeof window === 'undefined') return false;
  const dpr = window.devicePixelRatio || 1;
  return Math.max(window.innerWidth, window.innerHeight) * dpr >= 2800;
}

/**
 * How much painting this screen can afford per frame.
 *
 * 'lite' turns off the two things that stutter on a TV stick and cost nothing to
 * lose: the `backdrop-filter` behind every panel (a full-screen blur, recomputed
 * whenever anything above it moves) and the `drop-shadow` filter around a pile of
 * chips while its chips are moving. Both are per-frame GPU work on a chip that has
 * to fill four times as many pixels as the laptop the layout was tuned on.
 *
 * `hardwareConcurrency` is a poor proxy for a GPU and a good proxy for the class of
 * device — a set-top box reports 2 or 4, a laptop 8 or more.
 */
export function tvGpuBudget(): 'full' | 'lite' {
  if (typeof navigator === 'undefined') return 'full';
  if (isTvBrowser()) return 'lite';
  const cores = navigator.hardwareConcurrency ?? 8;
  // a 4K canvas is four times the fill rate; a weak machine driving one is 'lite'
  if (cores <= 4 || (isUhd() && cores <= 6)) return 'lite';
  return 'full';
}

/**
 * A sensible default for this device, used until the user touches the A−/A+ control.
 *
 * This went up a notch for 4K and came back down again, because the two complaints
 * are not the same complaint: "the player names are too small" is about ONE panel
 * that the fitter now solves properly, and answering it by zooming the whole screen
 * made everything else — stat tiles, legend chips, the button row — big enough to
 * crowd the picture. A real TV browser gets the layout as it was tuned, plus a
 * little for a 4K set (which sits further from the sofa and reports the same CSS
 * viewport, see `isUhd`); a laptop or monitor standing in for the TV sits much
 * closer and much smaller, so it still gets a real boost, and more as the window
 * gets shorter — a short window is where the vmin sizing collapses hardest.
 */
export function autoTvScale(): number {
  if (typeof window === 'undefined') return 1;
  // A TV browser gets the layout the sizing was tuned for. A 4K set is further from
  // the sofa than the 1080p one it replaced and reports the same CSS viewport, so it
  // gets a notch more — see `isUhd`.
  if (isTvBrowser()) return isUhd() ? 1.1 : 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  // A phone or tablet previewing TV mode is held at arm's length and gets the
  // layout close to as designed — only a laptop/monitor standing in for the TV is
  // boosted properly. A big tablet reports a laptop-sized viewport, so the touch
  // screen itself is the tell (see isTouchScreen).
  if (long < 1100 || short < 600 || isTouchScreen()) return 1.05;
  return clampTvScale(short >= 950 ? 1.2 : 1.3);
}

export function clampTvScale(n: number) {
  return Math.min(TV_SCALE_MAX, Math.max(TV_SCALE_MIN, Math.round(n * 100) / 100));
}
