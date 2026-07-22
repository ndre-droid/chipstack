import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(pub, { recursive: true });

// A single art-deco chip, drawn centred at (cx,cy) with radius r.
function chip(cx, cy, r, body, accent, band = '#12100a', value = '♣', fs = 0.9) {
  const oct = (rr) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    }).join(' ');
  const spots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    const sx = cx + Math.cos(a) * r * 0.9;
    const sy = cy + Math.sin(a) * r * 0.9;
    return `<rect x="${sx - r * 0.12}" y="${sy - r * 0.08}" width="${r * 0.24}" height="${r * 0.16}" rx="${r * 0.08}" fill="${accent}" transform="rotate(${(i / 8) * 360} ${sx} ${sy})"/>`;
  }).join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${body}" stroke="${band}" stroke-width="${r * 0.05}"/>
    ${spots}
    <circle cx="${cx}" cy="${cy}" r="${r * 0.76}" fill="none" stroke="${accent}" stroke-width="${r * 0.03}"/>
    <polygon points="${oct(r * 0.68)}" fill="none" stroke="${accent}" stroke-width="${r * 0.028}"/>
    <rect x="${cx - r * 0.62}" y="${cy - r * 0.62}" width="${r * 1.24}" height="${r * 1.24}" transform="rotate(45 ${cx} ${cy})" fill="none" stroke="${accent}" stroke-width="${r * 0.022}"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${accent}" font-size="${r * fs}" font-weight="800" font-family="sans-serif">${value}</text>`;
}

function svg(size, { bleed }) {
  const cx = size / 2;
  // full-bleed: chip large; maskable: chip smaller, safe zone centred
  const r = bleed ? size * 0.42 : size * 0.32;
  const bg = '#0f0f15';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    <!-- back chips for depth -->
    ${chip(cx - r * 0.34, cx + r * 0.30, r * 0.9, '#7A3D9C', '#ECD6F4', '#241033', '', 0)}
    ${chip(cx + r * 0.30, cx + r * 0.16, r * 0.9, '#C0392B', '#F0D083', '#3a1310', '', 0)}
    <!-- front gold chip -->
    ${chip(cx, cx - r * 0.14, r, '#e4b41f', '#7a5810', '#6e5410', '♣', 0.95)}
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
