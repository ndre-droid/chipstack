import type { CountResult, DenomTotal } from './types.ts';

interface VisionDenom { value: number; color: string }
type StackBox = { value: number; box: [number, number, number, number] };
type Prefer = 'flash' | 'pro';
/** One flash/pro reading of a single stack: chip count + measured height:diameter ratio. */
type StackRead = { count: number; r: number | null };

// Tuning knobs for the vote-and-crop pipeline.
const SAMPLES = 3;          // independent flash reads per stack (self-consistency vote)
const POOL = 6;             // max concurrent API calls (keep the free-tier key happy)
const REQ_TIMEOUT = 18000;  // per-request abort (ms) so one slow call can't stall the batch
const CROP_PAD = 0.12;      // fraction of the box to pad when cropping a stack
const NOMINAL_K = 0.085;    // chip thickness / diameter (3.3 mm / 39 mm) — geometry prior
const K_MIN = 0.05, K_MAX = 0.13; // plausible band for the calibrated ratio

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

/** Median of a numeric list, or null if empty. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * On-device DSP voter (model-free). On an already-cropped single stack, project the image
 * to a 1-D edge-energy profile along the stack axis and find the chip pitch by
 * autocorrelation; the seam lines are periodic, so a sharp peak = clean periodicity.
 * Returns a chip count + a strength 0..1, or null when periodicity is too weak to trust.
 * Runs synchronously in ~a few ms on a downscaled copy — adds no network time.
 *
 * Deliberately used ONLY to CONFIRM the seam/geometry candidates (see fusion): a
 * miscalibrated read simply won't match either and abstains, so it can never inject a
 * wrong number.
 */
