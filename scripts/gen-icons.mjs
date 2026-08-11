import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });

/**
 * App icon — "chip stack": three graded lime-green chip bars on a near-black tile.
 * Charcoal #1A1A1E tile; bars graded from olive (bottom) to bright lime #C7EA5A (top),
 * each with a soft drop shadow for depth.
 */

const TILE = '#1A1A1E';
// each bar: [highlight, mid, shadow] for its top->bottom gradient, brightest bar on top
const BARS = [
  { grad: ['#96B84A', '#7F9D3A', '#5F7A29'], shadowOpacity: 0.6, highlightOpacity: 0.25 },
  { grad: ['#B7D75C', '#A3C249', '#7F9D3A'], shadowOpacity: 0.55, highlightOpacity: 0.3 },
  { grad: ['#DAF383', '#C7EA5A', '#A3C249'], shadowOpacity: 0.5, highlightOpacity: 0.35 },
];

function svg(size, { bleed, transparent }) {
  // full-bleed (PWA / legacy launcher) fills more; the adaptive foreground stays
  // smaller so the stack sits well inside the safe zone once the OS masks it.
  const scale = bleed ? 1 : 0.75;
  const boxW = size * 0.7182 * scale;
  const boxH = size * 0.5545 * scale;
  const boxX = (size - boxW) / 2;
  const boxY = (size - boxH) / 2;
  const barH = boxH * 0.2459;
  const gap = boxH * 0.0738;
  const radius = barH / 2;
  const dy = barH * 0.53;
  const blur = barH * 0.24;

  const defs = BARS.map((b, i) => `
      <linearGradient id="bar${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${b.grad[0]}"/>
        <stop offset="55%" stop-color="${b.grad[1]}"/>
        <stop offset="100%" stop-color="${b.grad[2]}"/>
      </linearGradient>
      <filter id="shadow${i}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="#000000" flood-opacity="${b.shadowOpacity}"/>
      </filter>`).join('');

  const bars = BARS.map((b, i) => {
    // i=0 bottom (drawn last conceptually), reverse so brightest sits on top row
    const rowFromTop = BARS.length - 1 - i;
    const y = boxY + rowFromTop * (barH + gap);
    const hlH = barH * 0.4;
    return `
    <rect x="${boxX}" y="${y}" width="${boxW}" height="${barH}" rx="${radius}" fill="url(#bar${i})" filter="url(#shadow${i})"/>
    <rect x="${boxX}" y="${y}" width="${boxW}" height="${hlH}" rx="${radius}" fill="#ffffff" opacity="${b.highlightOpacity * 0.35}"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>${defs}
    </defs>
    ${transparent ? '' : `<rect width="${size}" height="${size}" fill="${TILE}"/>`}
    ${bars.join('\n    ')}
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
