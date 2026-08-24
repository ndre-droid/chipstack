import { useEffect, useRef, useState } from 'react';

/**
 * Whole piles arriving and leaving a spread.
 *
 * Chips moving inside a pile is one thing (see stackDrop); a denomination dropping out
 * of the plan entirely is another. Without this, changing the mix makes a column
 * vanish between two frames and the rest of the row jump sideways to fill the hole.
 *
 * So a pile that is on its way out stays in the list — with the count it had, not the
 * zero it now has — long enough to fold up and fade, and a new one unfolds into place.
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

/**
 * Put the piles that are leaving back where they were.
 *
 * They have to hold their old position: a column collapsing on the right while the
 * row re-centres from the left reads as two separate things happening.
 */
export function spliceLeaving<T>(live: Column<T>[], leaving: { at: number; column: Column<T> }[]): Column<T>[] {
  if (leaving.length === 0) return live;
  const out = [...live];
  for (const { at, column } of [...leaving].sort((a, b) => a.at - b.at)) {
    out.splice(Math.min(at, out.length), 0, column);
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
  const [entering, setEntering] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<{ at: number; column: Column<T> }[]>([]);
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

    const arrived = ids.filter((id) => !before.includes(id));
    const gone = before
      .map((id, at) => ({ id, at }))
      .filter(({ id }) => !ids.includes(id))
      .map(({ id, at }) => ({ at, column: { id, item: lastItems.current.get(id) as T, state: 'out' as const } }))
      .filter(({ column }) => column.item !== undefined);

    if (arrived.length === 0 && gone.length === 0) return;
    setEntering(arrived);
    setLeaving((old) => [...old.filter((o) => !ids.includes(o.column.id)), ...gone]);

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntering([]);
      setLeaving([]);
    }, Math.max(COL_IN_MS, COL_OUT_MS) + 60);
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
    state: entering.includes(id) ? 'in' : 'idle',
  }));

  return spliceLeaving(live, leaving);
}
