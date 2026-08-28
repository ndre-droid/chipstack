import type { Skin } from '../types';

/**
 * Built-in big-screen backgrounds.
 *
 * All of them are generated SVG: no copyright to worry about, a couple of kB each,
 * and small enough to ride along to the TV in the session document. `tone` is the
 * mean luminance the TV uses to size its readability scrim — a bright background
 * needs a heavier one under the text.
 *
 * `skin` groups a background with the style it was drawn for, so the picker can put
 * the ones that match the chosen look first. `'any'` suits every style.
 */
/**
 * The folders the picker shows. Ordered as listed: the ones a poker night actually
 * reaches for first, then the stylistic outliers, then the calendar.
 *
 * `skin` (below) still says which app style a background was drawn for — that is what
 * decides the "matches your style" marker and the order INSIDE a folder. `group` is
 * about the mood of the picture, which is what somebody scrolling a picker is
 * actually looking for: there are a dozen casino backgrounds now, and one flat grid
 * of them is a wall.
 */
export const TV_BACKGROUND_GROUPS = ['table', 'deco', 'vegas', 'scifi', 'playful', 'minimal', 'season'] as const;
export type TvBackgroundGroup = (typeof TV_BACKGROUND_GROUPS)[number];

export interface TvBackground {
  id: string;
  name: string;
  tone: number;
  skin: Skin | 'any' | 'season';
  /** Which folder of the picker this one lives in. */
  group: TvBackgroundGroup;
  url: string;
}

const W = 1600;
const H = 900;

// encodeURIComponent leaves ' untouched, which makes an unquoted CSS url() invalid
// — escape it here too so the value is safe in every context, quoted or not.
const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
const wrap = (inner: string) => `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>${inner}</svg>`;

/**
 * Deterministic pseudo-random, so a generated background produces the SAME data URL
 * on every load. With `Math.random()` the snowflakes moved every reload, which meant
 * the saved `tvBackground` no longer matched any preset and the picker lost track of
 * which one was selected.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const linear = (id: string, stops: string, x2 = '0', y2 = '1') =>
  `<linearGradient id='${id}' x1='0' y1='0' x2='${x2}' y2='${y2}'>${stops}</linearGradient>`;
const radial = (id: string, cx: string, cy: string, r: string, stops: string) =>
  `<radialGradient id='${id}' cx='${cx}' cy='${cy}' r='${r}'>${stops}</radialGradient>`;
const stop = (o: string | number, c: string, op?: number) =>
  `<stop offset='${o}' stop-color='${c}'${op === undefined ? '' : ` stop-opacity='${op}'`}/>`;
const fill = (id: string) => `<rect width='${W}' height='${H}' fill='url(#${id})'/>`;

/* ---------------------------------------------------------------- neutral --- */

const slate = wrap(
  `<defs>${linear('g', stop(0, '#26262e') + stop(1, '#0c0c10'), '1', '1')}</defs>${fill('g')}`,
);

const carbon = (() => {
  let weave = '';
  for (let x = -H; x < W; x += 26) weave += `<line x1='${x}' y1='0' x2='${x + H}' y2='${H}'/>`;
  return wrap(
    `<defs>${linear('g', stop(0, '#1a1a20') + stop(1, '#08080b'), '0.6', '1')}</defs>${fill('g')}` +
      `<g stroke='#ffffff' stroke-opacity='0.035' stroke-width='9'>${weave}</g>`,
  );
})();

const paper = wrap(
  `<defs>${radial('g', '50%', '30%', '86%', stop(0, '#fffaf0') + stop(1, '#ebe2d2'))}</defs>${fill('g')}` +
    `<circle cx='1280' cy='210' r='320' fill='#d9c9a8' fill-opacity='0.25'/>`,
);

/* ----------------------------------------------------------------- casino --- */

const felt = wrap(
  `<defs>${radial('g', '50%', '36%', '78%', stop('0%', '#2f7d54') + stop('58%', '#17573a') + stop('100%', '#0a2a1c'))}</defs>${fill('g')}`,
);

const baize = wrap(
  `<defs>${radial('g', '50%', '40%', '80%', stop('0%', '#1f8a6d') + stop('60%', '#0f5a48') + stop('100%', '#062720'))}</defs>${fill('g')}`,
);

const amber = wrap(
  `<defs>${radial('g', '50%', '34%', '82%', stop('0%', '#3a2c12') + stop('55%', '#211a10') + stop('100%', '#0c0a06'))}</defs>${fill('g')}` +
    `<circle cx='800' cy='300' r='460' fill='#f0b429' fill-opacity='0.12'/>`,
);

