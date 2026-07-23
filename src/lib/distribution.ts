import type { Denomination, BlindLevel } from '../types';

/** A computed per-player stack. */
export interface StackResult {
  /** denomId -> number of chips per player */
  counts: Record<string, number>;
  /** denominations that actually appear (count > 0), sorted ascending by value */
  denomsUsed: Denomination[];
  /** total value of one player's stack, in chip-units */
  totalValue: number;
  /** target value we tried to hit, in chip-units */
  targetValue: number;
  /** total number of physical chips in one player's stack */
  chipCount: number;
  /** true if the stack hits the target exactly and inventory is sufficient */
  exact: boolean;
  feasible: boolean;
  /** hard problems: infeasible inventory, inexact buy-in, blinds not postable */
  warnings: string[];
  /** advisory notes: chips skipped for this blind structure, colour-up hints */
  notes: string[];
  /** face value of the smallest chip used (the "base"/workhorse chip), 0 if none */
  baseValue: number;
  /** can this base chip actually post the small & big blind exactly? */
  blindOk: boolean;
  /** the eligible denominations for this stack (blind-compatible pool), asc by value */
  pool: Denomination[];
}

export interface DistOptions {
  /** 0..1 — higher favours more small chips ("maximise small chips"). */
  smallBias: number;
  /** denom ids the user explicitly excluded */
  excluded?: Set<string>;
  /** blind level this stack is built for — sets the smallest sensible chip */
  blind?: BlindLevel | null;
  /** how many total stacks must be servable from inventory (players + planned rebuys) */
  stacksNeeded: number;
  /** cap the number of distinct chip values used (0/undefined = all) */
  maxDenoms?: number;
  /** never use a denomination smaller than this (keeps later stages colouring *up*) */
  minDenomValue?: number;
  /** include every owned chip type, even ones that don't fit the blind neatly */
  useAllChips?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
function clamp01(t: number) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Build one player's chip stack worth `targetUnits` chip-units.
 *
 * Strategy: give the stack a decreasing "pyramid" shape (many small chips, few
 * big chips) whose steepness is driven by `smallBias`, scale that shape so its
 * value matches the buy-in, then reconcile to hit the target exactly while
 * respecting how many chips you actually own.
 */
export function computeStack(
  targetUnits: number,
  denominations: Denomination[],
  opts: DistOptions,
): StackResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  const excluded = opts.excluded ?? new Set<string>();
  const stacksNeeded = Math.max(1, Math.floor(opts.stacksNeeded));

  const counts: Record<string, number> = {};
  denominations.forEach((d) => (counts[d.id] = 0));

  // 1. Which denominations are in play?
  const minDenomValue = opts.minDenomValue ?? 0;
  const owned = denominations
    .filter(
      (d) =>
        d.enabled &&
        !excluded.has(d.id) &&
        d.value > 0 &&
        d.value <= targetUnits &&
        d.value >= minDenomValue &&
        d.maxPerPlayer !== 0, // max of 0 means "never use this chip"
    )
    .sort((a, b) => a.value - b.value);

  if (owned.length === 0) {
    warnings.push('No usable chip denominations for this buy-in. Add smaller chips or lower the buy-in.');
    return result(counts, denominations, targetUnits, warnings, notes, false, 0, false, []);
  }

  // Choose the base (smallest / workhorse) chip and a blind-compatible pool.
  const sel = selectPool(owned, opts.blind ?? null, opts.useAllChips ?? false);
  let pool = sel.pool;
  const baseValue = sel.base.value;
  const blindOk = sel.blindOk;
  sel.warnings.forEach((w) => warnings.push(w));
  sel.notes.forEach((n) => notes.push(n));

  // Optionally cap the number of distinct chip values (keep the base + a spread up).
  if (opts.maxDenoms && opts.maxDenoms >= 1 && pool.length > opts.maxDenoms) {
    pool = pickSpread(pool, opts.maxDenoms);
  }

  // Per-player cap: limited by inventory and any user-set maximum.
  const capOf = (d: Denomination) => Math.min(Math.floor(d.count / stacksNeeded), d.maxPerPlayer ?? Infinity);
  const smallest = pool[0];
  const bigBlind = opts.blind ? opts.blind.bigBlind : Math.max(2, smallest.value * 2);

  // 2. Pyramid shape. decay<1 => higher denoms get fewer chips.
  //    High bias => STEEPER decay => value must come from many small chips.
  //    Wide range so "fewer, bigger chips" genuinely thins the small chips out.
  const decay = lerp(0.86, 0.38, opts.smallBias);
  const shape = pool.map((_, i) => Math.pow(decay, i));

