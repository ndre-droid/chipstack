/**
 * What this screen actually is, in the numbers the layout is decided from.
 *
 * Every threshold in `windowLayout.ts` and every calibration slot in
 * `chipRuler.ts` was chosen against a Fold measured second-hand — reported
 * anywhere from 750 to 832 CSS px depending on who was describing it. A
 * passport-shaped panel is a different device again, and published spec sheets
 * describe the PHYSICAL panel, not the CSS viewport the app is handed after the
 * system bars and the browser chrome have taken their cut.
 *
 * So: read it off the device, once, and show it. Nothing here changes what the
 * app does — it only reports, so a threshold can be set from a measurement
 * instead of from a leak.
 */
import { readScreenShape, screenKeyOf } from './chipRuler.ts';

/** A viewport, as the layout code sees it. */
export interface ScreenReport {
  /** CSS pixels the page is laid out in. */
  width: number;
  height: number;
  /** Physical pixels per CSS pixel. */
  dpr: number;
  /** `width x height` in physical pixels, which is what a spec sheet quotes. */
  physical: string;
  /** Which way up, by the same test the ruler uses. */
  orientation: 'portrait' | 'landscape';
  /** width / height, 3 decimals — the number `min-aspect-ratio` compares. */
  aspect: number;
  /**
   * How many pieces the hinge cuts the viewport into, per axis.
   *
   * `1 x 1` is a flat screen: either a phone, or a foldable opened out, or a
   * browser that does not implement the Viewport Segments API at all. `1 x 2`
   * is a book-style fold held upright; `2 x 1` is one lying down. The API is
   * young enough that "no support" and "flat" are indistinguishable, which is
   * why `segmentsKnown` is reported next to it.
   */
  segments: string;
  /** Whether the browser answered the segment query at all. */
  segmentsKnown: boolean;
  /** What `windowLayout.ts` decides from the above, right now. */
  layout: string;
  panes: number;
  /** The key the ruler files a calibration under on this screen. */
  rulerSlot: string;
}

const q = (query: string): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;

/**
 * How many segments along one axis, or `null` when the browser has no opinion.
 *
 * Asked as an explicit ladder rather than by probing for support: a browser
 * that does not know the feature reports `false` for every value including
 * `1`, so "everything is false" IS the no-support answer, and no separate
 * capability check is needed.
 */
function segmentCount(axis: 'horizontal' | 'vertical'): number | null {
  for (let n = 1; n <= 3; n += 1) {
    if (q(`(${axis}-viewport-segments: ${n})`)) return n;
  }
  return null;
}

export function readScreen(): ScreenReport {
  const width = typeof window === 'undefined' ? 0 : Math.round(window.innerWidth);
  const height = typeof window === 'undefined' ? 0 : Math.round(window.innerHeight);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const cols = segmentCount('horizontal');
  const rows = segmentCount('vertical');
  const known = cols !== null && rows !== null;
  const d = typeof document === 'undefined' ? undefined : document.documentElement.dataset;
  const orientation = width >= height ? 'landscape' : 'portrait';

  return {
    width,
    height,
    dpr,
    physical: `${Math.round(width * dpr)}x${Math.round(height * dpr)}`,
    orientation,
    aspect: height > 0 ? Math.round((width / height) * 1000) / 1000 : 0,
    segments: known ? `${cols}x${rows}` : '—',
    segmentsKnown: known,
    layout: d?.layout === 'wide' ? 'wide' : 'compact',
    panes: d?.panes === '2' ? 2 : 1,
    rulerSlot: screenKeyOf(readScreenShape()),
  };
}

/** One line per fact, in the order someone reading it out loud would want. */
export function reportLines(r: ScreenReport): [string, string][] {
  return [
    ['CSS', `${r.width} x ${r.height}`],
    ['DPR', String(r.dpr)],
    ['Physical', r.physical],
    ['Aspect', `${r.aspect} (${r.orientation})`],
    ['Segments', r.segmentsKnown ? r.segments : 'not reported'],
    ['Layout', `${r.layout}, ${r.panes} pane${r.panes === 1 ? '' : 's'}`],
    ['Ruler slot', r.rulerSlot],
  ];
}