/** Art-deco sunburst — black ground, brass rays fanning out from the top edge. */
const deco = (() => {
  let rays = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI;
    rays += `<path d='M800 -40 L${Math.round(800 + Math.cos(a) * 2400)} ${Math.round(-40 + Math.sin(a) * 2400)} L${Math.round(
      800 + Math.cos(a + 0.014) * 2400,
    )} ${Math.round(-40 + Math.sin(a + 0.014) * 2400)} Z'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '0%', '110%', stop('0%', '#241c0c') + stop('55%', '#120e08') + stop('100%', '#07060a'))}</defs>${fill('g')}` +
      `<g fill='#d9b262' fill-opacity='0.13'>${rays}</g>` +
      `<circle cx='800' cy='-40' r='330' fill='none' stroke='#d9b262' stroke-opacity='0.3' stroke-width='4'/>` +
      `<circle cx='800' cy='-40' r='390' fill='none' stroke='#d9b262' stroke-opacity='0.16' stroke-width='2'/>`,
  );
})();

/** Wine velvet with a brass rim — the private back room. */
const velvet = wrap(
  `<defs>${radial('g', '50%', '34%', '84%', stop('0%', '#7d1533') + stop('50%', '#410c1e') + stop('100%', '#15040a'))}</defs>${fill('g')}` +
    `<ellipse cx='800' cy='330' rx='700' ry='430' fill='none' stroke='#d9b262' stroke-opacity='0.22' stroke-width='6'/>` +
    `<ellipse cx='800' cy='330' rx='760' ry='480' fill='none' stroke='#d9b262' stroke-opacity='0.1' stroke-width='2'/>`,
);

/** Felt with the four suits ghosted into it. */
const suits = (() => {
  const spade = "M0 -52 C 26 -22 52 -6 52 16 C 52 36 34 48 18 40 C 10 36 6 30 6 30 L 14 52 L -14 52 L -6 30 C -6 30 -10 36 -18 40 C -34 48 -52 36 -52 16 C -52 -6 -26 -22 0 -52 Z";
  const heart = "M0 52 C -46 16 -52 -6 -52 -20 C -52 -40 -34 -52 -18 -46 C -8 -42 -2 -32 0 -26 C 2 -32 8 -42 18 -46 C 34 -52 52 -40 52 -20 C 52 -6 46 16 0 52 Z";
  const diamond = 'M0 -54 L46 0 L0 54 L-46 0 Z';
  const club =
    'M0 -50 A26 26 0 0 1 22 -10 A26 26 0 1 1 22 34 A26 26 0 0 1 6 28 L14 52 L-14 52 L-6 28 A26 26 0 0 1 -22 34 A26 26 0 1 1 -22 -10 A26 26 0 0 1 0 -50 Z';
  const marks: [string, number, number, number][] = [
    [spade, 250, 250, 1.5],
    [heart, 1330, 210, 1.2],
    [diamond, 300, 700, 1.1],
    [club, 1290, 690, 1.4],
  ];
  const glyphs = marks
    .map(([d, x, y, s]) => `<path d='${d}' transform='translate(${x} ${y}) scale(${s})'/>`)
    .join('');
  return wrap(
    `<defs>${radial('g', '50%', '38%', '80%', stop('0%', '#2b7350') + stop('58%', '#154f36') + stop('100%', '#08251a'))}</defs>${fill('g')}` +
      `<g fill='#f1e9d4' fill-opacity='0.06'>${glyphs}</g>`,
  );
})();

/** A single lamp over the table, everything else in the dark. */
const spotlight = wrap(
  `<defs>${radial('g', '50%', '18%', '72%', stop('0%', '#3d8f63') + stop('42%', '#10412c') + stop('100%', '#050d09'))}` +
    `${linear('c', stop(0, '#ffe9b0', 0.22) + stop(1, '#ffe9b0', 0))}</defs>${fill('g')}` +
    `<path d='M740 0 L860 0 L1180 900 L420 900 Z' fill='url(#c)'/>` +
    `<circle cx='800' cy='30' r='70' fill='#ffe9b0' fill-opacity='0.35'/>`,
);

/* ----------------------------------------------------------------- sci-fi --- */

const neon = (() => {
  let lines = '';
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W;
    lines += `<line x1='${x}' y1='340' x2='${800 + (x - 800) * 2.6}' y2='900'/>`;
  }
  for (let i = 1; i <= 5; i++) {
    const y = 340 + (i / 5) * 560;
    lines += `<line x1='0' y1='${y}' x2='${W}' y2='${y}'/>`;
  }
  return wrap(
    `<defs>${linear('g', stop(0, '#0c1a4c') + stop(1, '#05060f'))}</defs>${fill('g')}` +
      `<circle cx='800' cy='320' r='520' fill='#3fe6ff' fill-opacity='0.10'/>` +
      `<g stroke='#3fe6ff' stroke-opacity='0.16' stroke-width='2'>${lines}</g>`,
  );
})();