  // 3. Scale the shape so its value equals the target, then round to whole chips.
  const shapeValue = pool.reduce((s, d, i) => s + shape[i] * d.value, 0);
  const scale = shapeValue > 0 ? targetUnits / shapeValue : 0;
  pool.forEach((d, i) => {
    const raw = Math.round(shape[i] * scale);
    counts[d.id] = clampCount(raw, capOf(d));
  });

  // Guarantee at least one of the smallest chip for change-making (if affordable/owned).
  if (counts[smallest.id] === 0 && capOf(smallest) > 0 && smallest.value <= targetUnits) {
    counts[smallest.id] = 1;
  }

  // 4a. User's per-denomination minimums are HARD (reconcile will not drop below).
  const userMin: Record<string, number> = {};
  pool.forEach((d) => (userMin[d.id] = clampCount(Math.max(0, Math.floor(d.minPerPlayer ?? 0)), capOf(d))));
  pool.forEach((d) => {
    if (counts[d.id] < userMin[d.id]) counts[d.id] = userMin[d.id];
  });
  const minValue = pool.reduce((s, d) => s + userMin[d.id] * d.value, 0);
  if (minValue > targetUnits) {
    warnings.push(`Your minimum chips add up to ${minValue} — more than the ${targetUnits}-point buy-in. Lower a minimum.`);
  }

  // 4b. Playability floor on the smallest chip: keep enough small chips to post
  //     blinds and make change. Seeded, then protected in a first reconcile pass.
  const floorBudget = opts.blind
    ? bigBlind * lerp(1, 16, opts.smallBias)
    : targetUnits * lerp(0.03, 0.4, opts.smallBias);
  const floorValue = Math.min(targetUnits * 0.5, floorBudget);
  const floorCount = clampCount(Math.round(floorValue / smallest.value), capOf(smallest));
  if (counts[smallest.id] < floorCount) counts[smallest.id] = floorCount;

  // 5. Reconcile to the exact target. Pass 1 protects the playability floor so
  //    small chips survive; if that can't land exactly, pass 2 relaxes to the
  //    user's hard minimums only.
  const floorMin: Record<string, number> = { ...userMin };
  floorMin[smallest.id] = Math.max(userMin[smallest.id] ?? 0, floorCount);
  reconcile(counts, pool, targetUnits, capOf, (d) => floorMin[d.id] ?? 0);
  let landed = pool.reduce((s, d) => s + counts[d.id] * d.value, 0);
  if (landed !== targetUnits) reconcile(counts, pool, targetUnits, capOf, (d) => userMin[d.id] ?? 0);
  // The greedy reconcile steps one whole chip at a time, so it can stall short by
  // less than the base chip when the pool's gcd is smaller than the base (e.g. base
  // 10 with 25s in play → a 5-unit gap). Close that with a two-denomination swap.
  landed = pool.reduce((s, d) => s + counts[d.id] * d.value, 0);
  if (landed !== targetUnits) closeResidual(counts, pool, targetUnits, capOf, (d) => userMin[d.id] ?? 0);

  return finalize(counts, denominations, pool, targetUnits, stacksNeeded, warnings, notes, baseValue, blindOk);
}

/**
 * Pick the base (smallest) chip and the eligible pool.
 *
 * Poker rule: only the SMALLEST chip has to be able to post the small blind, so the
 * base is the largest owned denomination that is ≤ the small blind and divides it.
 * Larger chips do NOT need to be multiples of the base — a 25 is perfectly usable in
 * a 10/20 game — so every chip from the base upward is kept. (Chips *below* the base
 * are dropped for this blind level unless "use all my chips" is on.)
 */
