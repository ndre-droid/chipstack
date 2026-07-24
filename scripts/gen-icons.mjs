import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(pub, { recursive: true });

/**
 * A single smooth-edge ceramic chip with a full-face gold art-deco lattice —
 * matches the app's redesigned Chip component (no clay edge spots).
 */
function chip(cx, cy, r, body, accent, rim, value = '', fs = 0.42) {
  const oct = (rr, rot = 0) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + rot;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    }).join(' ');
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<line x1="${cx + Math.cos(a) * r * 0.3}" y1="${cy + Math.sin(a) * r * 0.3}" x2="${cx + Math.cos(a) * r * 0.86}" y2="${cy + Math.sin(a) * r * 0.86}" stroke="${accent}" stroke-width="${r * 0.02}" opacity="0.7"/>`;
  }).join('');
  const medR = r * 0.34;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${body}" stroke="${rim}" stroke-width="${r * 0.03}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.94}" fill="none" stroke="${accent}" stroke-width="${r * 0.02}" opacity="0.75"/>
    <g opacity="0.85">
      <polygon points="${oct(r * 0.9)}" fill="none" stroke="${accent}" stroke-width="${r * 0.02}"/>
      <polygon points="${oct(r * 0.78)}" fill="none" stroke="${accent}" stroke-width="${r * 0.012}" opacity="0.55"/>
      ${spokes}
      <polygon points="${oct(r * 0.46)}" fill="none" stroke="${accent}" stroke-width="${r * 0.015}"/>
    </g>
    <polygon points="${oct(medR, Math.PI / 8)}" fill="${rim}" stroke="${accent}" stroke-width="${r * 0.02}"/>
    ${value ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${accent}" font-size="${r * fs}" font-weight="800" font-family="system-ui,-apple-system,sans-serif">${value}</text>` : ''}`;
}

function svg(size, { bleed }) {
  const cx = size / 2;
  const r = bleed ? size * 0.4 : size * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#1c1c22"/>
        <stop offset="100%" stop-color="#0a0a0e"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <!-- back chips for depth (purple & red, smooth edge) -->
    ${chip(cx - r * 0.36, cx + r * 0.32, r * 0.88, '#5f2fa0', '#ecd6f4', '#3a1a63')}
    ${chip(cx + r * 0.34, cx + r * 0.18, r * 0.88, '#a8291f', '#f0d083', '#6e1a12')}
    <!-- front amber chip, brand colour, with the C monogram -->
    ${chip(cx, cx - r * 0.16, r, '#f0b429', '#3a2606', '#a86a08', 'C', 0.62)}
  </svg>`;
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
console.log('done');
