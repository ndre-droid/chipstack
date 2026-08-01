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
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
}

// Google keeps retiring model ids and gating them "to new users only", so we don't
// hardcode one. Instead we ASK the user's key which models it can use (ListModels)
// and pick the best current vision model. FALLBACK is only used if that list fails.
const FALLBACK_MODEL = 'gemini-flash-latest';
const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

let cachedModel: string | null = null;

/** Rank a model name: newer version > flash > pro; avoid lite/preview/thinking. */
function scoreModel(name: string): number {
  let s = 0;
  const v = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  if (v) s += parseFloat(v[1]) * 100; // higher version wins
  if (/flash/i.test(name)) s += 40;   // flash: fast + cheap + multimodal
  else if (/pro/i.test(name)) s += 20;
  if (/latest/i.test(name)) s += 5;
  if (/-lite/i.test(name)) s -= 15;
  if (/preview|exp\b|experimental/i.test(name)) s -= 20;
  if (/thinking/i.test(name)) s -= 10; // slower/costlier, not needed for counting
  return s;
}

/** Discover a usable vision model for this key (cached). Falls back if the list call fails. */
async function resolveModel(apiKey: string, force = false): Promise<string> {
  if (cachedModel && !force) return cachedModel;
  try {
    const r = await fetch(`${MODELS_URL}?key=${encodeURIComponent(apiKey)}`);
    if (r.ok) {
      const j = await r.json();
      const models: any[] = j?.models ?? [];
      const usable = models
        .filter((m) =>
          (m?.supportedGenerationMethods ?? []).includes('generateContent') &&
          /gemini/i.test(m?.name ?? '') &&
          !/(embedding|aqa|imagen|tts|audio|image-generation)/i.test(m?.name ?? ''),
        )
        .map((m) => String(m.name).replace(/^models\//, ''))
        .sort((a, b) => scoreModel(b) - scoreModel(a));
      if (usable.length) {
        cachedModel = usable[0];
        return cachedModel;
      }
    }
  } catch { /* fall through to fallback */ }
  return FALLBACK_MODEL;
}

/**
 * POST to generateContent with the discovered model. If the model was retired or
 * gated ("no longer available to new users"), rediscover from the live list and
 * retry once with a different model. Returns the OK response or throws a clean error.
 */
async function generate(apiKey: string, body: string): Promise<Response> {
  let model = await resolveModel(apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${MODELS_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      throw new Error('Could not reach the AI. Check your internet connection.');
    }
    if (res.ok) return res;

    let e: any = null;
    try { e = await res.json(); } catch { /* no JSON body */ }
    let msg = e?.error?.message || `AI error ${res.status}`;
    const modelGone = res.status === 404 ||
      /no longer available|not available|is not found|not found|not supported|unknown name|call listmodels/i.test(msg);

    if (attempt === 0 && modelGone) {
      const fresh = await resolveModel(apiKey, true); // force a fresh ListModels
      if (fresh !== model) { model = fresh; continue; }
    }
    if ((res.status === 400 || res.status === 403) && !modelGone) msg = 'The AI key was rejected — check it in Settings.';
    if (res.status === 429) msg = 'AI rate limit reached — wait a moment and retry.';
    throw new Error(msg);
  }
  throw new Error('No usable AI model for this key — update the app, or check Google AI Studio.');
}

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
  const b64 = toJpegBase64(canvas, 1536);
  const prompt =
    `You are counting poker chips in a photo to split a poker bank. They are SLOWPLAY ceramic chips, ` +
    `each ~3.3 mm thick and ~39 mm wide. Each denomination is one solid colour:\n${list}\n\n` +
    `There are one or more STACKS, each stack a single colour = one denomination. Count how many ` +
    `individual chips are in each stack.\n\n` +
    `How to count precisely:\n` +
    `- Look at the VERTICAL SIDE of each stack. Each chip is a thin disc; between two stacked chips ` +
    `there is a visible seam line. Count the discs by counting these layers from bottom to top.\n` +
    `- The flat top face of the stack IS the top chip — count it once, never as an extra layer.\n` +
    `- Stacks are short; an off-by-one is a real error. Count the seams slowly, then recount to confirm ` +
    `before answering.\n` +
    `- If several separate stacks share a colour, sum their chips for that denomination.\n` +
    `- Ignore anything that is not a poker chip (bags, cases, papers, background).\n\n` +
    `SELF-CHECK each stack with TWO independent methods and reconcile:\n` +
    `  (A) count the seam lines on the side (chips = seams + 1);\n` +
    `  (B) estimate from proportions: a chip is ~3.3 mm thick and ~39 mm wide, so a stack of N chips ` +
    `is about N x 0.085 as TALL as the chip is WIDE (e.g. 4 chips ≈ 0.34 of the width). Judge the ` +
    `stack's height-to-width ratio in the image and estimate N.\n` +
    `  If A and B agree, confidence is high. If they differ, look again, pick the most reliable count, ` +
    `and lower the confidence. Report confidence 0.0–1.0 per stack.\n\n` +
    `Respond with ONLY JSON of this exact shape: {"stacks":[{"value":<denomination>,"count":<chips>,` +
    `"confidence":<0..1>,"how":"<seams=X, ratio=Y, final=Z>"}]}. No text outside the JSON.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });

  const res = await generate(apiKey, body);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('The AI returned no result — retake.');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('Could not read the AI result — retake.'); }

  const stacks: any[] = Array.isArray(parsed) ? parsed : parsed?.stacks ?? [];
  const byValue = new Map<number, { count: number; confidence: number }>();
  for (const s of stacks) {
    const v = Number(s?.value), c = Math.max(0, Math.round(Number(s?.count)));
    if (!v || !c || !denoms.some((d) => d.value === v)) continue; // drop hallucinated denoms
    // Model confidence 0..1; default a middling 0.7 if it omitted the field.
    const conf = Number.isFinite(Number(s?.confidence)) ? Math.max(0, Math.min(1, Number(s.confidence))) : 0.7;
    const prev = byValue.get(v);
    // When several stacks share a denom, keep the WORST confidence so the row still flags.
    byValue.set(v, { count: (prev?.count ?? 0) + c, confidence: Math.min(prev?.confidence ?? 1, conf) });
  }
  const totals: DenomTotal[] = [...byValue.entries()]
    .map(([value, { count, confidence }]) => ({ value, count, confidence }))
    .sort((a, b) => a.value - b.value);
  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  const overall = totals.length ? Math.min(...totals.map((t) => t.confidence)) : 0;
  return { totals, totalValue, anomalies: [], frames: 1, confidence: overall };
}
