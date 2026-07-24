import * as THREE from 'three';

/**
 * Draws a SLOWPLAY Nash ceramic chip face onto a canvas and returns it as a
 * THREE.CanvasTexture: a matte body, a full-face gold art-deco lattice (octagon
 * frame + octagram + nested diamonds + radial ticks), the SLOWPLAY wordmark up
 * top, and the value in a horizontal double-bordered cartouche. The whole canvas
 * is painted with the body colour so the round cylinder cap has NO dark rim.
 * Cached per denom so a whole stack shares one texture.
 */

const cache = new Map<string, THREE.CanvasTexture>();

export function faceTexture(color: string, accent: string, value: number | string): THREE.CanvasTexture {
  const key = `${value}|${color}|${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(drawFace(color, accent, String(value)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function drawFace(color: string, accent: string, value: string): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const C = S / 2;
  const RR = S * 0.5; // the cylinder cap samples the full inscribed circle

  // --- body: fill the ENTIRE canvas so the cap edge is never bare (no black rim) ---
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  // soft top-left ceramic sheen (lighten only — never a dark edge)
  const sheen = g.createRadialGradient(C - RR * 0.32, C - RR * 0.36, RR * 0.05, C - RR * 0.1, C - RR * 0.1, RR * 1.15);
  sheen.addColorStop(0, hexA(mix(color, 0.18), 0.9));
  sheen.addColorStop(0.5, hexA(mix(color, 0.06), 0.35));
  sheen.addColorStop(1, hexA(color, 0));
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);

  // --- gold art-deco line-work ---
  g.strokeStyle = accent;
  g.lineJoin = 'miter';
  g.lineCap = 'butt';

  ring(g, octaPath(C, RR * 0.9, 0), S * 0.011, 0.95);
  ring(g, octaPath(C, RR * 0.82, 0), S * 0.004, 0.5);
  // octagram = two overlapping squares
  ring(g, squarePath(C, RR * 0.82, 0), S * 0.006, 0.82);
  ring(g, squarePath(C, RR * 0.82, Math.PI / 4), S * 0.006, 0.82);
  // even radial ticks between the star and the inner frame
  g.globalAlpha = 0.65;
  g.lineWidth = S * 0.0045;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    g.moveTo(C + Math.cos(a) * RR * 0.6, C + Math.sin(a) * RR * 0.6);
    g.lineTo(C + Math.cos(a) * RR * 0.76, C + Math.sin(a) * RR * 0.76);
  }
  g.stroke();
  g.globalAlpha = 1;
  // nested diamonds (rotated squares) — the art-deco centre frame
  ring(g, squarePath(C, RR * 0.6, Math.PI / 4), S * 0.006, 0.78);
  ring(g, squarePath(C, RR * 0.52, Math.PI / 4), S * 0.004, 0.5);

  // --- SLOWPLAY wordmark in a slim pill ---
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${S * 0.046}px system-ui, -apple-system, sans-serif`;
  try {
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${S * 0.007}px`;
  } catch { /* older engines ignore letterSpacing */ }
  const wy = C - RR * 0.6;
  const wm = g.measureText('SLOWPLAY');
  const pw = wm.width + S * 0.05;
  const ph = S * 0.078;
  roundRect(g, C - pw / 2, wy - ph / 2, pw, ph, ph * 0.5);
  g.fillStyle = hexA(mix(color, -0.28), 0.55);
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = S * 0.0035;
  g.globalAlpha = 0.75;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = accent;
  g.fillText('SLOWPLAY', C, wy + S * 0.002);
  g.restore();

  // --- value cartouche across the middle (double gold border) ---
  const bw = RR * 1.08;
  const bh = RR * 0.44;
  const bx = C - bw / 2;
  const by = C - bh / 2 + RR * 0.04;
  const bfill = mix(color, -0.32);
  roundRect(g, bx, by, bw, bh, bh * 0.18);
  g.fillStyle = bfill;
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = S * 0.008;
  g.stroke();
  roundRect(g, bx + bh * 0.16, by + bh * 0.16, bw - bh * 0.32, bh - bh * 0.32, bh * 0.1);
  g.lineWidth = S * 0.003;
  g.globalAlpha = 0.6;
  g.stroke();
  g.globalAlpha = 1;

  const ink = luminance(bfill) > 150 ? '#241d04' : '#ffffff';
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const vSize = value.length <= 2 ? bh * 0.62 : value.length === 3 ? bh * 0.5 : value.length === 4 ? bh * 0.4 : bh * 0.32;
  g.font = `800 ${vSize}px system-ui, -apple-system, sans-serif`;
  try {
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
  } catch { /* ignore */ }
  g.fillText(value, C, by + bh / 2 + bh * 0.02);

  return c;
}

// --- path helpers ---
function octaPath(C: number, r: number, rot: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + rot;
    const x = C + Math.cos(a) * r;
    const y = C + Math.sin(a) * r;
    i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
  }
  p.closePath();
  return p;
}
function squarePath(C: number, r: number, rot: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + rot;
    const x = C + Math.cos(a) * r;
    const y = C + Math.sin(a) * r;
    i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
  }
  p.closePath();
  return p;
}
function ring(g: CanvasRenderingContext2D, path: Path2D, lw: number, alpha: number) {
  g.globalAlpha = alpha;
  g.lineWidth = lw;
  g.stroke(path);
  g.globalAlpha = 1;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// --- colour helpers ---
function toRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}
function mix(hex: string, amt: number) {
  const { r, g, b } = toRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const c = (v: number) => f(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function hexA(hex: string, a: number) {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function luminance(hex: string) {
  const { r, g, b } = toRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