/** Synthwave: a banded sun sinking behind the grid. */
const horizon = (() => {
  let grid = '';
  for (let i = 0; i <= 14; i++) {
    const x = (i / 14) * W;
    grid += `<line x1='${x}' y1='520' x2='${800 + (x - 800) * 3.4}' y2='900'/>`;
  }
  for (let i = 1; i <= 7; i++) {
    const y = 520 + Math.pow(i / 7, 1.8) * 380;
    grid += `<line x1='0' y1='${Math.round(y)}' x2='${W}' y2='${Math.round(y)}'/>`;
  }
  let bands = '';
  for (let i = 0; i < 6; i++) bands += `<rect x='560' y='${300 + i * 40}' width='480' height='14' fill='#0a0620'/>`;
  return wrap(
    `<defs>${linear('g', stop(0, '#20063f') + stop('0.55', '#3a0a52') + stop(1, '#0a0620'))}` +
      `${linear('s', stop(0, '#ffd166') + stop(1, '#ff478b'))}</defs>${fill('g')}` +
      `<circle cx='800' cy='420' r='240' fill='url(#s)'/>${bands}` +
      `<g stroke='#ff478b' stroke-opacity='0.35' stroke-width='2'>${grid}</g>`,
  );
})();

/** Deep space: stars plus a couple of nebula clouds. */
const nebula = (() => {
  const r = rng(20260823);
  let stars = '';
  for (let i = 0; i < 160; i++) {
    stars += `<circle cx='${Math.round(r() * W)}' cy='${Math.round(r() * H)}' r='${(r() * 1.7 + 0.4).toFixed(1)}' fill-opacity='${(
      0.25 + r() * 0.6
    ).toFixed(2)}'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '46%', '86%', stop('0%', '#161a4a') + stop('60%', '#0a0a24') + stop('100%', '#04040e'))}</defs>${fill('g')}` +
      `<ellipse cx='430' cy='300' rx='420' ry='250' fill='#6b3fd6' fill-opacity='0.2'/>` +
      `<ellipse cx='1180' cy='560' rx='460' ry='260' fill='#2f7ee6' fill-opacity='0.16'/>` +
      `<g fill='#ffffff'>${stars}</g>`,
  );
})();

/** Circuit board traces under a cyan glow. */
const circuit = (() => {
  const r = rng(770077);
  let traces = '';
  let pads = '';
  for (let i = 0; i < 34; i++) {
    const x = Math.round(r() * W);
    const y = Math.round(r() * H);
    const len = 90 + Math.round(r() * 260);
    const horiz = r() > 0.5;
    const x2 = horiz ? x + len : x;
    const y2 = horiz ? y : y + len;
    traces += `<path d='M${x} ${y} L${x2} ${y2} l${horiz ? 70 : 0} ${horiz ? 70 : 0}'/>`;
    pads += `<circle cx='${x}' cy='${y}' r='5'/>`;
  }
  return wrap(
    `<defs>${linear('g', stop(0, '#071026') + stop(1, '#03060f'), '0.4', '1')}</defs>${fill('g')}` +
      `<g stroke='#3fe6ff' stroke-opacity='0.18' stroke-width='2' fill='none'>${traces}</g>` +
      `<g fill='#3fe6ff' fill-opacity='0.3'>${pads}</g>` +
      `<circle cx='1240' cy='190' r='420' fill='#3fe6ff' fill-opacity='0.06'/>`,
  );
})();

/** Falling data columns — quiet enough to read a clock over. */
const datastream = (() => {
  const r = rng(31337);
  let cols = '';
  for (let i = 0; i < 46; i++) {
    const x = Math.round((i / 46) * W + r() * 14);
    const y = Math.round(r() * H);
    const h = 90 + Math.round(r() * 300);
    cols += `<rect x='${x}' y='${y}' width='3' height='${h}' fill-opacity='${(0.08 + r() * 0.22).toFixed(2)}'/>`;
  }
  return wrap(
    `<defs>${linear('g', stop(0, '#04140f') + stop(1, '#010806'))}</defs>${fill('g')}` +
      `<g fill='#49ffa8'>${cols}</g>` +
      `<ellipse cx='800' cy='420' rx='620' ry='380' fill='#49ffa8' fill-opacity='0.05'/>`,
  );
})();

/* ---------------------------------------------------------------- playful --- */

const confetti = (() => {
  const r = rng(4242);
  const colors = ['#ff6f61', '#ffc247', '#4ec9b0', '#5aa9ff', '#c56bff'];
  let bits = '';
  for (let i = 0; i < 90; i++) {
    const x = Math.round(r() * W);
    const y = Math.round(r() * H);
    const c = colors[Math.floor(r() * colors.length)];
    bits += `<rect x='${x}' y='${y}' width='14' height='7' rx='3' fill='${c}' fill-opacity='0.55' transform='rotate(${Math.round(
      r() * 360,
    )} ${x} ${y})'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '34%', '84%', stop('0%', '#fff4dd') + stop('100%', '#f6dcb0'))}</defs>${fill('g')}${bits}`,
  );
})();

const candy = (() => {
  let stripes = '';
  for (let x = -H; x < W; x += 120) stripes += `<path d='M${x} ${H} L${x + H} 0 l60 0 L${x + 60} ${H} Z'/>`;
  return wrap(
    `<defs>${linear('g', stop(0, '#ffe9c2') + stop(1, '#ffd0d6'), '0.4', '1')}</defs>${fill('g')}` +
      `<g fill='#ff8fa3' fill-opacity='0.22'>${stripes}</g>`,
  );
})();

