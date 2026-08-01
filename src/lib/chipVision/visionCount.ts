import type { CountResult, DenomTotal } from './types.ts';

interface VisionDenom { value: number; color: string }
type StackBox = { value: number; box: [number, number, number, number] };
type Prefer = 'flash' | 'pro';

// Tuning knobs for the vote-and-crop pipeline.
const SAMPLES = 5;          // independent flash counts per stack (self-consistency vote)
const POOL = 6;             // max concurrent API calls (keep the free-tier key happy)
const TIEBREAK_CONF = 0.6;  // below this agreement, ask the stronger `pro` model to decide
const CROP_PAD = 0.12;      // fraction of the box to pad when cropping a stack

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

/** Crop a normalized box (0..1, top-left origin) out of a canvas, with padding. */
function cropCanvas(src: HTMLCanvasElement, box: [number, number, number, number], pad: number): HTMLCanvasElement {
  const [x0, y0, x1, y1] = box;
  const px0 = Math.max(0, x0 - pad), py0 = Math.max(0, y0 - pad);
  const px1 = Math.min(1, x1 + pad), py1 = Math.min(1, y1 + pad);
  const sx = Math.round(px0 * src.width), sy = Math.round(py0 * src.height);
  const sw = Math.max(1, Math.round((px1 - px0) * src.width));
  const sh = Math.max(1, Math.round((py1 - py0) * src.height));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

/** Validate + clamp a model-returned box into a usable [x0,y0,x1,y1] or null. */
function normBox(raw: any): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  let [x0, y0, x1, y1] = raw.map((n) => Number(n));
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  // Some models emit 0..1000 instead of 0..1 — normalize if it looks scaled.
  if (Math.max(x0, y0, x1, y1) > 1.5) { x0 /= 1000; y0 /= 1000; x1 /= 1000; y1 /= 1000; }
  x0 = Math.max(0, Math.min(1, x0)); y0 = Math.max(0, Math.min(1, y0));
  x1 = Math.max(0, Math.min(1, x1)); y1 = Math.max(0, Math.min(1, y1));
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null; // degenerate
  return [x0, y0, x1, y1];
}

/** Majority vote over a list of counts. Ties break toward the smaller count. */
function tally(counts: number[]): { count: number; agreement: number } {
  const m = new Map<number, number>();
  let best = counts[0], bestN = 0;
  for (const c of counts) {
    const n = (m.get(c) ?? 0) + 1; m.set(c, n);
    if (n > bestN || (n === bestN && c < best)) { best = c; bestN = n; }
  }
  return { count: best, agreement: bestN / counts.length };
}

/** Run an async fn over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Google keeps retiring model ids and gating them "to new users only", so we don't
// hardcode one. Instead we ASK the user's key which models it can use (ListModels)
// and pick the best current vision model. FALLBACK is only used if that list fails.
const FALLBACK_MODEL = 'gemini-flash-latest';
const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const cachedModel: Record<Prefer, string | null> = { flash: null, pro: null };

/** Rank a model name for the requested preference; avoid lite/preview/thinking. */
function scoreModel(name: string, prefer: Prefer): number {
  let s = 0;
  const v = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  if (v) s += parseFloat(v[1]) * 100; // higher version wins
  const isFlash = /flash/i.test(name), isPro = /pro/i.test(name);
  if (prefer === 'pro') { if (isPro) s += 50; else if (isFlash) s += 25; }
  else { if (isFlash) s += 40; else if (isPro) s += 20; }
  if (/latest/i.test(name)) s += 5;
  if (/-lite/i.test(name)) s -= 15;
  if (/preview|exp\b|experimental/i.test(name)) s -= 20;
  if (/thinking/i.test(name)) s -= 10; // slower/costlier, not needed for counting
  return s;
}

/** Discover a usable vision model for this key + preference (cached). */
async function resolveModel(apiKey: string, prefer: Prefer, force = false): Promise<string> {
  if (cachedModel[prefer] && !force) return cachedModel[prefer]!;
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
        .sort((a, b) => scoreModel(b, prefer) - scoreModel(a, prefer));
      if (usable.length) { cachedModel[prefer] = usable[0]; return usable[0]; }
    }
  } catch { /* fall through to fallback */ }
  return FALLBACK_MODEL;
}