function selectPool(
  owned: Denomination[],
  blind: BlindLevel | null,
  useAllChips = false,
): { pool: Denomination[]; base: Denomination; blindOk: boolean; warnings: string[]; notes: string[] } {
  const warnings: string[] = [];
  const notes: string[] = [];

  if (!blind || blind.smallBlind <= 0) {
    return { pool: owned, base: owned[0], blindOk: true, warnings, notes };
  }

  // "Use all my chips": include every owned type; the base is just the smallest.
  if (useAllChips) {
    const base = owned[0];
    const canPost = owned.some((d) => d.value <= blind.smallBlind && blind.smallBlind % d.value === 0);
    if (!canPost) {
      warnings.push(
        `No chip divides the ${blind.smallBlind} small blind — exact blinds/change won't always be possible.`,
      );
    }
    return { pool: owned, base, blindOk: canPost, warnings, notes };
  }

  const sb = blind.smallBlind;
  const bb = blind.bigBlind;
  let base: Denomination;
  let blindOk = true;

  const dividers = owned.filter((d) => d.value <= sb && sb % d.value === 0);
  const below = owned.filter((d) => d.value <= sb);

  if (dividers.length) {
    base = dividers[dividers.length - 1]; // largest chip that divides the small blind
  } else if (below.length) {
    base = below[below.length - 1];
    blindOk = false;
    warnings.push(
      `Small blind ${sb} isn't a whole number of your smallest chip (${base.value}) — exact blinds and change won't always be possible. Use blinds in multiples of ${base.value}.`,
    );
  } else {
    // every chip is bigger than the small blind — you literally can't post it
    base = owned[0];
    blindOk = false;
    warnings.push(
      `Your smallest chip is ${base.value}, but the blinds are ${sb}/${bb}. Players can't post the blind or make change. Add a chip of ${sb} or smaller, or raise the blinds to at least ${base.value}.`,
    );
  }

  // Keep the base and every larger chip. Bigger chips need not be multiples of the
  // base — only the smallest chip has to post the blind.
  const pool = owned.filter((d) => d.value >= base.value);

  return { pool, base, blindOk, warnings, notes };
}

function clampCount(raw: number, cap: number) {
  const n = Math.max(0, raw);
  return cap >= 0 ? Math.min(n, cap) : n;
}

/**
 * Nudge counts until their value equals target, staying within per-player caps.
 * Adds/removes from the largest affordable denomination first so the bulk of any
 * correction lands in big chips (keeps stacks compact), finishing on small chips.
 */
function reconcile(
  counts: Record<string, number>,
  pool: Denomination[],
  target: number,
  capOf: (d: Denomination) => number,
  minOf: (d: Denomination) => number = () => 0,
) {
  const valueOf = () => pool.reduce((s, d) => s + counts[d.id] * d.value, 0);
  const desc = [...pool].sort((a, b) => b.value - a.value);
  const asc = pool;

  let guard = 0;
  while (guard++ < 100000) {
    const diff = target - valueOf();
    if (diff === 0) break;

    if (diff > 0) {
      // add the largest chip that fits without overshooting and has inventory
      const d = desc.find((x) => x.value <= diff && counts[x.id] < capOf(x));
      if (d) {
        counts[d.id]++;
        continue;
      }
      // nothing fits exactly — add the smallest available chip and let removals fix overshoot
      const s = asc.find((x) => counts[x.id] < capOf(x));
      if (!s) break; // out of inventory entirely
      counts[s.id]++;
    } else {
      // overshoot — remove the largest chip we can that doesn't undershoot the target,
      // never going below a chip's minimum
      const over = -diff;
      const d = desc.find((x) => counts[x.id] > minOf(x) && x.value <= over);
      if (d) {
        counts[d.id]--;
        continue;
      }
      const s = asc.find((x) => counts[x.id] > minOf(x));
      if (!s) break;
      counts[s.id]--;
    }
  }
}

/**
 * Close a small exact-value gap the greedy reconcile can leave when the pool's gcd
 * is smaller than the base chip (e.g. base 10 with 25s in play → a 5-unit gap).
 * Tries a two-denomination swap (add x of one, remove y of another) that nets the
 * gap, staying within caps and minimums.
 */
function closeResidual(
  counts: Record<string, number>,
  pool: Denomination[],
  target: number,
  capOf: (d: Denomination) => number,
  minOf: (d: Denomination) => number = () => 0,
) {
  const valueOf = () => pool.reduce((s, d) => s + counts[d.id] * d.value, 0);
  let guard = 0;
  while (guard++ < 300) {
    const diff = target - valueOf();
    if (diff === 0) return;
    let applied = false;
    for (const a of pool) {
      for (const b of pool) {
        if (a.id === b.id) continue;
        for (let x = 1; x <= 8; x++) {
          const rem = x * a.value - diff; // must equal y * b.value with y >= 1
          if (rem <= 0 || rem % b.value !== 0) continue;
          const y = rem / b.value;
          if (counts[a.id] + x > capOf(a)) continue;
          if (counts[b.id] - y < minOf(b)) continue;
          counts[a.id] += x;
          counts[b.id] -= y;
          applied = true;
          break;
        }
        if (applied) break;
      }
      if (applied) break;
    }
    if (!applied) return;
  }
}