/* --------------------------------------------------------------- seasonal --- */

const sunset = wrap(
  `<defs>${linear('g', stop(0, '#ffb15a') + stop('0.5', '#ff6f7d') + stop(1, '#7a3fb0'), '0.4', '1')}</defs>${fill('g')}` +
    `<circle cx='1180' cy='250' r='150' fill='#fff' fill-opacity='0.28'/>`,
);

const xmas = (() => {
  const r = rng(1224);
  let flakes = '';
  for (let i = 0; i < 40; i++)
    flakes += `<circle cx='${Math.round(r() * W)}' cy='${Math.round(r() * H)}' r='${1 + Math.round(r() * 3)}'/>`;
  return wrap(
    `<defs>${radial('g', '50%', '30%', '85%', stop('0%', '#1c5138') + stop('55%', '#0e3322') + stop('100%', '#3a0f12'))}</defs>${fill('g')}` +
      `<g fill='#fff' fill-opacity='0.55'>${flakes}</g>`,
  );
})();

const halloween = wrap(
  `<defs>${radial('g', '50%', '36%', '82%', stop('0%', '#c25a12') + stop('45%', '#5a2a08') + stop('100%', '#120a14'))}</defs>${fill('g')}` +
    `<circle cx='1200' cy='230' r='120' fill='#f7a83e' fill-opacity='0.5'/>`,
);

const summer = wrap(
  `<defs>${linear('g', stop(0, '#2ec5d3') + stop('0.55', '#4a8fd6') + stop(1, '#ffd66b'))}</defs>${fill('g')}` +
    `<circle cx='300' cy='240' r='120' fill='#fff' fill-opacity='0.5'/>`,
);

/* -------------------------------------------------- more of the table --- */

/** Green felt with the leather rail curving in at the bottom — a real table edge. */
const rail = wrap(
  `<defs>${radial('g', '50%', '30%', '80%', stop('0%', '#2a7a52') + stop('58%', '#134a30') + stop('100%', '#071e14'))}` +
    `${linear('r', stop(0, '#6b3b22') + stop('0.45', '#3d2013') + stop(1, '#1c0e08'))}</defs>${fill('g')}` +
    `<ellipse cx='800' cy='1010' rx='1180' ry='300' fill='url(#r)'/>` +
    `<ellipse cx='800' cy='992' rx='1160' ry='288' fill='none' stroke='#d9b262' stroke-opacity='0.34' stroke-width='5'/>` +
    `<ellipse cx='800' cy='120' rx='1050' ry='230' fill='#ffffff' fill-opacity='0.045'/>`,
);

/** The lattice off the back of a playing card, ghosted across a dark green table. */
const cards = (() => {
  let lat = '';
  for (let i = -20; i < 60; i++) {
    lat += `<line x1='${i * 46}' y1='0' x2='${i * 46 + H}' y2='${H}'/>`;
    lat += `<line x1='${i * 46}' y1='0' x2='${i * 46 - H}' y2='${H}'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '36%', '80%', stop('0%', '#26694a') + stop('60%', '#124331') + stop('100%', '#07211a'))}</defs>${fill('g')}` +
      `<g stroke='#e9dcc0' stroke-opacity='0.045' stroke-width='2.5'>${lat}</g>` +
      `<ellipse cx='800' cy='330' rx='620' ry='380' fill='#000' fill-opacity='0.16'/>`,
  );
})();

/** Five cards fanned face-down across the corner, in gold outline. */
const royal = (() => {
  let fan = '';
  for (let i = 0; i < 5; i++) {
    const a = -34 + i * 15;
    fan +=
      `<g transform='translate(300 720) rotate(${a}) translate(-95 -270)'>` +
      `<rect width='190' height='270' rx='16' fill='#f4ecd8' fill-opacity='0.07' stroke='#d9b262' stroke-opacity='0.32' stroke-width='3'/>` +
      `<rect x='16' y='16' width='158' height='238' rx='9' fill='none' stroke='#d9b262' stroke-opacity='0.16' stroke-width='2'/>` +
      `</g>`;
  }
  return wrap(
    `<defs>${radial('g', '46%', '30%', '86%', stop('0%', '#1f6144') + stop('58%', '#0f3d2b') + stop('100%', '#061a13'))}</defs>${fill('g')}` +
      fan,
  );
})();

/** Midnight-blue baize — the colour half the real card rooms actually use. */
const midnight = wrap(
  `<defs>${radial('g', '50%', '34%', '82%', stop('0%', '#1e3f7a') + stop('56%', '#12254a') + stop('100%', '#060b1a'))}</defs>${fill('g')}` +
    `<ellipse cx='800' cy='250' rx='900' ry='330' fill='#7fb0ff' fill-opacity='0.06'/>`,
);

