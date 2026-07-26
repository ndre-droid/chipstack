import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });

/**
 * App icon — "token ring": a single amber ring + centre dot on a dark tile. Minimal,
 * modern, and legible down to 48px. Amber #F0B429 is the brand accent; the tile is a
 * near-black #0E1116 (matches @color/ic_launcher_background for the adaptive icon).
 */

const AMBER = '#F0B429';
const TILE = '#0E1116';

function svg(size, { bleed, transparent }) {
  const cx = size / 2;
  // full-bleed (PWA / legacy launcher) fills more; the adaptive foreground stays
  // smaller so the ring sits well inside the safe zone once the OS masks it.
  const ringR = (bleed ? 0.3 : 0.25) * size;
  const sw = ringR * 0.19; // ring thickness
  const dot = ringR * 0.2; // centre dot radius
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${transparent ? '' : `<rect width="${size}" height="${size}" fill="${TILE}"/>`}
    <circle cx="${cx}" cy="${cx}" r="${ringR}" fill="none" stroke="${AMBER}" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cx}" r="${dot}" fill="${AMBER}"/>
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
