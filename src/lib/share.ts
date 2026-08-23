import type { AppState, Denomination, SessionConfig, Settings } from '../types';
// the .ts extension is what lets `node --experimental-strip-types` run share.test.ts
import { shareableSettings } from './settingsScope.ts';

const uid = () => Math.random().toString(36).slice(2, 9);

// UTF-8 safe base64 (handles € etc.)
const b64encode = (s: string) => btoa(unescape(encodeURIComponent(s)));
const b64decode = (s: string) => decodeURIComponent(escape(atob(s)));

interface Payload {
  v: 1;
  d: [number, number, string, string, number, number, number][];
  s: SessionConfig;
  /* Partial on purpose: the code carries the SETUP — chips, blinds, money, looks —
     and nothing that identifies the phone that made it. It used to carry the whole
     `Settings` object, which meant a shared code contained the sender's live pairing
     code and guest name, and (once a big-screen photo had been picked) a few hundred
     kB of base64 that no QR reader on earth could scan. See lib/settingsScope. */
  g: Partial<Settings>;
}

/** Compact, shareable code for the whole setup (chips + session + settings). */
export function encodeSetup(state: Pick<AppState, 'denominations' | 'session' | 'settings'>): string {
  const payload: Payload = {
    v: 1,
    d: state.denominations.map((x) => [
      x.value,
      x.count,
      x.color,
      x.accent,
      x.enabled ? 1 : 0,
      x.shape === 'plaque' ? 1 : 0,
      Math.max(0, Math.floor(x.minPerPlayer ?? 0)),
    ]),
    s: state.session,
    g: shareableSettings(state.settings),
  };
  return 'CS1:' + b64encode(JSON.stringify(payload));
}

export function decodeSetup(code: string):
  | { denominations: Denomination[]; session: SessionConfig; settings: Partial<Settings> }
  | null {
  try {
    const raw = code.trim().replace(/^CS1:/, '');
    const payload = JSON.parse(b64decode(raw)) as Payload;
    if (!payload || payload.v !== 1 || !Array.isArray(payload.d)) return null;
    const denominations: Denomination[] = payload.d.map((a) => ({
      id: uid(),
      value: a[0],
      count: a[1],
      color: a[2],
      accent: a[3],
      enabled: !!a[4],
      shape: a[5] ? 'plaque' : 'chip',
      minPerPlayer: a[6] ?? 0,
    }));
    return { denominations, session: payload.s, settings: payload.g };
  } catch {
    return null;
  }
}

interface ImageStack {
  denom: { value: number; color: string; count: number; shape?: string };
}