/** Burgundy baize, gold rim — the table in the back room. */
const burgundy = wrap(
  `<defs>${radial('g', '50%', '34%', '82%', stop('0%', '#6d1a24') + stop('55%', '#3d0d15') + stop('100%', '#150407'))}</defs>${fill('g')}` +
    `<ellipse cx='800' cy='340' rx='740' ry='420' fill='none' stroke='#d9b262' stroke-opacity='0.18' stroke-width='5'/>`,
);

/** Chips scattered across the felt, seen from straight above. */
const scatter = (() => {
  const r = rng(90210);
  let discs = '';
  for (let i = 0; i < 22; i++) {
    const cx = Math.round(r() * W);
    const cy = Math.round(r() * H);
    const rad = Math.round(42 + r() * 54);
    discs +=
      `<circle cx='${cx}' cy='${cy}' r='${rad}' fill='#ffffff' fill-opacity='0.045'/>` +
      `<circle cx='${cx}' cy='${cy}' r='${rad}' fill='none' stroke='#f1e9d4' stroke-opacity='0.11' stroke-width='7' stroke-dasharray='${Math.round(
        rad * 0.42,
      )} ${Math.round(rad * 0.34)}'/>` +
      `<circle cx='${cx}' cy='${cy}' r='${Math.round(rad * 0.44)}' fill='none' stroke='#f1e9d4' stroke-opacity='0.09' stroke-width='3'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '38%', '82%', stop('0%', '#256b4b') + stop('60%', '#124331') + stop('100%', '#07211a'))}</defs>${fill('g')}` +
      discs,
  );
})();

/* ------------------------------------------------------- deco & lounge --- */

/** Black marble, gold veins. */
const marble = (() => {
  const r = rng(505050);
  let veins = '';
  for (let i = 0; i < 14; i++) {
    const x = Math.round(r() * W);
    const y = Math.round(r() * H);
    veins += `<path d='M${x} ${y} C ${Math.round(x + 180 - r() * 360)} ${Math.round(y - 160)} ${Math.round(
      x + 320 - r() * 240,
    )} ${Math.round(y + 200)} ${Math.round(x + 520 - r() * 300)} ${Math.round(y + 40 - r() * 200)}'/>`;
  }
  return wrap(
    `<defs>${radial('g', '42%', '30%', '92%', stop('0%', '#22222a') + stop('55%', '#141419') + stop('100%', '#08080b'))}</defs>${fill('g')}` +
      `<g fill='none' stroke='#d9b262' stroke-opacity='0.16' stroke-width='2.4' stroke-linecap='round'>${veins}</g>` +
      `<g fill='none' stroke='#ffffff' stroke-opacity='0.05' stroke-width='6' stroke-linecap='round'>${veins}</g>`,
  );
})();

/** Tufted oxblood leather with brass studs — the chesterfield behind the table. */
const leather = (() => {
  let tuft = '';
  let studs = '';
  const step = 160;
  for (let y = -step; y < H + step; y += step) {
    for (let x = -step; x < W + step; x += step) {
      const ox = ((y / step) % 2 === 0 ? 0 : step / 2) + x;
      tuft += `<path d='M${ox} ${y} L${ox + step / 2} ${y + step / 2} L${ox} ${y + step} L${ox - step / 2} ${y + step / 2} Z'/>`;
      studs += `<circle cx='${ox}' cy='${y}' r='6'/>`;
    }
  }
  return wrap(
    `<defs>${radial('g', '50%', '32%', '90%', stop('0%', '#5e1620') + stop('58%', '#3a0d14') + stop('100%', '#140407'))}</defs>${fill('g')}` +
      `<g fill='none' stroke='#000000' stroke-opacity='0.28' stroke-width='3'>${tuft}</g>` +
      `<g fill='#d9b262' fill-opacity='0.3'>${studs}</g>`,
  );
})();

/** Mahogany panelling with a brass rail across it. */
const mahogany = (() => {
  const r = rng(6060);
  let grain = '';
  for (let i = 0; i < 90; i++) {
    const x = Math.round(r() * W);
    grain += `<path d='M${x} 0 C ${x + 26} ${Math.round(H * 0.3)} ${x - 26} ${Math.round(H * 0.7)} ${x + 10} ${H}' stroke-opacity='${(
      0.05 +
      r() * 0.09
    ).toFixed(2)}'/>`;
  }
  return wrap(
    `<defs>${linear('g', stop(0, '#4a2415') + stop('0.5', '#33170d') + stop(1, '#1a0b06'), '0.3', '1')}</defs>${fill('g')}` +
      `<g fill='none' stroke='#e8b98a' stroke-width='2'>${grain}</g>` +
      `<rect y='690' width='${W}' height='16' fill='#d9b262' fill-opacity='0.22'/>` +
      `<rect y='706' width='${W}' height='6' fill='#000' fill-opacity='0.3'/>`,
  );
})();

