import type { CountResult, DenomTotal } from './types.ts';

interface VisionDenom { value: number; color: string }

/** Rough colour name from a hex, to help the model match stacks to denominations. */
function colorName(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 510;
  const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
  if (s < 0.15) return l > 0.78 ? 'cream/white' : l < 0.22 ? 'black' : 'grey';
  const d = max - min;
  let hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hh *= 60; if (hh < 0) hh += 360;
  if (hh < 15 || hh >= 345) return 'red';
  if (hh < 40) return l < 0.45 ? 'brown' : 'orange';
  if (hh < 70) return 'yellow/gold';
  if (hh < 160) return 'green';
  if (hh < 200) return 'cyan/teal';
  if (hh < 255) return 'blue';
  if (hh < 300) return 'purple';
  return 'pink';
}

/** Downscale a canvas and return a JPEG as base64 (no data-URL prefix). */
function toJpegBase64(canvas: HTMLCanvasElement, maxDim: number): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// Gemini vision model. gemini-2.0-flash was retired (Aug 2026) → 2.5-flash: GA, vision,
// fast, generous free tier. If Google retires this one too, bump the id here.
const MODEL = 'gemini-2.5-flash';

/**
 * Count chips by sending the photo to Google's Gemini vision model. Runs directly
 * from the app (Gemini allows browser calls with an API key — no backend needed).
 * The key is the user's, stored on-device only. Feeds the same editable review.
 */
export async function countChipsWithVision(
  canvas: HTMLCanvasElement,
  denoms: VisionDenom[],
  apiKey: string,
): Promise<CountResult> {
  const list = denoms.map((d) => `${d.value} = ${colorName(d.color)} (${d.color})`).join('; ');
  const b64 = toJpegBase64(canvas, 1024);
  const prompt =
    `Count the poker chips in this photo. They are SLOWPLAY ceramic chips; each denomination is a distinct colour:\n${list}\n` +
    `Each separate stack is one colour = one denomination. Count how many chips are in each stack (count the individual chip layers). ` +
    `If several stacks share a colour, sum them. Ignore anything that is not a poker chip. ` +
    `Respond with ONLY JSON of this shape: {"stacks":[{"value":<denomination>,"count":<chips>}]}. No commentary.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
  } catch {
    throw new Error('Could not reach the AI. Check your internet connection.');
  }
  if (!res.ok) {
    let msg = `AI error ${res.status}`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch { /* keep default */ }
    if (res.status === 400 || res.status === 403) msg = 'The AI key was rejected — check it in Settings.';
    if (res.status === 429) msg = 'AI rate limit reached — wait a moment and retry.';
    throw new Error(msg);
  }

  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('The AI returned no result — retake.');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('Could not read the AI result — retake.'); }

  const stacks: any[] = Array.isArray(parsed) ? parsed : parsed?.stacks ?? [];
  const byValue = new Map<number, number>();
  for (const s of stacks) {
    const v = Number(s?.value), c = Math.max(0, Math.round(Number(s?.count)));
    if (!v || !c || !denoms.some((d) => d.value === v)) continue; // drop hallucinated denoms
    byValue.set(v, (byValue.get(v) ?? 0) + c);
  }
  const totals: DenomTotal[] = [...byValue.entries()]
    .map(([value, count]) => ({ value, count, confidence: 0.85 }))
    .sort((a, b) => a.value - b.value);
  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  return { totals, totalValue, anomalies: [], frames: 1, confidence: totals.length ? 0.85 : 0 };
}
