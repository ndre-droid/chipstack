import { autoTvScale, clampTvScale, isTouchScreen, isTvBrowser, TV_SCALE_MAX, TV_SCALE_MIN } from './tvScale.ts';

/**
 * How big the big screen draws itself is a guess about VIEWING DISTANCE, and the
 * device that broke the guess is the tablet: an iPad in landscape reports a
 * laptop-sized viewport and was zoomed like a laptop across the room, while it
 * actually sits an arm's length away on the table.
 */

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${String(got)}, want ${String(want)})`}`);
}

type Fake = { innerWidth: number; innerHeight: number; coarse: boolean; ua?: string };

/** Stand a device in front of the module: viewport, pointer, user agent.
 *  `navigator` is a getter-only global in Node, so it is redefined rather than
 *  assigned, and put back the same way. */
function withDevice<T>(d: Fake, fn: () => T): T {
  const g = globalThis as unknown as { window?: unknown };
  const prevWindow = g.window;
  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  g.window = {
    innerWidth: d.innerWidth,
    innerHeight: d.innerHeight,
    devicePixelRatio: 2,
    matchMedia: (q: string) => ({
      matches: d.coarse ? /pointer: coarse|hover: none/.test(q) : /pointer: fine|hover: hover/.test(q),
    }),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: d.ua ?? 'Mozilla/5.0', maxTouchPoints: d.coarse ? 5 : 0, hardwareConcurrency: 8 },
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    g.window = prevWindow;
    if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
  }
}

const IPAD = { innerWidth: 1180, innerHeight: 820, coarse: true };
const IPAD_PRO = { innerWidth: 1366, innerHeight: 1024, coarse: true };
const LAPTOP = { innerWidth: 1440, innerHeight: 900, coarse: false };
const MONITOR = { innerWidth: 1920, innerHeight: 1200, coarse: false };
const TV = { innerWidth: 1920, innerHeight: 1080, coarse: false, ua: 'Mozilla/5.0 (Web0S; Linux/SmartTV)' };

console.log('\ntouch screens are told apart from laptops');
{
  eq('an iPad is a touch screen', withDevice(IPAD, isTouchScreen), true);
  eq('a laptop is not', withDevice(LAPTOP, isTouchScreen), false);
  eq('and a TV browser is still a TV browser', withDevice(TV, () => isTvBrowser(TV.ua)), true);
}

console.log('\nauto scale: viewing distance, not pixel count');
{
  eq('an iPad gets the layout close to as designed', withDevice(IPAD, autoTvScale), 1.05);
  eq('so does the big iPad, laptop-sized viewport and all', withDevice(IPAD_PRO, autoTvScale), 1.05);
  // a short window is where the vmin sizing collapses hardest, hence 1.3 not 1.2
  eq('a laptop standing in for the TV is still boosted', withDevice(LAPTOP, autoTvScale), 1.3);
  eq('a tall monitor a notch less', withDevice(MONITOR, autoTvScale), 1.2);
  eq('a TV browser keeps the sizing it was tuned for', withDevice(TV, autoTvScale), 1.1);
}

console.log('\nthe factor stays in range');
{
  eq('too small is floored', clampTvScale(0.1), TV_SCALE_MIN);
  eq('too big is capped', clampTvScale(9), TV_SCALE_MAX);
}

console.log(`\n${failures === 0 ? 'tvScale: all checks passed' : `tvScale: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
