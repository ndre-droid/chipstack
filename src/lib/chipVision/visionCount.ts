import type { CountResult, DenomTotal, StackResult } from './types.ts';
import { tally, median, parseRead, FLAG_THRESHOLD, type StackRead } from './fuse.ts';

interface VisionDenom { value: number; color: string }
type StackBox = { value: number; box: [number, number, number, number] };
type Prefer = 'flash' | 'pro';

/** Progress ping so the UI can show WHICH stage is running (and where it stalls). */
export type CountStage = { phase: 'detecting' | 'reading' | 'fallback'; stacks?: number };

/**
 * Per-request AbortSignal that fires when EITHER `ms` elapses OR the caller's `external`
 * signal aborts (user cancel / outer timeout). `done()` clears the timer + detaches the
 * listener. Every network fetch goes through this: nothing can hang unbounded, and a
 * cancel/timeout tears down all in-flight work at once (so it stops billing immediately).
 */
function reqSignal(external: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  return { signal: ctrl.signal, done: () => { clearTimeout(to); external?.removeEventListener('abort', onAbort); } };
}

// Tuning knobs for the vote-and-crop pipeline.
const SAMPLES = 3;          // independent reads per stack (self-consistency vote → honest confidence)
const POOL = 6;             // max concurrent API calls (keep the free-tier key happy)
const REQ_TIMEOUT = 18000;  // per-request abort (ms) so one slow call can't stall the batch
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

/** Downscale a canvas to <= maxDim on its long side (returns src if already small). */
function resized(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  if (scale >= 1) return src;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Re-crop tight to the stack using its KNOWN denomination colour: mask pixels near that
 * colour, take the robust bounding box of the match, and crop to it. Removes clutter
 * (sunglasses/bag/paper) that leaked into the padded detection box. Bails to the input
 * if it can't get a confident colour lock (e.g. glare, or a near-grey chip on grey table).
 */
function tightenByColor(src: HTMLCanvasElement, hex: string): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const ctx = src.getContext('2d')!;
  const d = ctx.getImageData(0, 0, w, h).data;
  const [tr, tg, tb] = hexToRgb(hex);
  const tLuma = 0.299 * tr + 0.587 * tg + 0.114 * tb;
  const darkTarget = tLuma < 60;
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const match = darkTarget
        ? 0.299 * r + 0.587 * g + 0.114 * b < 75           // dark chip: match dark pixels
        : (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2 < 90 * 90; // coloured chip: RGB distance
      if (match) { xs.push(x); ys.push(y); }
    }
  }
  if (xs.length < 0.01 * w * h) return src; // not enough of the chip colour → don't risk it
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * arr.length)))];
  const padX = w * 0.08, padY = h * 0.08;
  const x0 = Math.max(0, q(xs, 0.02) - padX), x1 = Math.min(w, q(xs, 0.98) + padX);
  const y0 = Math.max(0, q(ys, 0.02) - padY), y1 = Math.min(h, q(ys, 0.98) + padY);
  const cw = Math.max(1, Math.round(x1 - x0)), ch = Math.max(1, Math.round(y1 - y0));
  if (cw < w * 0.3 && ch < h * 0.3) return src; // suspiciously tiny → probably a bad lock
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  c.getContext('2d')!.drawImage(src, Math.round(x0), Math.round(y0), cw, ch, 0, 0, cw, ch);
  return c;
}

/**
 * Per-crop auto-exposure: stretch the luminance histogram (1st–99th percentile) and lift
 * shadows with a mild gamma, so backlit/underexposed seams become visible. On-device, ~ms.
 */