/**
 * POST to generateContent with the discovered model for `prefer`. If the model was
 * retired or gated, rediscover from the live list and retry once. OK response or throws.
 */
async function generate(apiKey: string, body: string, prefer: Prefer): Promise<Response> {
  let model = await resolveModel(apiKey, prefer);
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
      const fresh = await resolveModel(apiKey, prefer, true); // force a fresh ListModels
      if (fresh !== model) { model = fresh; continue; }
    }
    if ((res.status === 400 || res.status === 403) && !modelGone) msg = 'The AI key was rejected — check it in Settings.';
    if (res.status === 429) msg = 'AI rate limit reached — wait a moment and retry.';
    throw new Error(msg);
  }
  throw new Error('No usable AI model for this key — update the app, or check Google AI Studio.');
}

/** Small helper: POST one image+prompt, parse the JSON body the model returns. */
async function askJson(apiKey: string, prompt: string, b64: string, temperature: number, prefer: Prefer): Promise<any> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  });
  const res = await generate(apiKey, body, prefer);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** PASS 1 — locate every stack in the full frame and box it. */
async function detectStacks(apiKey: string, b64: string, list: string): Promise<StackBox[]> {
  const prompt =
    `Photo of poker chips on a surface. Denominations by colour:\n${list}\n\n` +
    `Find every separate STACK of chips. Each stack is a single colour = one denomination. ` +
    `For each stack, return its denomination value and a TIGHT bounding box around JUST that stack, ` +
    `as normalized coordinates 0..1: [x0,y0,x1,y1] with origin at the TOP-LEFT, x increasing to the ` +
    `right, y increasing downward. Two separate stacks of the same colour are TWO entries. ` +
    `Ignore bags, cases, papers, hands and background. ` +
    `Respond with ONLY JSON: {"stacks":[{"value":<denom>,"box":[x0,y0,x1,y1]}]}.`;
  const p = await askJson(apiKey, prompt, b64, 0, 'flash');
  const arr: any[] = Array.isArray(p) ? p : p?.stacks ?? [];
  return arr
    .map((s) => ({ value: Number(s?.value), box: normBox(s?.box) }))
    .filter((s): s is StackBox => !!s.box && Number.isFinite(s.value) && s.value > 0);
}

