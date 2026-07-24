import * as THREE from 'three';

/**
 * Draws a SLOWPLAY Nash ceramic chip face onto a canvas and returns it as a
 * THREE.CanvasTexture: a full-face gold art-deco lattice (octagon frame +
 * octagram + radial ticks), the SLOWPLAY wordmark up top, and the value in a
 * horizontal cartouche across the middle. Textures are cached per denom so a
 * whole stack shares one.
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
  const R = S * 0.47;

  // --- ceramic body with a soft top-left sheen ---
  const body = g.createRadialGradient(C - R * 0.34, C - R * 0.4, R * 0.1, C, C, R * 1.15);
  body.addColorStop(0, mix(color, 0.17));
  body.addColorStop(0.72, color);
  body.addColorStop(1, mix(color, -0.2));
  g.fillStyle = body;
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.fill();

  // --- gold art-deco line-work ---
  g.strokeStyle = accent;
  g.lineJoin = 'round';
  g.lineCap = 'round';

  ring(g, C, octaPath(C, R * 0.985, 0), S * 0.012, 0.95);
  ring(g, C, octaPath(C, R * 0.9, 0), S * 0.005, 0.55);
  // octagram = two overlapping squares
  ring(g, C, squarePath(C, R * 0.82, 0), S * 0.006, 0.85);
  ring(g, C, squarePath(C, R * 0.82, Math.PI / 4), S * 0.006, 0.85);
  // radial ticks
  g.globalAlpha = 0.7;
  g.lineWidth = S * 0.005;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * R * 0.55, C + Math.sin(a) * R * 0.55);
    g.lineTo(C + Math.cos(a) * R * 0.8, C + Math.sin(a) * R * 0.8);
    g.stroke();
  }
  g.globalAlpha = 1;
  ring(g, C, octaPath(C, R * 0.5, Math.PI / 8), S * 0.006, 0.8);

  // --- SLOWPLAY wordmark ---
  g.save();
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${S * 0.05}px system-ui, -apple-system, sans-serif`;
  try {
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${S * 0.008}px`;
  } catch { /* older engines ignore letterSpacing */ }
  g.fillText('SLOWPLAY', C, C - R * 0.6);
  g.restore();

  // --- value cartouche across the middle ---
  const bw = R * 1.12;
  const bh = R * 0.46;
  const bx = C - bw / 2;
  const by = C - bh / 2;
  const bfill = mix(color, -0.34);
  roundRect(g, bx, by, bw, bh, bh * 0.16);
  g.fillStyle = bfill;
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = S * 0.007;
  g.stroke();
  roundRect(g, bx + bh * 0.14, by + bh * 0.14, bw - bh * 0.28, bh - bh * 0.28, bh * 0.1);
  g.lineWidth = S * 0.003;
  g.globalAlpha = 0.6;
  g.stroke();
  g.globalAlpha = 1;

  const ink = luminance(bfill) > 150 ? '#2a2205' : '#ffffff';
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const vSize = value.length <= 2 ? R * 0.4 : value.length === 3 ? R * 0.32 : value.length === 4 ? R * 0.26 : R * 0.2;
  g.font = `800 ${vSize}px system-ui, -apple-system, sans-serif`;
  g.fillText(value, C, C + bh * 0.02);

  return c;
}

// --- path helpers (build a closed path; caller sets stroke) ---
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

function ring(g: CanvasRenderingContext2D, _C: number, path: Path2D, lw: number, alpha: number) {
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
function luminance(hex: string) {
  const { r, g, b } = toRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