/** Render a shareable PNG of the starting stack. Returns a data URL. */
export function renderStackImage(opts: {
  title: string;
  subtitle: string;
  rows: { value: number; color: string; count: number; shape?: string }[];
  totalChips: number;
  totalLabel: string;
}): string {
  const scale = 2;
  const W = 720;
  const rowH = 64;
  const top = 150;
  const H = top + opts.rows.length * rowH + 90;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);

  // background
  ctx.fillStyle = '#0f0f15';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#17171d';
  roundRect(ctx, 16, 16, W - 32, H - 32, 22);
  ctx.fill();

  // title
  ctx.fillStyle = '#e4b41f';
  ctx.font = '800 30px Inter, sans-serif';
  ctx.fillText('♣ ' + opts.title, 40, 62);
  ctx.fillStyle = '#9a9aa6';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText(opts.subtitle, 40, 92);
  ctx.strokeStyle = '#2b2b35';
  ctx.beginPath();
  ctx.moveTo(40, 120);
  ctx.lineTo(W - 40, 120);
  ctx.stroke();

  opts.rows.forEach((r, i) => {
    const y = top + i * rowH;
    // chip / plaque swatch
    ctx.fillStyle = r.color;
    if (r.shape === 'plaque') {
      roundRect(ctx, 44, y - 20, 54, 34, 6);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(66, y - 3, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    // value
    ctx.fillStyle = '#f6f6f8';
    ctx.font = '700 22px Inter, sans-serif';
    ctx.fillText(String(r.value), 120, y + 4);
    // count
    ctx.fillStyle = '#f0cb54';
    ctx.font = '800 26px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('× ' + r.count, W - 44, y + 4);
    ctx.textAlign = 'left';
  });

  // footer
  const fy = top + opts.rows.length * rowH + 30;
  ctx.strokeStyle = '#2b2b35';
  ctx.beginPath();
  ctx.moveTo(40, fy - 24);
  ctx.lineTo(W - 40, fy - 24);
  ctx.stroke();
  ctx.fillStyle = '#9a9aa6';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText(`${opts.totalChips} chips`, 44, fy + 6);
  ctx.fillStyle = '#e4b41f';
  ctx.font = '800 22px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(opts.totalLabel, W - 44, fy + 8);
  ctx.textAlign = 'left';

  return c.toDataURL('image/png');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type { ImageStack };

/**
 * The night's settlement as a picture, for the group chat.
 *
 * Text works, but a table of eight names and amounts turns into an unreadable wall
 * on a phone keyboard — and this is the message everybody screenshots anyway.
 */
export function renderSettlementImage(opts: {
  title: string;
  subtitle: string;
  nets: { name: string; emoji?: string; net: number }[];
  transfers: { from: string; to: string; amount: number }[];
  format: (n: number) => string;
  paysLabel: string;
  netLabel: string;
  payLabel: string;
}): string {
  const scale = 2;
  const W = 720;
  const rowH = 46;
  const head = 132;
  const gap = 34;
  const H =
    head + gap + opts.nets.length * rowH + (opts.transfers.length ? gap + 26 + opts.transfers.length * rowH : 0) + 50;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0f0f15';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#17171d';
  roundRect(ctx, 16, 16, W - 32, H - 32, 22);
  ctx.fill();

  ctx.fillStyle = '#e4b41f';
  ctx.font = '800 30px Inter, sans-serif';
  ctx.fillText('♣ ' + opts.title, 40, 62);
  ctx.fillStyle = '#9a9aa6';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText(opts.subtitle, 40, 92);
  ctx.strokeStyle = '#2b2b35';
  ctx.beginPath();
  ctx.moveTo(40, 112);
  ctx.lineTo(W - 40, 112);
  ctx.stroke();

  let y = head + 20;
  ctx.fillStyle = '#6e6e7a';
  ctx.font = '700 13px Inter, sans-serif';
  ctx.fillText(opts.netLabel.toUpperCase(), 40, y - 14);
  for (const n of opts.nets) {
    ctx.fillStyle = '#e9e9ef';
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillText(`${n.emoji ? n.emoji + ' ' : ''}${n.name}`, 44, y + 6);
    ctx.fillStyle = n.net >= 0 ? '#43c58a' : '#ff6b6b';
    ctx.font = '800 20px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${n.net >= 0 ? '+' : ''}${opts.format(n.net)}`, W - 44, y + 6);
    ctx.textAlign = 'left';
    y += rowH;
  }

  if (opts.transfers.length) {
    y += gap;
    ctx.fillStyle = '#6e6e7a';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText(opts.payLabel.toUpperCase(), 40, y - 14);
    for (const tr of opts.transfers) {
      ctx.fillStyle = '#e9e9ef';
      ctx.font = '600 19px Inter, sans-serif';
      ctx.fillText(`${tr.from}  →  ${tr.to}`, 44, y + 6);
      ctx.fillStyle = '#e4b41f';
      ctx.font = '800 19px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(opts.format(tr.amount), W - 44, y + 6);
      ctx.textAlign = 'left';
      y += rowH;
    }
  }

  ctx.fillStyle = '#4a4a56';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('ChipStack', 40, H - 34);
  return c.toDataURL('image/png');
}