/** Cigar smoke through venetian-blind light — the noir room. */
const noir = (() => {
  let slats = '';
  for (let i = 0; i < 16; i++) {
    const y = -200 + i * 96;
    slats += `<path d='M-200 ${y} L${W + 200} ${y - 320} L${W + 200} ${y - 274} L-200 ${y + 46} Z'/>`;
  }
  return wrap(
    `<defs>${radial('g', '62%', '24%', '96%', stop('0%', '#2a2118') + stop('50%', '#16120e') + stop('100%', '#07060a'))}</defs>${fill('g')}` +
      `<g fill='#ffe0a8' fill-opacity='0.05'>${slats}</g>` +
      `<ellipse cx='520' cy='620' rx='520' ry='210' fill='#ffffff' fill-opacity='0.035'/>` +
      `<ellipse cx='1080' cy='430' rx='420' ry='170' fill='#ffffff' fill-opacity='0.028'/>`,
  );
})();

/** Black ground, fine gold herringbone — the quiet expensive one. */
const herringbone = (() => {
  let chev = '';
  const step = 54;
  for (let y = -step; y < H + step; y += step) {
    for (let x = -step * 2; x < W + step * 2; x += step * 2) {
      const ox = ((y / step) % 2 === 0 ? 0 : step) + x;
      chev += `<path d='M${ox} ${y + step} L${ox + step} ${y} L${ox + step * 2} ${y + step}'/>`;
    }
  }
  return wrap(
    `<defs>${radial('g', '50%', '22%', '96%', stop('0%', '#1a1712') + stop('60%', '#0e0c09') + stop('100%', '#060506'))}</defs>${fill('g')}` +
      `<g fill='none' stroke='#d9b262' stroke-opacity='0.13' stroke-width='2.4'>${chev}</g>`,
  );
})();

/* -------------------------------------------------------------- vegas --- */

/** The strip at night: a skyline under a warm glow. */
const vegas = (() => {
  const r = rng(1702);
  let towers = '';
  let windows = '';
  for (let i = 0; i < 26; i++) {
    const w = 40 + Math.round(r() * 90);
    const x = Math.round((i / 26) * (W + 120) - 60);
    const h = 120 + Math.round(r() * 380);
    towers += `<rect x='${x}' y='${H - h}' width='${w}' height='${h}' rx='4'/>`;
    for (let wy = H - h + 22; wy < H - 30; wy += 34) {
      for (let wx = x + 10; wx < x + w - 12; wx += 24) {
        if (r() > 0.55) windows += `<rect x='${wx}' y='${wy}' width='9' height='14' rx='2'/>`;
      }
    }
  }
  return wrap(
    `<defs>${linear('g', stop(0, '#0b0a24') + stop('0.55', '#251540') + stop(1, '#3d1a36'))}</defs>${fill('g')}` +
      `<circle cx='980' cy='560' r='520' fill='#ff8a3d' fill-opacity='0.13'/>` +
      `<g fill='#05040f' fill-opacity='0.86'>${towers}</g>` +
      `<g fill='#ffd88a' fill-opacity='0.5'>${windows}</g>`,
  );
})();

/** A marquee: warm bulbs all the way round the frame. */
const marquee = (() => {
  let bulbs = '';
  const gap = 62;
  for (let x = 40; x < W; x += gap) {
    bulbs += `<circle cx='${x}' cy='40' r='11'/><circle cx='${x}' cy='${H - 40}' r='11'/>`;
  }
  for (let y = 40 + gap; y < H - 40; y += gap) {
    bulbs += `<circle cx='40' cy='${y}' r='11'/><circle cx='${W - 40}' cy='${y}' r='11'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '40%', '86%', stop('0%', '#5c1220') + stop('55%', '#320a12') + stop('100%', '#100307'))}</defs>${fill('g')}` +
      `<rect x='22' y='22' width='${W - 44}' height='${H - 44}' rx='18' fill='none' stroke='#d9b262' stroke-opacity='0.22' stroke-width='4'/>` +
      `<g fill='#ffd98c' fill-opacity='0.55'>${bulbs}</g>`,
  );
})();

/** A roulette wheel turning in from the right-hand edge. */
const roulette = (() => {
  const cx = 1360;
  const cy = 450;
  const R = 620;
  let wedges = '';
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2;
    const a1 = ((i + 1) / 36) * Math.PI * 2;
    const col = i % 2 === 0 ? '#c0392b' : '#0b0b0e';
    wedges +=
      `<path d='M${cx} ${cy} L${(cx + Math.cos(a0) * R).toFixed(1)} ${(cy + Math.sin(a0) * R).toFixed(1)} ` +
      `A${R} ${R} 0 0 1 ${(cx + Math.cos(a1) * R).toFixed(1)} ${(cy + Math.sin(a1) * R).toFixed(1)} Z' fill='${col}' fill-opacity='0.4'/>`;
  }
  return wrap(
    `<defs>${radial('g', '30%', '38%', '92%', stop('0%', '#1d3f2e') + stop('58%', '#102a1f') + stop('100%', '#06110d'))}</defs>${fill('g')}` +
      wedges +
      `<circle cx='${cx}' cy='${cy}' r='${R}' fill='none' stroke='#d9b262' stroke-opacity='0.3' stroke-width='8'/>` +
      `<circle cx='${cx}' cy='${cy}' r='${R * 0.62}' fill='none' stroke='#d9b262' stroke-opacity='0.22' stroke-width='5'/>` +
      `<circle cx='${cx}' cy='${cy}' r='${R * 0.26}' fill='#0b0b0e' fill-opacity='0.5' stroke='#d9b262' stroke-opacity='0.3' stroke-width='4'/>`,
  );
})();