function autoLevels(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  const total = (d.length / 4) | 0;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  if (hi - lo < 8) return src; // already well-exposed / flat → leave it
  const inv = 255 / (hi - lo), gamma = 0.85, lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) * inv / 255));
    lut[v] = Math.round(Math.pow(t, gamma) * 255);
  }
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
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
async function resolveModel(apiKey: string, prefer: Prefer, force = false, signal?: AbortSignal): Promise<string> {
  if (cachedModel[prefer] && !force) return cachedModel[prefer]!;
  const { signal: sig, done } = reqSignal(signal, REQ_TIMEOUT);
  try {
    const r = await fetch(`${MODELS_URL}?key=${encodeURIComponent(apiKey)}`, { signal: sig });
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
  finally { done(); }
  return FALLBACK_MODEL;
}

/**
 * POST to generateContent with the discovered model for `prefer`. If the model was
 * retired or gated, rediscover from the live list and retry once. OK response or throws.
 */
async function generate(apiKey: string, body: string, prefer: Prefer, signal?: AbortSignal): Promise<Response> {
  let model = await resolveModel(apiKey, prefer, false, signal);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    const { signal: sig, done } = reqSignal(signal, REQ_TIMEOUT);
    try {
      res = await fetch(`${MODELS_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: sig,
      });
    } catch {
      throw new Error('Could not reach the AI. Check your internet connection.');
    } finally {
      done();
    }
    if (res.ok) return res;

    let e: any = null;
    try { e = await res.json(); } catch { /* no JSON body */ }
    let msg = e?.error?.message || `AI error ${res.status}`;
    const modelGone = res.status === 404 ||
      /no longer available|not available|is not found|not found|not supported|unknown name|call listmodels/i.test(msg);

    if (attempt === 0 && modelGone) {
      const fresh = await resolveModel(apiKey, prefer, true, signal); // force a fresh ListModels
      if (fresh !== model) { model = fresh; continue; }
    }
    if ((res.status === 400 || res.status === 403) && !modelGone) msg = 'The AI key was rejected — check it in Settings.';
    if (res.status === 429) msg = 'AI rate limit reached — wait a moment and retry.';
    throw new Error(msg);
  }
  throw new Error('No usable AI model for this key — update the app, or check Google AI Studio.');
}

/** Small helper: POST one image+prompt, parse the JSON body the model returns. */
async function askJson(apiKey: string, prompt: string, b64: string, temperature: number, prefer: Prefer, signal?: AbortSignal): Promise<any> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  });
  const res = await generate(apiKey, body, prefer, signal);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** PASS 1 — locate every stack in the full frame and box it. */
async function detectStacks(apiKey: string, b64: string, list: string, signal?: AbortSignal): Promise<StackBox[]> {
  const prompt =
    `Photo of poker chips on a surface. Denominations by colour:\n${list}\n\n` +
    `Find every separate STACK of chips. Each stack is a single colour = one denomination. ` +
    `For each stack, return its denomination value and a TIGHT bounding box around JUST that stack, ` +
    `as normalized coordinates 0..1: [x0,y0,x1,y1] with origin at the TOP-LEFT, x increasing to the ` +
    `right, y increasing downward. Two separate stacks of the same colour are TWO entries. ` +
    `Ignore bags, cases, papers, hands and background. ` +
    `Respond with ONLY JSON: {"stacks":[{"value":<denom>,"box":[x0,y0,x1,y1]}]}.`;
  const p = await askJson(apiKey, prompt, b64, 0, 'flash', signal);
  const arr: any[] = Array.isArray(p) ? p : p?.stacks ?? [];
  return arr
    .map((s) => ({ value: Number(s?.value), box: normBox(s?.box) }))
    .filter((s): s is StackBox => !!s.box && Number.isFinite(s.value) && s.value > 0);
}

/**
 * Read ALL stacks in ONE request (Gemini accepts many images per call). Each crop is a
 * single isolated stack; for each we get a chip count and the stack's vertical extent.
 * Batching keeps the whole photo to ~1 detection + SAMPLES reads instead of one call per
 * stack per sample — the big cost + latency saver. Returns one StackRead|null per crop,
 * in the SAME order as `cropsB64`.
 */
async function readAllStacks(apiKey: string, cropsB64: string[], values: number[], temperature: number, signal?: AbortSignal): Promise<(StackRead | null)[]> {
  const n = cropsB64.length;
  const prompt =
    `You are given ${n} separate close-up images, labelled Image 1..${n}. Each image shows ONE stack of ` +
    `poker chips of a single colour. For EACH image:\n` +
    `1) COUNT the chips. Look at the VERTICAL SIDE: each chip is a thin ~3.3 mm disc; between two stacked ` +
    `chips there is a seam line. Number of chips = number of seams + 1. The flat top face is the TOP chip — ` +
    `count it once, never as an extra layer. Count the seams slowly, then recount to confirm.\n` +
    `2) Give "extent":[yTop,yBottom] = the top and bottom y (fractions 0..1 of THAT image) of the stack.\n` +
    `Respond with ONLY a JSON array with EXACTLY ${n} entries, in image order: ` +
    `[{"count":<int>,"extent":[<0..1>,<0..1>]}, ...].`;
  const parts: any[] = [{ text: prompt }];
  cropsB64.forEach((b64, k) => {
    parts.push({ text: `Image ${k + 1} (denomination ${values[k]}):` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  });
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json' } });
  const res = await generate(apiKey, body, 'flash', signal);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return values.map(() => null);
  let arr: any;
  try { arr = JSON.parse(text); } catch { return values.map(() => null); }
  const list: any[] = Array.isArray(arr) ? arr : arr?.stacks ?? [];
  return values.map((_, k) => parseRead(list[k]));
}

/**
 * Crop + on-device clean (tighten-by-colour + auto-expose) each boxed stack, then vote by
 * repeating one batched multi-image read SAMPLES times. Returns the cleaned crop canvases
 * (for the manual editor) and the per-sample reads.
 */
async function readBoxedStacks(
  canvas: HTMLCanvasElement,
  items: { value: number; box: [number, number, number, number] }[],
  colorByValue: Map<number, string>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ cropCanvases: HTMLCanvasElement[]; samples: (StackRead | null)[][] }> {
  // Crop from full-res, tighten to the known chip colour to drop clutter, auto-expose so
  // backlit seams show. The model image is 768px = one Gemini tile.
  const cropCanvases = items.map((it) => {
    const base = resized(cropCanvas(canvas, it.box, CROP_PAD), 1024);
    const hex = colorByValue.get(it.value);
    const tight = hex ? tightenByColor(base, hex) : base;
    return autoLevels(tight);
  });
  const crops = cropCanvases.map((cc) => toJpegBase64(cc, 768));
  const values = items.map((it) => it.value);
  // ~1 detection + SAMPLES reads total (all stacks per call), not SAMPLES per stack.
  const samples = await mapPool(Array.from({ length: SAMPLES }, (_, i) => i), POOL, () =>
    readAllStacks(apiKey, crops, values, 0.5, signal).catch(() => items.map(() => null)),
  );
  return { cropCanvases, samples };
}

/** Fallback PASS — no boxes found: vote a whole-image count per denomination. */
async function countWholeVoted(apiKey: string, b64: string, list: string, denoms: VisionDenom[], signal?: AbortSignal): Promise<DenomTotal[]> {
  const prompt =
    `You are counting poker chips in a photo. Each denomination is one solid colour:\n${list}\n\n` +
    `There are one or more STACKS, each a single colour = one denomination. Count the individual chips ` +
    `in each stack by counting the seam lines on the vertical side (chips = seams + 1); the flat top face ` +
    `is the top chip, counted once. Sum stacks that share a colour. Ignore non-chips. ` +
    `Respond with ONLY JSON: {"stacks":[{"value":<denom>,"count":<chips>}]}.`;
  const runs = await mapPool(Array.from({ length: SAMPLES }, (_, i) => i), POOL, async () => {
    const p = await askJson(apiKey, prompt, b64, 0.5, 'flash', signal).catch(() => null);
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

/** Sum per-stack results into DenomTotal rows, keeping the worst confidence per denom so the row flags. */
function sumStacksToDenoms(stacks: StackResult[]): DenomTotal[] {
  const byValue = new Map<number, { count: number; confidence: number }>();
  for (const s of stacks) {
    const prev = byValue.get(s.value);
    byValue.set(s.value, { count: (prev?.count ?? 0) + s.count, confidence: Math.min(prev?.confidence ?? 1, s.confidence) });
  }
  return [...byValue.entries()]
    .map(([value, { count, confidence }]) => ({ value, count, confidence }))
    .filter((t) => t.count > 0)
    .sort((a, b) => a.value - b.value);
}

/**
 * Count chips from a photo using Google's Gemini vision model, DIRECT from the browser with
 * the user's own key (no backend). This is an ASSIST, not an oracle: counting the seams of
 * same-colour stacked chips is genuinely hard, so we give a fast best-estimate the user
 * confirms/corrects in the review editor — no forced re-shoots, no false-confidence math.
 * Pipeline:
 *   1. detect + box each stack;
 *   2. crop + clean each stack, then read ALL crops together in one batched call, repeated
 *      SAMPLES times to vote. Batching = ~1 detection + SAMPLES calls per photo.
 * Confidence is self-consistency: the fraction of samples that agreed on the count. A stack
 * whose samples split is flagged as "worth a glance" — a soft hint, not an error.
 */
export async function countChipsWithVision(
  canvas: HTMLCanvasElement,
  denoms: VisionDenom[],
  apiKey: string,
  signal?: AbortSignal,
  onStage?: (s: CountStage) => void,
): Promise<CountResult> {
  const list = denoms.map((d) => `${d.value} = ${colorName(d.color)} (${d.color})`).join('; ');
  const fullB64 = toJpegBase64(canvas, 1024); // detection only needs rough boxes — keep it cheap

  onStage?.({ phase: 'detecting' });
  const boxes = await detectStacks(apiKey, fullB64, list, signal).catch(() => [] as StackBox[]);
  const valid = boxes.filter((b) => denoms.some((d) => d.value === b.value));

  let totals: DenomTotal[];
  let stacks: StackResult[] = [];
  if (!valid.length) {
    // Detection failed — degrade gracefully to a voted whole-image count.
    onStage?.({ phase: 'fallback' });
    totals = await countWholeVoted(apiKey, fullB64, list, denoms, signal);
  } else {
    // Crop + clean each stack on-device and vote via SAMPLES batched reads.
    const colorByValue = new Map(denoms.map((d) => [d.value, d.color]));
    onStage?.({ phase: 'reading', stacks: valid.length });
    const { cropCanvases, samples } = await readBoxedStacks(canvas, valid, colorByValue, apiKey, signal);

    const votes: number[][] = valid.map(() => []);
    const extents: [number, number][][] = valid.map(() => []);
    for (const reads of samples) {
      reads.forEach((res, i) => {
        if (res) {
          votes[i].push(res.count);
          if (res.extent) extents[i].push(res.extent);
        }
      });
    }

    // Per stack: majority vote = count, agreement = confidence, measured extent = editor end-caps.
    stacks = valid.map((b, i) => {
      const seam = votes[i].length ? tally(votes[i]) : { count: 0, agreement: 0 };
      const exT = median(extents[i].map((e) => e[0])), exB = median(extents[i].map((e) => e[1]));
      const span: [number, number] = exT != null && exB != null && exB > exT ? [exT, exB] : [0.06, 0.94];
      // A DETECTED stack that reads 0 is a failed read (flat top-only chip, dark/backlit, merged
      // seams) — NOT "zero chips". Never report it as a confident zero: force the flag so it shows
      // ⚠ and can't be silently saved as 0.
      const confidence = seam.count > 0 ? seam.agreement : 0;
      return {
        id: `${b.value}-${i}`, value: b.value, count: seam.count, confidence,
        crop: cropCanvases[i], span, flagged: seam.count === 0 || confidence < FLAG_THRESHOLD,
      };
    });

    // Sum stacks that share a denomination; keep the worst confidence so the row flags.
    totals = sumStacksToDenoms(stacks);
  }

  const totalValue = totals.reduce((s, t) => s + t.value * t.count, 0);
  const overall = totals.length ? Math.min(...totals.map((t) => t.confidence)) : 0;
  return { totals, totalValue, anomalies: [], frames: 1, confidence: overall, stacks };
}
