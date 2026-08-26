/**
 * Where the panels sit on the big screen, and how big its text is.
 *
 * The TV used to be three fixed columns — standings on the left, clock in the
 * middle, chip legend on the right — sized in `vmin`. That is a good default and a
 * bad universal answer: a 16:9 living-room TV, a 21:9 monitor and a laptop standing
 * in for the TV leave the dead space in completely different places, and which
 * panels are even switched on changes per night. So the arrangement is data: a
 * coarse grid the user drags panels around on, saved with the setup and mirrored to
 * the screen like everything else the phone drives.
 *
 * The grid is deliberately coarse. Twelve columns divide cleanly into the thirds the
 * default uses (and into halves and quarters), ten rows are enough to give the clock
 * the height it needs without asking anyone to place things to the pixel — and a
 * coarse grid is what makes dragging on a touchscreen land where it looks like it
 * should.
 */

import type { TvLayout, TvPanelId, TvSlot, TvTextRole, TvTextScale } from '../types';

export type { TvLayout, TvPanelId, TvSlot, TvTextRole, TvTextScale };

export const TV_COLS = 12;
export const TV_ROWS = 10;

export const TV_PANEL_IDS: readonly TvPanelId[] = ['stats', 'roster', 'bust', 'clock', 'legend', 'payouts'];

/** No panel may be squeezed past the point where its own content still reads. */
export const TV_MIN_W = 2;
export const TV_MIN_H = 1;

/** The three-column arrangement the big screen has always had, as data. */
export const DEFAULT_TV_LAYOUT: TvLayout = {
  stats: { col: 1, row: 1, w: 3, h: 4 },
  roster: { col: 1, row: 5, w: 3, h: 4 },
  bust: { col: 1, row: 9, w: 3, h: 2 },
  clock: { col: 4, row: 1, w: 6, h: 10 },
  legend: { col: 10, row: 1, w: 3, h: 6 },
  payouts: { col: 10, row: 7, w: 3, h: 4 },
};

const clampInt = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
};

/** A slot that is certainly on the grid: size first, then the corner that holds it. */
export function clampSlot(slot: Partial<TvSlot> | undefined, fallback: TvSlot): TvSlot {
  const w = clampInt(slot?.w, TV_MIN_W, TV_COLS, fallback.w);
  const h = clampInt(slot?.h, TV_MIN_H, TV_ROWS, fallback.h);
  return {
    w,
    h,
    col: clampInt(slot?.col, 1, TV_COLS - w + 1, Math.min(fallback.col, TV_COLS - w + 1)),
    row: clampInt(slot?.row, 1, TV_ROWS - h + 1, Math.min(fallback.row, TV_ROWS - h + 1)),
  };
}

/**
 * Whatever was stored (or arrived from the phone, or was hand-edited in a backup),
 * turned into a layout every panel has a real place in. `null` — never arranged —
 * gives the default back.
 */
export function normalizeTvLayout(raw: unknown): TvLayout {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TV_LAYOUT };
  const src = raw as Partial<Record<TvPanelId, Partial<TvSlot>>>;
  const out = {} as TvLayout;
  for (const id of TV_PANEL_IDS) out[id] = clampSlot(src[id], DEFAULT_TV_LAYOUT[id]);
  return out;
}

/** Is this the arrangement the app ships with? Drives the "reset" affordance. */
export function isDefaultTvLayout(layout: TvLayout): boolean {
  return TV_PANEL_IDS.every((id) => {
    const a = layout[id];
    const b = DEFAULT_TV_LAYOUT[id];
    return a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h;
  });
}

/** The CSS `grid-area` for a slot — the one place the 1-based/end-exclusive maths lives. */
export function gridAreaOf(slot: TvSlot): string {
  return `${slot.row} / ${slot.col} / ${slot.row + slot.h} / ${slot.col + slot.w}`;
}

/* ------------------------------------------------------------------ text size -- */

/**
 * The text roles the big screen lets you size by hand.
 *
 * One overall zoom (`Settings.tvScale`) answers "this laptop is not a TV"; it cannot
 * answer "the countdown is huge and the names are tiny", which is what a room full
 * of people four metres from the screen actually complains about. Each role is a
 * multiplier on the size the layout already computed, so the responsive sizing keeps
 * working and this only leans on it.
 */
export const TV_TEXT_ROLES: readonly TvTextRole[] = ['clock', 'blinds', 'level', 'players', 'legend', 'stats', 'quips'];

export const TV_TEXT_MIN = 0.6;
export const TV_TEXT_MAX = 2.2;
export const TV_TEXT_STEP = 0.05;

export const DEFAULT_TV_TEXT_SCALE: TvTextScale = {
  clock: 1,
  blinds: 1,
  level: 1,
  players: 1,
  legend: 1,
  stats: 1,
  quips: 1,
};

export function clampTvText(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(TV_TEXT_MAX, Math.max(TV_TEXT_MIN, Math.round(n * 100) / 100));
}

export function normalizeTvTextScale(raw: unknown): TvTextScale {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TV_TEXT_SCALE };
  const src = raw as Partial<Record<TvTextRole, unknown>>;
  const out = {} as TvTextScale;
  for (const role of TV_TEXT_ROLES) out[role] = clampTvText(Number(src[role] ?? 1));
  return out;
}

export function isDefaultTvTextScale(scale: TvTextScale): boolean {
  return TV_TEXT_ROLES.every((r) => scale[r] === 1);
}

/** The custom properties `.tv` reads — see the `--tv-fs-*` uses in styles.css. */
export function tvTextVars(scale: TvTextScale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of TV_TEXT_ROLES) out[`--tv-fs-${role}`] = String(scale[role]);
  return out;
}
