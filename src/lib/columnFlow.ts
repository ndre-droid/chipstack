import { useEffect, useRef, useState } from 'react';

/**
 * Whole piles arriving and leaving a spread.
 *
 * Chips moving inside a pile is one thing (see stackDrop); a denomination dropping out
 * of the plan entirely is another. Without this, changing the mix makes a column
 * vanish between two frames and the rest of the row jump sideways to fill the hole.
 *
 * So a pile on its way out stays in the list — with the count it had, not the zero it
 * now has — long enough to fold up and fade, and a new one unfolds into place.
 *
 * Two rules keep a dragged slider from leaving wreckage on screen, which an earlier
 * version of this did:
 *
 * 1. A pile on its way out is held in a map keyed by its denomination, so the same
 *    denomination can never be drawn twice however fast the mix is dragged.
 * 2. Each one carries its own deadline and is dropped by whichever comes first — the
 *    timer, or simply the next render. A missed timer can therefore delay a column
 *    disappearing, but it can never strand one on screen.
 */
export type ColumnState = 'in' | 'idle' | 'out';

export interface Column<T> {
  id: string;
  item: T;
  state: ColumnState;
}

/** Quick: this is a stack appearing, not a chip landing. Mirrored in styles.css. */
export const COL_IN_MS = 260;
export const COL_OUT_MS = 220;

interface Ghost<T> {
  /** Where in the row it was, so it folds up where it stood. */
  at: number;
  /** What it last held — a pile fades out as chips, not as an empty column. */
  item: T;
  /** When it stops being drawn, whatever else happens. */
  expires: number;
}

/** How many departing piles may be on screen at once — a drag must not pile up ghosts. */
const MAX_GHOSTS = 3;

/**
 * Put the piles that are leaving back where they were, dropping any that have expired
 * or that have since come back.
 *
 * They have to hold their old position: a column collapsing on the right while the row
 * re-centres from the left reads as two separate things happening.
 */
export function spliceLeaving<T>(live: Column<T>[], ghosts: Map<string, Ghost<T>>, now: number): Column<T>[] {
  if (ghosts.size === 0) return live;
  const liveIds = new Set(live.map((c) => c.id));
  const due = [...ghosts.entries()]
    .filter(([id, g]) => !liveIds.has(id) && g.expires > now)
    .sort((a, b) => a[1].at - b[1].at);
  if (due.length === 0) return live;

  const out = [...live];
  for (const [id, g] of due) {
    out.splice(Math.min(g.at, out.length), 0, { id, item: g.item, state: 'out' });
  }
  return out;
}

/**
 * Track which piles are new, which are on their way out, and which are simply there.
 *
 * Live entries keep their current data (a pile that stays keeps growing and shrinking
 * while its neighbour folds away); departing entries keep the last data they had.
 */
export function useColumnFlow<T>(items: { id: string; item: T }[], animate: boolean): Column<T>[] {
  const [, forceRender] = useState(0);
  const entering = useRef(new Set<string>());
  const ghosts = useRef(new Map<string, Ghost<T>>());
  const seen = useRef<string[] | null>(null);
  const lastItems = useRef(new Map<string, T>());
  const timer = useRef<number | null>(null);

  const ids = items.map((i) => i.id);
  const signature = ids.join('|');

  useEffect(() => {
    const before = seen.current;
    seen.current = ids;
    // First sight of the spread is not an arrival: the piles were already there.
    if (before === null || !animate) return;
    if (before.join('|') === signature) return;

    const now = Date.now();
    const arrived = ids.filter((id) => !before.includes(id));
    for (const id of arrived) entering.current.add(id);

    before.forEach((id, at) => {
      if (ids.includes(id)) return;
      const item = lastItems.current.get(id);
      if (item === undefined) return;
      ghosts.current.set(id, { at, item, expires: now + COL_OUT_MS });
    });
    // A pile that came back is a live pile again, not a departing one.
    for (const id of ids) ghosts.current.delete(id);
    // A hard drag can retire a column every few frames; only the newest few are worth
    // drawing, and the rest would only be clutter behind them.
    if (ghosts.current.size > MAX_GHOSTS) {
      const oldest = [...ghosts.current.entries()].sort((a, b) => a[1].expires - b[1].expires);
      for (const [id] of oldest.slice(0, ghosts.current.size - MAX_GHOSTS)) ghosts.current.delete(id);
    }

    if (arrived.length === 0 && ghosts.current.size === 0) return;

    // One timer, always aimed at the next thing that expires. Even if it is lost, the
    // render below stops drawing anything past its deadline.
    if (timer.current !== null) clearTimeout(timer.current);
    const nextExpiry = Math.min(
      ...[...ghosts.current.values()].map((g) => g.expires - now),
      arrived.length ? COL_IN_MS : Number.POSITIVE_INFINITY,
    );
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        entering.current.clear();
        for (const [id, g] of ghosts.current) if (g.expires <= Date.now()) ghosts.current.delete(id);
        forceRender((n) => n + 1);
      },
      Math.max(0, nextExpiry) + 30,
    );
    forceRender((n) => n + 1);
    // `ids` is rebuilt every render; the signature is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, animate]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  for (const { id, item } of items) lastItems.current.set(id, item);

  const live: Column<T>[] = items.map(({ id, item }) => ({
    id,
    item,
    state: entering.current.has(id) ? 'in' : 'idle',
  }));

  return spliceLeaving(live, ghosts.current, Date.now());
}
