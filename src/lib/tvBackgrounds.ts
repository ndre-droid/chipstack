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
export interface TvBackground {
  id: string;
  name: string;
  tone: number;
  skin: Skin | 'any' | 'season';
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

export const TV_BACKGROUNDS: TvBackground[] = [
  // casino
  { id: 'felt', name: 'Felt', tone: 0.18, skin: 'casino', url: svgUrl(felt) },
  { id: 'suits', name: 'Suits', tone: 0.17, skin: 'casino', url: svgUrl(suits) },
  { id: 'deco', name: 'Art Deco', tone: 0.1, skin: 'casino', url: svgUrl(deco) },
  { id: 'velvet', name: 'Velvet', tone: 0.14, skin: 'casino', url: svgUrl(velvet) },
  { id: 'spotlight', name: 'Spotlight', tone: 0.13, skin: 'casino', url: svgUrl(spotlight) },
  { id: 'baize', name: 'Emerald', tone: 0.2, skin: 'casino', url: svgUrl(baize) },
  { id: 'amber', name: 'Amber', tone: 0.28, skin: 'casino', url: svgUrl(amber) },
  // sci-fi
  { id: 'neon', name: 'Neon', tone: 0.12, skin: 'scifi', url: svgUrl(neon) },
  { id: 'horizon', name: 'Horizon', tone: 0.22, skin: 'scifi', url: svgUrl(horizon) },
  { id: 'nebula', name: 'Nebula', tone: 0.11, skin: 'scifi', url: svgUrl(nebula) },
  { id: 'circuit', name: 'Circuit', tone: 0.09, skin: 'scifi', url: svgUrl(circuit) },
  { id: 'datastream', name: 'Datastream', tone: 0.08, skin: 'scifi', url: svgUrl(datastream) },
  // playful
  { id: 'confetti', name: 'Confetti', tone: 0.82, skin: 'playful', url: svgUrl(confetti) },
  { id: 'candy', name: 'Candy', tone: 0.84, skin: 'playful', url: svgUrl(candy) },
  // minimal / neutral
  { id: 'slate', name: 'Slate', tone: 0.14, skin: 'minimal', url: svgUrl(slate) },
  { id: 'carbon', name: 'Carbon', tone: 0.09, skin: 'minimal', url: svgUrl(carbon) },
  { id: 'paper', name: 'Paper', tone: 0.88, skin: 'minimal', url: svgUrl(paper) },
  // seasonal
  { id: 'sunset', name: 'Sunset', tone: 0.5, skin: 'season', url: svgUrl(sunset) },
  { id: 'xmas', name: '🎄 Xmas', tone: 0.14, skin: 'season', url: svgUrl(xmas) },
  { id: 'halloween', name: '🎃 Halloween', tone: 0.16, skin: 'season', url: svgUrl(halloween) },
  { id: 'summer', name: '🌴 Summer', tone: 0.55, skin: 'season', url: svgUrl(summer) },
];

/** Backgrounds drawn for `skin` first, then everything else — the picker's order. */
export function backgroundsFor(skin: Skin): TvBackground[] {
  const rank = (b: TvBackground) => (b.skin === skin ? 0 : b.skin === 'any' ? 1 : b.skin === 'season' ? 3 : 2);
  return [...TV_BACKGROUNDS].sort((a, b) => rank(a) - rank(b));
}

export const isBuiltInBackground = (url: string | null) => !!url && TV_BACKGROUNDS.some((b) => b.url === url);