/** Count ONE isolated stack (a per-stack crop). Returns chip count or null. */
async function countOneStack(apiKey: string, b64: string, denomValue: number, temperature: number, prefer: Prefer): Promise<number | null> {
  const prompt =
    `This close-up shows ONE stack of poker chips, all the same colour (denomination ${denomValue}). ` +
    `Count how many individual chips are in the stack.\n` +
    `- Look at the VERTICAL SIDE. Each chip is a thin ~3.3 mm disc; between two stacked chips there is a ` +
    `visible seam line. Number of chips = number of seams + 1.\n` +
    `- The flat top face is the TOP chip — count it once, never as an extra layer.\n` +
    `- Count the seams slowly from bottom to top, then recount to confirm.\n` +
    `Respond with ONLY JSON: {"count":<integer>}.`;
  const p = await askJson(apiKey, prompt, b64, temperature, prefer);
  const n = Math.round(Number(Array.isArray(p) ? p?.[0]?.count : p?.count));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Fallback PASS — no boxes found: vote a whole-image count per denomination. */
async function countWholeVoted(apiKey: string, b64: string, list: string, denoms: VisionDenom[]): Promise<DenomTotal[]> {
  const prompt =
    `You are counting poker chips in a photo. Each denomination is one solid colour:\n${list}\n\n` +
    `There are one or more STACKS, each a single colour = one denomination. Count the individual chips ` +
    `in each stack by counting the seam lines on the vertical side (chips = seams + 1); the flat top face ` +
    `is the top chip, counted once. Sum stacks that share a colour. Ignore non-chips. ` +
    `Respond with ONLY JSON: {"stacks":[{"value":<denom>,"count":<chips>}]}.`;
  const runs = await mapPool(Array.from({ length: SAMPLES }, (_, i) => i), POOL, async () => {
    const p = await askJson(apiKey, prompt, b64, 0.5, 'flash').catch(() => null);
    const arr: any[] = Array.isArray(p) ? p : p?.stacks ?? [];
    const m = new Map<number, number>();
    for (const s of arr) {
      const v = Number(s?.value), c = Math.max(0, Math.round(Number(s?.count)));
      if (v && c && denoms.some((d) => d.value === v)) m.set(v, (m.get(v) ?? 0) + c);
    }
    return m;
  });
  const votesByValue = new Map<number, number[]>();
  for (const m of runs) for (const [v, c] of m) (votesByValue.get(v) ?? votesByValue.set(v, []).get(v)!).push(c);
  return [...votesByValue.entries()]
    .map(([value, votes]) => { const { count, agreement } = tally(votes); return { value, count, confidence: agreement }; })
    .filter((t) => t.count > 0)
    .sort((a, b) => a.value - b.value);
}

/**
 * Count chips from a photo using Google's Gemini vision model, DIRECT from the browser
 * with the user's own key (no backend). Pipeline: (1) detect + box each stack; (2) crop
 * each stack and count it 5× independently, majority-vote the count; (3) when a stack's
 * votes disagree, let the stronger `pro` model break the tie. Confidence is the real
 * vote agreement, not the model's self-report.
 */
export async function countChipsWithVision(
  canvas: HTMLCanvasElement,
  denoms: VisionDenom[],
  apiKey: string,
): Promise<CountResult> {
  const list = denoms.map((d) => `${d.value} = ${colorName(d.color)} (${d.color})`).join('; ');
  const fullB64 = toJpegBase64(canvas, 1536);

  const boxes = await detectStacks(apiKey, fullB64, list).catch(() => [] as StackBox[]);
  const valid = boxes.filter((b) => denoms.some((d) => d.value === b.value));

  let totals: DenomTotal[];
  if (!valid.length) {
    // Detection failed — degrade gracefully to a voted whole-image count.
    totals = await countWholeVoted(apiKey, fullB64, list, denoms);
  } else {
    // Crop each detected stack so it fills the frame (thin seams get real pixels).
    const crops = valid.map((b) => toJpegBase64(cropCanvas(canvas, b.box, CROP_PAD), 1024));

    // Fire SAMPLES flash counts per stack, pooled for the free-tier rate limit.
    const tasks = valid.flatMap((_, i) => Array.from({ length: SAMPLES }, () => i));
    const votes: number[][] = valid.map(() => []);
    await mapPool(tasks, POOL, async (i) => {
      const n = await countOneStack(apiKey, crops[i], valid[i].value, 0.5, 'flash').catch(() => null);
      if (n != null) votes[i].push(n);
    });

    // Tally each stack; break low-agreement ties with the pro model.
    const perStack = await Promise.all(valid.map(async (b, i) => {
      const vs = votes[i];
      if (!vs.length) return { value: b.value, count: 0, confidence: 0 };
      let { count, agreement } = tally(vs);
      if (agreement < TIEBREAK_CONF) {
        const pro = await countOneStack(apiKey, crops[i], b.value, 0, 'pro').catch(() => null);
        if (pro != null) {
          const flashMode = count;
          count = pro;
          agreement = pro === flashMode ? Math.max(agreement, 0.8) : 0.55; // confirmed vs overruled
        }
      }
      return { value: b.value, count, confidence: agreement };
    }));

    // Sum stacks that share a denomination; keep the worst confidence so the row flags.
    const byValue = new Map<number, { count: number; confidence: number }>();
    for (const s of perStack) {
      const prev = byValue.get(s.value);
      byValue.set(s.value, { count: (prev?.count ?? 0) + s.count, confidence: Math.min(prev?.confidence ?? 1, s.confidence) });
    }
    totals = [...byValue.entries()]
      .map(([value, { count, confidence }]) => ({ value, count, confidence }))
      .filter((t) => t.count > 0)
      .sort((a, b) => a.value - b.value);
  }

  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  const overall = totals.length ? Math.min(...totals.map((t) => t.confidence)) : 0;
  return { totals, totalValue, anomalies: [], frames: 1, confidence: overall };
}