/**
 * Pick `n` denominations spread across the pool: always keep the base (smallest)
 * chip, then choose the rest at roughly even index steps up to the largest, so a
 * limited chip set still spans small→large and can hit the buy-in.
 */
function pickSpread(pool: Denomination[], n: number): Denomination[] {
  if (n >= pool.length) return pool;
  if (n <= 1) return [pool[0]];
  const idx = new Set<number>([0, pool.length - 1]);
  for (let k = 1; k < n - 1; k++) {
    idx.add(Math.round((k * (pool.length - 1)) / (n - 1)));
  }
  return [...idx].sort((a, b) => a - b).slice(0, n).map((i) => pool[i]);
}

function finalize(
  counts: Record<string, number>,
  all: Denomination[],
  pool: Denomination[],
  target: number,
  stacksNeeded: number,
  warnings: string[],
  notes: string[],
  baseValue: number,
  blindOk: boolean,
): StackResult {
  const totalValue = pool.reduce((s, d) => s + counts[d.id] * d.value, 0);
  const exact = totalValue === target;
  if (!exact) {
    warnings.push(
      `Couldn't match the buy-in exactly with the chips available — closest stack is ${totalValue} (target ${target}).`,
    );
  }

  let feasible = true;
  all.forEach((d) => {
    const needed = counts[d.id] * stacksNeeded;
    if (needed > d.count) {
      feasible = false;
      warnings.push(
        `Not enough ${d.value} chips: need ${needed} (${counts[d.id]} × ${stacksNeeded} stacks) but you own ${d.count}.`,
      );
    }
  });

  return result(counts, all, target, warnings, notes, feasible, baseValue, blindOk, pool);
}

function result(
  counts: Record<string, number>,
  all: Denomination[],
  target: number,
  warnings: string[],
  notes: string[],
  feasible: boolean,
  baseValue: number,
  blindOk: boolean,
  pool: Denomination[] = [],
): StackResult {
  const denomsUsed = all
    .filter((d) => counts[d.id] > 0)
    .sort((a, b) => a.value - b.value);
  const totalValue = denomsUsed.reduce((s, d) => s + counts[d.id] * d.value, 0);
  const chipCount = denomsUsed.reduce((s, d) => s + counts[d.id], 0);
  return {
    counts,
    denomsUsed,
    totalValue,
    targetValue: target,
    chipCount,
    exact: totalValue === target,
    feasible,
    warnings,
    notes,
    baseValue: baseValue || (denomsUsed[0]?.value ?? 0),
    blindOk,
    pool,
  };
}

/**
 * Manual live-adjust: after the user pins some denominations and edits counts,
 * rebalance the *free* denominations so the whole stack totals `target` again.
 * Returns true if it landed exactly. Locked / edited denoms are left untouched.
 */
export function rebalance(
  counts: Record<string, number>,
  denoms: Denomination[],
  target: number,
  isFree: (id: string) => boolean,
  capOf: (d: Denomination) => number,
): boolean {
  const free = denoms.filter((d) => isFree(d.id)).sort((a, b) => a.value - b.value);
  const fixedValue = denoms.filter((d) => !isFree(d.id)).reduce((s, d) => s + counts[d.id] * d.value, 0);
  const remaining = target - fixedValue;
  if (remaining < 0 || free.length === 0) return false;

  const freeValue = () => free.reduce((s, d) => s + counts[d.id] * d.value, 0);
  const desc = [...free].sort((a, b) => b.value - a.value);

  let guard = 0;
  while (guard++ < 100000) {
    const diff = remaining - freeValue();
    if (diff === 0) return true;
    if (diff > 0) {
      const d = desc.find((x) => x.value <= diff && counts[x.id] < capOf(x));
      if (d) {
        counts[d.id]++;
        continue;
      }
      const s = free.find((x) => counts[x.id] < capOf(x));
      if (!s) return false;
      counts[s.id]++;
    } else {
      const over = -diff;
      const d = desc.find((x) => counts[x.id] > 0 && x.value <= over);
      if (d) {
        counts[d.id]--;
        continue;
      }
      const s = free.find((x) => counts[x.id] > 0);
      if (!s) return false;
      counts[s.id]--;
    }
  }
  return freeValue() === remaining;
}

/** Convenience: money -> chip-units using the unit value (money per chip-unit). */
export function moneyToUnits(money: number, unitValue: number): number {
  if (unitValue <= 0) return Math.round(money);
  return Math.round(money / unitValue);
}
