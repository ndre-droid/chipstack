import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });

/**
 * App icon: a neat STACK of smooth-edge ceramic chips (the app is "ChipStack"),
 * the top chip showing the full-face gold art-deco lattice. Colours match the real
 * SLOWPLAY Nash set (black / red / cyan / amber). Reads clearly even at 48px.
 */

// One chip in the stack, drawn as a short elliptical cylinder at (cx, cy) where
// cy is the centre of its TOP face. `top` adds the deco lattice (top of the stack).
function chip(cx, cy, rx, ry, bh, { body, light, dark, accent }, top = false) {
  const band = `
    <ellipse cx="${cx}" cy="${cy + bh}" rx="${rx}" ry="${ry}" fill="${dark}"/>
    <rect x="${cx - rx}" y="${cy}" width="${rx * 2}" height="${bh}" fill="${body}"/>
    <rect x="${cx - rx}" y="${cy + bh * 0.34}" width="${rx * 2}" height="${bh * 0.20}" fill="${accent}" opacity="0.75"/>
    <rect x="${cx - rx}" y="${cy}" width="${rx * 2}" height="${bh * 0.16}" fill="${light}" opacity="0.45"/>`;
  const face = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${light}" stroke="${dark}" stroke-width="${rx * 0.035}"/>`;
  if (!top) return band + face;

  // deco lattice on the top face — an octagon world, squashed to the ellipse
  const sy = ry / rx;
  const oct = (rr, rot = 0) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + rot;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    }).join(' ');
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<line x1="${cx + Math.cos(a) * rx * 0.30}" y1="${cy + Math.sin(a) * rx * 0.30}" x2="${cx + Math.cos(a) * rx * 0.84}" y2="${cy + Math.sin(a) * rx * 0.84}" stroke="${accent}" stroke-width="${rx * 0.02}" opacity="0.75"/>`;
  }).join('');
  const deco = `
    <g transform="translate(${cx} ${cy}) scale(1 ${sy}) translate(${-cx} ${-cy})" opacity="0.9">
      <circle cx="${cx}" cy="${cy}" r="${rx * 0.9}" fill="none" stroke="${accent}" stroke-width="${rx * 0.02}" opacity="0.7"/>
      <polygon points="${oct(rx * 0.86)}" fill="none" stroke="${accent}" stroke-width="${rx * 0.022}"/>
      <polygon points="${oct(rx * 0.72)}" fill="none" stroke="${accent}" stroke-width="${rx * 0.013}" opacity="0.6"/>
      ${spokes}
      <polygon points="${oct(rx * 0.42, Math.PI / 8)}" fill="${dark}" stroke="${accent}" stroke-width="${rx * 0.02}"/>
    </g>`;
  return band + face + deco;
}

// bottom → top; the top (amber) chip carries the brand colour + deco.
const CHIPS = [
  { body: '#2b2b36', light: '#3c3c4a', dark: '#191921', accent: '#CBA85A' }, // 100 charcoal
  { body: '#26a3b4', light: '#3fc6d8', dark: '#166d79', accent: '#EAF7F3' }, // 10 cyan
  { body: '#b23328', light: '#d24a3c', dark: '#75190f', accent: '#F0D083' }, // 5 red
  { body: '#f0b429', light: '#ffc84a', dark: '#a86a08', accent: '#6e4b0c' }, // amber (brand, top)
];

function svg(size, { bleed, transparent }) {
  const cx = size / 2;
  const rx = (bleed ? 0.40 : 0.33) * size; // maskable keeps the stack inside the safe zone
  const ry = rx * 0.27;
  const bh = rx * 0.20;
  const step = bh * 1.05;
  const n = CHIPS.length;
  // vertically centre the whole stack
  const stackH = (n - 1) * step + bh + ry * 2;
  const topCy = cx - stackH / 2 + ry; // centre-y of the highest chip's top face
  let chips = '';
  for (let i = 0; i < n; i++) {
    // draw bottom first (painter's algorithm) so upper chips overlap
    const idx = n - 1 - i; // 0 = top chip
    const cy = topCy + idx * step;
    chips += chip(cx, cy, rx, ry, bh, CHIPS[i], i === n - 1);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="32%" r="82%">
        <stop offset="0%" stop-color="#1d1d24"/>
        <stop offset="100%" stop-color="#0a0a0e"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="46%" r="42%">
        <stop offset="0%" stop-color="#f0b429" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#f0b429" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${transparent ? '' : `<rect width="${size}" height="${size}" fill="url(#bg)"/>`}
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
    <ellipse cx="${cx}" cy="${cx + rx * 0.72}" rx="${rx * 0.92}" ry="${ry * 0.7}" fill="#000" opacity="0.3"/>
    ${chips}
  </svg>`;
}

/** White circle mask (composited with dest-in) to make the round launcher icon. */
function circleMask(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`;
}

const targets = [
  { name: 'pwa-192.png', size: 192, bleed: true },
  { name: 'pwa-512.png', size: 512, bleed: true },
  { name: 'maskable-512.png', size: 512, bleed: false },
  { name: 'apple-touch-icon.png', size: 180, bleed: true },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.size, { bleed: t.bleed }))).png().toFile(join(pub, t.name));
  console.log('wrote', t.name);
}

// --- Android launcher icons (the APK's own icon set — separate from the PWA) ---
// Legacy square/round per density + the adaptive foreground (drawn on the dark
// @color/ic_launcher_background). Densities: legacy 48/72/96/144/192, foreground 108→432.
const resRoot = join(root, 'android', 'app', 'src', 'main', 'res');
const DENS = [
  { dir: 'mipmap-mdpi', legacy: 48, fg: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, fg: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, fg: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, fg: 432 },
];
for (const d of DENS) {
  const dir = join(resRoot, d.dir);
  mkdirSync(dir, { recursive: true });
  // legacy full-bleed square
  await sharp(Buffer.from(svg(d.legacy, { bleed: true }))).png().toFile(join(dir, 'ic_launcher.png'));
  // legacy round (bleed art masked to a circle)
  await sharp(Buffer.from(svg(d.legacy, { bleed: true })))
    .composite([{ input: Buffer.from(circleMask(d.legacy)), blend: 'dest-in' }])
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));
  // adaptive foreground: stack on transparent, inside the safe zone
  await sharp(Buffer.from(svg(d.fg, { bleed: false, transparent: true })))
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));
  console.log('wrote', d.dir, 'launcher icons');
}
console.log('done');