/** Two dice, big and ghosted, on a deep red ground. */
const dice = (() => {
  const pips = (x: number, y: number, s: number, spots: [number, number][]) =>
    spots.map(([px, py]) => `<circle cx='${x + px * s}' cy='${y + py * s}' r='${s * 0.09}'/>`).join('');
  const five: [number, number][] = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ];
  const two: [number, number][] = [
    [0.28, 0.28],
    [0.72, 0.72],
  ];
  return wrap(
    `<defs>${radial('g', '50%', '34%', '86%', stop('0%', '#6a1420') + stop('55%', '#3a0a12') + stop('100%', '#130306'))}</defs>${fill('g')}` +
      `<g transform='translate(240 300) rotate(-14)'>` +
      `<rect width='340' height='340' rx='52' fill='#f6efe2' fill-opacity='0.08' stroke='#f6efe2' stroke-opacity='0.16' stroke-width='4'/>` +
      `<g fill='#f6efe2' fill-opacity='0.2'>${pips(0, 0, 340, five)}</g></g>` +
      `<g transform='translate(1080 420) rotate(11)'>` +
      `<rect width='300' height='300' rx='46' fill='#f6efe2' fill-opacity='0.07' stroke='#f6efe2' stroke-opacity='0.14' stroke-width='4'/>` +
      `<g fill='#f6efe2' fill-opacity='0.18'>${pips(0, 0, 300, two)}</g></g>`,
  );
})();

/** Gold dust rising out of the dark — the high-roller room. */
const highroller = (() => {
  const r = rng(777777);
  let dust = '';
  for (let i = 0; i < 130; i++) {
    const y = Math.round(H - Math.pow(r(), 1.7) * H);
    dust += `<circle cx='${Math.round(r() * W)}' cy='${y}' r='${(r() * 2.6 + 0.6).toFixed(1)}' fill-opacity='${(
      0.18 +
      r() * 0.5
    ).toFixed(2)}'/>`;
  }
  return wrap(
    `<defs>${radial('g', '50%', '108%', '110%', stop('0%', '#5a3f10') + stop('42%', '#231a0c') + stop('100%', '#070609'))}</defs>${fill('g')}` +
      `<g fill='#f0d08a'>${dust}</g>` +
      `<ellipse cx='800' cy='940' rx='860' ry='300' fill='#f0b429' fill-opacity='0.12'/>`,
  );
})();

