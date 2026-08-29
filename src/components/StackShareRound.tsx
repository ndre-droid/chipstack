import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { rebalance, shareStep } from '../lib/stackShare';
import CountStack from './CountStack';
import type { LedgerSnapshot } from '../types';

/**
 * The counting round, as one screen you drag.
 *
 * The old round walked the table asking for a number per player and then reported
 * that the numbers didn't add up. This one starts from the fact that the money on
 * the table is already known — bought in minus cashed out — and asks only how it is
 * SPLIT. Push a bar up, the untouched bars give way, and the total is right by
 * construction: there is no difference to report, and nothing to reconcile.
 *
 * A touched row pins itself, so the next drag takes its money from the rows nobody
 * has looked at yet. Tapping a name opens the exact colour-by-colour count for that
 * one pile (see CountStack) and pins the answer.
 *
 * Stacks are an overview figure and never feed settlement — see PlayerRoster — which
 * is exactly why an eyeballed drag is the right instrument here.
 */
export default function StackShareRound({
  levelIdx,
  onClose,
  onUndoable,
}: {
  /** the blind level being played — passed through to the exact count */
  levelIdx?: number | null;
  onClose: () => void;
  onUndoable?: (previous: LedgerSnapshot) => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { ledger, settings } = state;
  const { unitValue, currency } = settings;

  useBackHandler(true, onClose);

  // Who still has a pile in front of them. A busted tournament player is gone from
  // the list but their buy-in is not — those chips are on the table in front of the
  // survivors, which is precisely what the split hands out.
  const players = useMemo(
    () => ledger.filter((p) => !p.out && !(p.cashOut > 0)),
    [ledger],
  );
  const order = useMemo(() => players.map((p) => p.id), [players]);

  /** The pot to divide: everything bought in, minus everything cashed out. */
  const total = moneyToUnits(
    ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0),
    unitValue,
  );

  /** how far one drag moves a bar — and the grid every share is rounded to */
  const step = shareStep(total, unitValue);

  const [shares, setShares] = useState<Record<string, number>>(() =>
    rebalance(
      Object.fromEntries(players.map((p) => [p.id, p.chips || 0])),
      players.map((p) => p.id),
      new Set(),
      total,
      undefined,
      step,
    ),
  );
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  /** the row the finger last moved — what the big screen names */
  const [touched, setTouched] = useState<string | null>(null);
  const [exactFor, setExactFor] = useState<string | null>(null);
  const opening = useRef(shares);

  // A rebuy or a bust while the sheet is open changes the pot under us. Re-split
  // rather than commit a table that no longer adds up; the pins survive it.
  const shape = `${total}|${order.join(',')}`;
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    setShares((s) => rebalance(s, order, pinned, total, undefined, step));
  }, [shape, order, pinned, total, step]);

  // Tell the big screen a count is running, and how much of the table is settled.
  // Deliberately NOT on every drag frame — the whole state pushes to the cloud on
  // change, and a dragged thumb would push a few hundred times.
  useEffect(() => {
    if (!touched) return;
    const p = players.find((x) => x.id === touched);
    if (!p) return;
    dispatch({
      type: 'COUNTING_SET',
      progress: {
        index: pinned.size,
        total: players.length,
        name: p.name || 'Player',
        emoji: p.emoji,
        at: Date.now(),
      },
    });
  }, [touched, pinned.size, players, dispatch]);

  useEffect(() => () => { dispatch({ type: 'COUNTING_SET', progress: null }); }, [dispatch]);

  const move = (id: string, units: number) => {
    setShares((s) => rebalance({ ...s, [id]: units }, order, pinned, total, id, step));
    setPinned((p) => (p.has(id) ? p : new Set(p).add(id)));
    setTouched(id);
  };

  const togglePin = (id: string) =>
    setPinned((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const reset = () => {
    setShares(opening.current);
    setPinned(new Set());
    setTouched(null);
  };

  const commit = () => {
    onUndoable?.(ledger);
    dispatch({
      type: 'LEDGER_SET_CHIPS_MANY',
      entries: players.map((p) => ({ id: p.id, chips: shares[p.id] > 0 ? shares[p.id] : undefined })),
    });
    onClose();
  };

  const leaderId = players.reduce<string | null>(
    (best, p) => ((shares[p.id] || 0) > 0 && (best === null || (shares[p.id] || 0) > (shares[best] || 0)) ? p.id : best),
    null,
  );
  const contested = players.filter((p) => (shares[p.id] || 0) > 0).length > 1;

  if (players.length === 0 || total <= 0) {
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-body">
          <div className="empty">{players.length === 0 ? t('count.noPlayers') : t('count.nothingOnTable')}</div>
          <button className="btn btn-primary btn-block" onClick={onClose}>{t('count.close')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-step">{t('count.onTable')}</div>
        <div className="cr-title">{money(total * unitValue, currency)}</div>
        <div className="cr-prev">{t('count.shareHint')}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        {players.map((p) => {
          const units = shares[p.id] || 0;
          const delta = units - (p.chips || 0);
          const pct = total > 0 ? (units / total) * 100 : 0;
          const isPinned = pinned.has(p.id);
          const name = p.name || 'Player';
          return (
            <div className={`csr-row ${isPinned ? 'is-set' : ''}`} key={p.id}>
              <button className="csr-name" onClick={() => setExactFor(p.id)} title={t('count.exact')}>
                {p.emoji && <span className="csr-emoji">{p.emoji}</span>}
                <b>{name}</b>
                {leaderId === p.id && contested && <span className="csr-crown">👑</span>}
              </button>
              <span className="csr-val">{money(units * unitValue, currency)}</span>
              <span className={`csr-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'faint'}`}>
                {(p.chips || 0) > 0 && delta !== 0
                  ? `${delta > 0 ? '↑ +' : '↓ −'}${money(Math.abs(delta) * unitValue, currency)}`
                  : ''}
              </span>
              <button
                className={`csr-pin ${isPinned ? 'on' : ''}`}
                onClick={() => togglePin(p.id)}
                aria-pressed={isPinned}
                aria-label={t('count.pin', { name })}
              >
                📌
              </button>
              <input
                type="range"
                className="range csr-bar"
                min={0}
                max={total}
                step={step}
                value={units}
                style={{ ['--pct' as string]: `${pct}%` }}
                onChange={(e) => move(p.id, +e.target.value)}
                aria-label={t('count.stackOf', { name })}
              />
            </div>
          );
        })}
        <p className="faint cr-note">{t('count.shareNote')}</p>
      </div>

      <div className="cr-bar">
        <button className="btn btn-ghost" onClick={reset}>{t('count.reset')}</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={commit}>{t('count.finish')}</button>
      </div>

      {exactFor && (
        <CountStack
          playerId={exactFor}
          levelIdx={levelIdx}
          onResult={(units) => move(exactFor, units)}
          onClose={() => setExactFor(null)}
        />
      )}
    </div>
  );
}