function dspCount(src: HTMLCanvasElement): { count: number; strength: number } | null {
  const LONG = 220; // downscale for speed; seams still resolvable at this size
  const scale = Math.min(1, LONG / Math.max(src.width, src.height));
  const w = Math.max(8, Math.round(src.width * scale)), h = Math.max(8, Math.round(src.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };

  // Stack axis = the longer dimension; seams run across it.
  const vertical = h >= w;
  const axisLen = vertical ? h : w, crossLen = vertical ? w : h;
  const c0 = Math.floor(crossLen * 0.25), c1 = Math.max(c0 + 1, Math.ceil(crossLen * 0.75));

  // Edge-energy profile along the axis (gradient in the axis direction).
  const prof = new Float64Array(axisLen);
  for (let a = 1; a < axisLen; a++) {
    let s = 0;
    for (let cc = c0; cc < c1; cc++) s += Math.abs((vertical ? gray(cc, a) : gray(a, cc)) - (vertical ? gray(cc, a - 1) : gray(a - 1, cc)));
    prof[a] = s / (c1 - c0);
  }
  // Smooth (window 3) and remove DC.
  const sm = new Float64Array(axisLen);
  for (let a = 0; a < axisLen; a++) { let s = 0, n = 0; for (let k = -1; k <= 1; k++) { const j = a + k; if (j >= 0 && j < axisLen) { s += prof[j]; n++; } } sm[a] = s / n; }
  let mean = 0; for (let a = 0; a < axisLen; a++) mean += sm[a]; mean /= axisLen;
  let varSum = 0; for (let a = 0; a < axisLen; a++) { sm[a] -= mean; varSum += sm[a] * sm[a]; }
  if (varSum <= 1e-6) return null;
  const std = Math.sqrt(varSum / axisLen);

  // Autocorrelation over plausible chip pitches → dominant pitch L*.
  const minL = Math.max(3, Math.round(axisLen * 0.03)), maxL = Math.floor(axisLen / 2);
  if (maxL <= minL) return null;
  let bestL = -1, bestC = -Infinity;
  for (let L = minL; L <= maxL; L++) {
    let s = 0; for (let a = L; a < axisLen; a++) s += sm[a] * sm[a - L];
    const cor = s / varSum;
    if (cor > bestC) { bestC = cor; bestL = L; }
  }
  if (bestL < 0 || bestC < 0.35) return null; // weak periodicity → abstain

  // Energetic span (first→last strong seam edge) ÷ pitch = seams; chips = seams + 1.
  const thr = 0.5 * std;
  let first = -1, last = -1;
  for (let a = 0; a < axisLen; a++) if (sm[a] > thr) { if (first < 0) first = a; last = a; }
  if (first < 0 || last - first < bestL) return null;
  const chips = Math.round((last - first) / bestL) + 1;
  if (chips < 1 || chips > 40) return null;
  return { count: chips, strength: Math.max(0, Math.min(1, bestC)) };
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
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);
    try {
      res = await fetch(`${MODELS_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
    } catch {
      throw new Error('Could not reach the AI. Check your internet connection.');
    } finally {
      clearTimeout(to);
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

/** Parse one {count,stackHeight,chipDiameter} object into a StackRead (or null). */
function parseRead(obj: any): StackRead | null {
  const n = Math.round(Number(obj?.count));
  if (!Number.isFinite(n) || n < 0) return null;
  const h = Number(obj?.stackHeight), d = Number(obj?.chipDiameter);
  const r = Number.isFinite(h) && Number.isFinite(d) && d > 0.01 && h > 0 ? h / d : NaN;
  return { count: n, r: Number.isFinite(r) && r >= 0.03 && r <= 4 ? r : null };
}

/**
 * Read ALL stacks in ONE request (Gemini accepts many images per call). Each crop is a
 * single isolated stack; for each we get a seam count AND a measured height:diameter ratio.
 * Batching keeps the whole photo to ~1 detection + SAMPLES reads instead of one call per
 * stack per sample — the big cost + latency saver. Returns one StackRead|null per crop,
 * in the SAME order as `cropsB64`.
 */
async function readAllStacks(apiKey: string, cropsB64: string[], values: number[], temperature: number): Promise<(StackRead | null)[]> {
  const n = cropsB64.length;
  const prompt =
    `You are given ${n} separate close-up images, labelled Image 1..${n}. Each image shows ONE stack of ` +
    `poker chips of a single colour. For EACH image do BOTH tasks:\n` +
    `1) COUNT the chips. Look at the VERTICAL SIDE: each chip is a thin ~3.3 mm disc; between two stacked ` +
    `chips there is a seam line. Number of chips = number of seams + 1. The flat top face is the TOP chip — ` +
    `count it once, never as an extra layer. Count the seams slowly, then recount to confirm.\n` +
    `2) MEASURE two lengths as fractions (0..1) of THAT image: "stackHeight" (bottom edge of the lowest chip ` +
    `to the top edge of the highest) and "chipDiameter" (width of a single chip).\n` +
    `Respond with ONLY a JSON array with EXACTLY ${n} entries, in image order: ` +
    `[{"count":<int>,"stackHeight":<0..1>,"chipDiameter":<0..1>}, ...].`;
  const parts: any[] = [{ text: prompt }];
  cropsB64.forEach((b64, k) => {
    parts.push({ text: `Image ${k + 1} (denomination ${values[k]}):` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  });
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json' } });
  const res = await generate(apiKey, body, 'flash');
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return values.map(() => null);
  let arr: any;
  try { arr = JSON.parse(text); } catch { return values.map(() => null); }
  const list: any[] = Array.isArray(arr) ? arr : arr?.stacks ?? [];
  return values.map((_, k) => parseRead(list[k]));
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
 * with the user's own key (no backend). Pipeline:
 *   1. detect + box each stack;
 *   2. crop each stack, then read ALL crops together in one batched call, repeated SAMPLES
 *      times to vote — every read returns a seam count AND a measured height:diameter ratio
 *      (two independent physical channels). Batching = ~1 detection + SAMPLES calls per photo;
 *   3. calibrate the chip thickness ratio k from the stacks the seam-vote is unanimous on
 *      (all chips are the same SLOWPLAY chip, so one confident stack rulers the rest);
 *   4. fuse per stack: geometry count = round(ratio / k). If the seam vote and geometry
 *      agree, lock it (high confidence). If they disagree, that is the real uncertainty —
 *      let the pro model break it, and flag the row.
 * Confidence is cross-channel agreement, not the model's self-report.
 */
export async function countChipsWithVision(
  canvas: HTMLCanvasElement,
  denoms: VisionDenom[],
  apiKey: string,
): Promise<CountResult> {
  const list = denoms.map((d) => `${d.value} = ${colorName(d.color)} (${d.color})`).join('; ');
  const fullB64 = toJpegBase64(canvas, 1024); // detection only needs rough boxes — keep it cheap

  const boxes = await detectStacks(apiKey, fullB64, list).catch(() => [] as StackBox[]);
  const valid = boxes.filter((b) => denoms.some((d) => d.value === b.value));

  let totals: DenomTotal[];
  if (!valid.length) {
    // Detection failed — degrade gracefully to a voted whole-image count.
    totals = await countWholeVoted(apiKey, fullB64, list, denoms);
  } else {
    // Crop each stack, then clean it up on-device (no network time): tighten to the chip
    // colour to drop clutter that leaked into the box, then auto-expose so backlit seams
    // show. Both the model image and the DSP read use the cleaned crop.
    const colorByValue = new Map(denoms.map((d) => [d.value, d.color]));
    const cropCanvases = valid.map((b) => {
      const base = resized(cropCanvas(canvas, b.box, CROP_PAD), 1024);
      const hex = colorByValue.get(b.value);
      const tight = hex ? tightenByColor(base, hex) : base;
      return autoLevels(tight);
    });
    // Send crops at 768px = a single Gemini image tile (half the tokens of 1024); the stack
    // fills the frame so seams stay resolvable. DSP still uses the fuller local 1024 copy.
    const crops = cropCanvases.map((cc) => toJpegBase64(cc, 768));
    // On-device DSP read per stack — synchronous, ~ms, runs before any network wait.
    const dsp = cropCanvases.map((cc) => dspCount(cc));

    // Vote by repeating ONE batched multi-image read SAMPLES times (all stacks per call).
    // This is ~1 detection + SAMPLES reads total, instead of SAMPLES per stack — far cheaper
    // and far fewer requests (fewer rate-limit 429s / timeouts). Each read gives a seam count
    // and a height:diameter ratio per stack.
    const values = valid.map((v) => v.value);
    const samples = await mapPool(Array.from({ length: SAMPLES }, (_, i) => i), POOL, () =>
      readAllStacks(apiKey, crops, values, 0.5).catch(() => valid.map(() => null)),
    );
    const votes: number[][] = valid.map(() => []);
    const ratios: number[][] = valid.map(() => []);
    for (const reads of samples) {
      reads.forEach((res, i) => { if (res) { votes[i].push(res.count); if (res.r != null) ratios[i].push(res.r); } });
    }

    // Seam vote + robust ratio per stack.
    const seam = valid.map((_, i) => (votes[i].length ? tally(votes[i]) : { count: 0, agreement: 0 }));
    const rMed = valid.map((_, i) => median(ratios[i]));

    // Cross-stack calibration: k = ratio / count on stacks the vote is unanimous about
    // (≥2 chips, so the ratio is meaningful). Median across them; clamp to a sane band.
    const ks: number[] = [];
    valid.forEach((_, i) => {
      if (seam[i].agreement >= 0.999 && seam[i].count >= 2 && rMed[i] != null) ks.push(rMed[i]! / seam[i].count);
    });
    const kStar = Math.max(K_MIN, Math.min(K_MAX, median(ks) ?? NOMINAL_K));

    // Fuse the two channels per stack.
    const perStack = await Promise.all(valid.map(async (b, i) => {
      const nSeam = seam[i].count, a = seam[i].agreement;
      const nGeo = rMed[i] != null ? Math.max(1, Math.round(rMed[i]! / kStar)) : null;

      if (!nSeam && nGeo == null) return { value: b.value, count: 0, confidence: 0 };

      // No usable geometry — seam vote only (DSP may still confirm below).
      if (nGeo == null) {
        if (dsp[i] && dsp[i]!.strength >= 0.45 && dsp[i]!.count === nSeam) return { value: b.value, count: nSeam, confidence: Math.max(a, 0.9) };
        return { value: b.value, count: nSeam, confidence: a };
      }
      if (!nSeam) return { value: b.value, count: nGeo, confidence: 0.55 }; // geometry only

      // DSP is consulted CONFIRM-ONLY: it must have strong periodicity and land exactly on
      // a candidate, else it abstains (never introduces a new number).
      const dspBacks = (n: number) => !!dsp[i] && dsp[i]!.strength >= 0.45 && dsp[i]!.count === n;

      // Seam + geometry agree. Short stacks (≤4) are read reliably; TALL stacks are where
      // both channels can make the SAME error (occlusion/foreshortening), so they only earn
      // top confidence when the independent DSP channel also confirms — otherwise they flag,
      // so we never show a tall count as certain-but-wrong.
      if (nSeam === nGeo) {
        const conf = dspBacks(nSeam) ? 0.95 : nSeam <= 4 ? 0.9 : 0.8;
        return { value: b.value, count: nSeam, confidence: conf };
      }

      // Off by one and the seam vote is confident → keep seam, but flag for a glance.
      // A DSP that confirms one side breaks it cleanly (no flag / switch to geometry).
      if (Math.abs(nSeam - nGeo) === 1 && a >= 0.8) {
        if (dspBacks(nSeam)) return { value: b.value, count: nSeam, confidence: 0.9 };
        if (dspBacks(nGeo)) return { value: b.value, count: nGeo, confidence: 0.6 };
        return { value: b.value, count: nSeam, confidence: 0.6 };
      }

      // Real disagreement → the independent DSP channel breaks it if it has a strong read.
      if (dspBacks(nSeam)) return { value: b.value, count: nSeam, confidence: 0.75 };
      if (dspBacks(nGeo)) return { value: b.value, count: nGeo, confidence: 0.75 };

      // DSP abstained → prefer the confident channel, and flag the row for a glance.
      return { value: b.value, count: a >= 0.8 ? nSeam : nGeo, confidence: 0.5 };
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