export const TV_BACKGROUNDS: TvBackground[] = [
  // at the table — felt, cards, chips
  { id: 'felt', name: 'Felt', tone: 0.18, skin: 'casino', group: 'table', url: svgUrl(felt) },
  { id: 'rail', name: 'Table Rail', tone: 0.16, skin: 'casino', group: 'table', url: svgUrl(rail) },
  { id: 'suits', name: 'Suits', tone: 0.17, skin: 'casino', group: 'table', url: svgUrl(suits) },
  { id: 'cards', name: 'Card Backs', tone: 0.16, skin: 'casino', group: 'table', url: svgUrl(cards) },
  { id: 'royal', name: 'Royal Fan', tone: 0.15, skin: 'casino', group: 'table', url: svgUrl(royal) },
  { id: 'scatter', name: 'Chip Scatter', tone: 0.17, skin: 'casino', group: 'table', url: svgUrl(scatter) },
  { id: 'spotlight', name: 'Spotlight', tone: 0.13, skin: 'casino', group: 'table', url: svgUrl(spotlight) },
  { id: 'baize', name: 'Emerald', tone: 0.2, skin: 'casino', group: 'table', url: svgUrl(baize) },
  { id: 'midnight', name: 'Midnight Baize', tone: 0.14, skin: 'casino', group: 'table', url: svgUrl(midnight) },
  { id: 'burgundy', name: 'Burgundy', tone: 0.13, skin: 'casino', group: 'table', url: svgUrl(burgundy) },
  // deco & lounge — the room around the table
  { id: 'deco', name: 'Art Deco', tone: 0.1, skin: 'casino', group: 'deco', url: svgUrl(deco) },
  { id: 'velvet', name: 'Velvet', tone: 0.14, skin: 'casino', group: 'deco', url: svgUrl(velvet) },
  { id: 'marble', name: 'Marble & Gold', tone: 0.12, skin: 'casino', group: 'deco', url: svgUrl(marble) },
  { id: 'leather', name: 'Chesterfield', tone: 0.13, skin: 'casino', group: 'deco', url: svgUrl(leather) },
  { id: 'mahogany', name: 'Mahogany', tone: 0.15, skin: 'casino', group: 'deco', url: svgUrl(mahogany) },
  { id: 'noir', name: 'Noir', tone: 0.11, skin: 'casino', group: 'deco', url: svgUrl(noir) },
  { id: 'herringbone', name: 'Herringbone', tone: 0.09, skin: 'casino', group: 'deco', url: svgUrl(herringbone) },
  { id: 'amber', name: 'Amber', tone: 0.28, skin: 'casino', group: 'deco', url: svgUrl(amber) },
  // vegas — lights, wheels, dice
  { id: 'vegas', name: 'The Strip', tone: 0.2, skin: 'casino', group: 'vegas', url: svgUrl(vegas) },
  { id: 'marquee', name: 'Marquee', tone: 0.16, skin: 'casino', group: 'vegas', url: svgUrl(marquee) },
  { id: 'roulette', name: 'Roulette', tone: 0.18, skin: 'casino', group: 'vegas', url: svgUrl(roulette) },
  { id: 'dice', name: 'Dice', tone: 0.16, skin: 'casino', group: 'vegas', url: svgUrl(dice) },
  { id: 'highroller', name: 'High Roller', tone: 0.19, skin: 'casino', group: 'vegas', url: svgUrl(highroller) },
  // sci-fi
  { id: 'neon', name: 'Neon', tone: 0.12, skin: 'scifi', group: 'scifi', url: svgUrl(neon) },
  { id: 'horizon', name: 'Horizon', tone: 0.22, skin: 'scifi', group: 'scifi', url: svgUrl(horizon) },
  { id: 'nebula', name: 'Nebula', tone: 0.11, skin: 'scifi', group: 'scifi', url: svgUrl(nebula) },
  { id: 'circuit', name: 'Circuit', tone: 0.09, skin: 'scifi', group: 'scifi', url: svgUrl(circuit) },
  { id: 'datastream', name: 'Datastream', tone: 0.08, skin: 'scifi', group: 'scifi', url: svgUrl(datastream) },
  // playful
  { id: 'confetti', name: 'Confetti', tone: 0.82, skin: 'playful', group: 'playful', url: svgUrl(confetti) },
  { id: 'candy', name: 'Candy', tone: 0.84, skin: 'playful', group: 'playful', url: svgUrl(candy) },
  // minimal / neutral
  { id: 'slate', name: 'Slate', tone: 0.14, skin: 'minimal', group: 'minimal', url: svgUrl(slate) },
  { id: 'carbon', name: 'Carbon', tone: 0.09, skin: 'minimal', group: 'minimal', url: svgUrl(carbon) },
  { id: 'paper', name: 'Paper', tone: 0.88, skin: 'minimal', group: 'minimal', url: svgUrl(paper) },
  // seasonal
  { id: 'sunset', name: 'Sunset', tone: 0.5, skin: 'season', group: 'season', url: svgUrl(sunset) },
  { id: 'xmas', name: '🎄 Xmas', tone: 0.14, skin: 'season', group: 'season', url: svgUrl(xmas) },
  { id: 'halloween', name: '🎃 Halloween', tone: 0.16, skin: 'season', group: 'season', url: svgUrl(halloween) },
  { id: 'summer', name: '🌴 Summer', tone: 0.55, skin: 'season', group: 'season', url: svgUrl(summer) },
];

/** Backgrounds drawn for `skin` first, then everything else — the picker's order. */
export function backgroundsFor(skin: Skin): TvBackground[] {
  const rank = (b: TvBackground) => (b.skin === skin ? 0 : b.skin === 'any' ? 1 : b.skin === 'season' ? 3 : 2);
  return [...TV_BACKGROUNDS].sort((a, b) => rank(a) - rank(b));
}

/**
 * The picker's folders, in order, each holding its own backgrounds.
 *
 * Inside a folder the ones drawn for the chosen style come first, for the same
 * reason `backgroundsFor` puts them first overall. Empty folders never appear.
 */
export function backgroundFolders(skin: Skin): { group: TvBackgroundGroup; items: TvBackground[] }[] {
  return TV_BACKGROUND_GROUPS.map((group) => ({
    group,
    items: TV_BACKGROUNDS.filter((b) => b.group === group).sort(
      (a, b) => Number(b.skin === skin) - Number(a.skin === skin),
    ),
  })).filter((f) => f.items.length > 0);
}

/** The folder a background lives in — which is the one the picker opens on. */
export function groupOfBackground(url: string | null): TvBackgroundGroup | null {
  return TV_BACKGROUNDS.find((b) => b.url === url)?.group ?? null;
}

export const isBuiltInBackground = (url: string | null) => !!url && TV_BACKGROUNDS.some((b) => b.url === url);
