import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { parseMoney } from '../lib/money';
import { startingStackOf, handoutStack } from '../lib/startingStack';
import type { Denomination, LedgerPlayer } from '../types';

export type ChipSnapshot = { id: string; chips?: number; chipHistory?: { at: number; chips: number }[] };

/**
 * The counting round: walk the table player by player and tally each stack by
 * COLOUR (how many of each denomination), so nobody has to add up chip values in
 * their head. Input is chip pieces, the running total is shown in money.
 *
 * Deliberately an overview tool, not an audit — the closing summary compares the
 * counted total against the money on the table and shows the difference as a
 * hint; it never blocks. Everything commits in ONE dispatch at the end, so the
 * live TV gets a single push instead of one per player.
 *
 * Pass `only` to count a single player (the stack value tapped in the roster).
 */
export default function CountRound({
  only,
  onClose,
  onUndoable,
}: {
  only?: string;
  onClose: () => void;
  onUndoable?: (snapshot: ChipSnapshot[]) => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { denominations, ledger, session, settings } = state;
  const { unitValue, currency } = settings;

  // Who gets counted: still-in players, in table order (busted / cashed-out players
  // have no stack left to count).
  const players = useMemo(
    () => (only ? ledger.filter((p) => p.id === only) : ledger.filter((p) => !p.out && !(p.cashOut > 0))),
    [ledger, only],
  );

  // Default to the colours the starting stack actually uses — that's what is on the
  // table. "Show all colours" falls back to the whole owned inventory.
  const [showAll, setShowAll] = useState(false);
  const startStack = useMemo(
    () => startingStackOf(denominations, session, unitValue),
    [denominations, session, unitValue],
  );

  const denoms: Denomination[] =
    showAll || startStack.denomsUsed.length === 0
      ? denominations.filter((d) => d.count > 0).slice().sort((a, b) => a.value - b.value)
      : startStack.denomsUsed;

  /* How the stack gets entered. Typing the euro amount is the default because at a
     real table it is by far the fastest — you look at the pile, type a number, next
     player. Tallying by colour is the exact-but-slow path, kept one tap away. The
     choice is remembered in settings, so a table that prefers one never re-picks it. */
  const mode: 'money' | 'colours' = settings.countMode ?? 'money';
  const setMode = (m: 'money' | 'colours') => dispatch({ type: 'UPDATE_SETTINGS', patch: { countMode: m } });

  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  /** the money-mode field, as typed (a string so "" isn't the same as 0) */
  const [moneyText, setMoneyText] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [padId, setPadId] = useState<string | null>(null);
  // playerId → new chip-unit total; only players actually counted appear here
  const [results, setResults] = useState<Record<string, number>>({});
  // playerId → per-colour tally, so the inventory check can add up the whole table
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({});
  const [done, setDone] = useState(false);

  const player: LedgerPlayer | undefined = players[idx];
  const colourUnits = denoms.reduce((s, d) => s + (counts[d.id] || 0) * d.value, 0);
  const moneyUnits = moneyToUnits(Math.max(0, parseMoney(moneyText)), unitValue);
  const currentUnits = mode === 'money' ? moneyUnits : colourUnits;
  const isLast = idx >= players.length - 1;

  /** One-tap amounts, same set the roster offers. */
  const quickAmounts = [session.buyIn, 5, 10, 20, 50].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
  /** What this player has on the table — the sensible "still on their stack" answer. */
  const heldMoney = Math.max(0, (player?.buyIn || 0) - (player?.cashOut || 0)) || session.buyIn;

  // A player nobody has counted yet is still holding what they were handed — so
  // pre-fill with a chip pattern worth exactly THEIR stack, not the standard
  // buy-in. Someone who bought in for €5 starts from €5 of chips.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!player || done || seeded.current === player.id) return;
    seeded.current = player.id;
    const counted = (player.chipHistory?.length ?? 0) > 0;
    const held = (player.chips || 0) * unitValue || session.buyIn;
    // the money field always opens on what they are believed to hold — usually right,
    // and always a shorter edit than typing the whole number from scratch
    setMoneyText(held > 0 ? String(Math.round(held * 100) / 100) : '');
    if (!counted && held > 0) {
      const pattern = handoutStack(denominations, session, unitValue, held).counts;
      setCounts({ ...pattern });
      setPrefilled(true);
    } else {
      setCounts({});
      setPrefilled(false);
    }
  }, [player, done, denominations, session, unitValue]);

  // Tell the big screen how far around the table we are.
  useEffect(() => {
    if (only) return; // a single-player count is not a "round"
    if (done || !player) {
      dispatch({ type: 'COUNTING_SET', progress: null });
      return;
    }
    dispatch({
      type: 'COUNTING_SET',
      progress: { index: idx + 1, total: players.length, name: player.name || 'Player', emoji: player.emoji, at: Date.now() },
    });
  }, [idx, done, only, player, players.length, dispatch]);

  useEffect(() => () => { dispatch({ type: 'COUNTING_SET', progress: null }); }, [dispatch]);

  const bump = (id: string, by: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + by) }));

  /** Single-player mode (tapped one stack in the roster): save straight away. */
  const saveOnly = () => {
    onUndoable?.(ledger.map((p) => ({ id: p.id, chips: p.chips, chipHistory: p.chipHistory })));
    dispatch({ type: 'LEDGER_SET_CHIPS_MANY', entries: [{ id: player!.id, chips: currentUnits }] });
    onClose();
  };

  const goNext = (units: number | null) => {
    const next = units === null ? results : { ...results, [player!.id]: units };
    setResults(next);
    // Only a real colour tally may feed the inventory check — in money mode `counts`
    // is just the untouched pre-fill and would flag phantom over-counts.
    if (units !== null && mode === 'colours') setTallies((tl) => ({ ...tl, [player!.id]: { ...counts } }));
    setPadId(null);
    seeded.current = null;
    if (isLast) setDone(true);
    else setIdx((i) => i + 1);
  };

  /** Money that must be on the table right now = bought in − cashed out. */
  const tableUnits = moneyToUnits(
    ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0),
    unitValue,
  );

  /** Last player shortcut: whatever the others aren't holding. */
  const restUnits = Math.max(
    0,
    tableUnits -
      ledger
        .filter((p) => p.id !== player?.id && !p.out)
        .reduce((s, p) => s + (results[p.id] ?? p.chips ?? 0), 0),
  );

  /**
   * Inventory check: you can't be holding more chips of a colour than exist in the
   * box. Counts this round's other players plus what's on screen right now.
   */
  const overCount = (d: Denomination) => {
    const others = Object.entries(tallies)
      .filter(([id]) => id !== player?.id)
      .reduce((s, [, tl]) => s + (tl[d.id] || 0), 0);
    const total = others + (counts[d.id] || 0);
    return d.count > 0 && total > d.count ? total : 0;
  };

  const commit = () => {
    const entries = Object.entries(results).map(([id, chips]) => ({ id, chips: chips > 0 ? chips : undefined }));
    if (entries.length) {
      // the whole ledger, not just the counted rows: a round appends a trail point
      // to every player still in play, so undo has to be able to take them all back
      onUndoable?.(ledger.map((p) => ({ id: p.id, chips: p.chips, chipHistory: p.chipHistory })));
      dispatch({ type: 'LEDGER_SET_CHIPS_MANY', entries });
    }
    onClose();
  };

  if (players.length === 0) {
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-body">
          <div className="empty">{t('count.noPlayers')}</div>
          <button className="btn btn-primary btn-block" onClick={onClose}>{t('count.close')}</button>
        </div>
      </div>
    );
  }

  // ---- closing summary: what changed, who moved, and does it add up? ----
  if (done) {
    const countedUnits = ledger
      .filter((p) => !p.out)
      .reduce((s, p) => s + (results[p.id] ?? p.chips ?? 0), 0);
    const diff = (countedUnits - tableUnits) * unitValue;

    const moved = players
      .filter((p) => results[p.id] !== undefined && (p.chips || 0) > 0)
      .map((p) => ({ p, delta: results[p.id] - (p.chips || 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const biggest = moved[0];
    const leader = players
      .map((p) => ({ p, chips: results[p.id] ?? p.chips ?? 0 }))
      .sort((a, b) => b.chips - a.chips)[0];
    const nameOf = (p: LedgerPlayer) => `${p.emoji ? p.emoji + ' ' : ''}${p.name || 'Player'}`;

    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-head">
          <div className="cr-title">{t('count.summary')}</div>
        </div>
        <div className="cr-body">
          <div className="cr-sum-list">
            {players.map((p) => {
              const nu = results[p.id];
              return (
                <div className="cr-sum-row" key={p.id}>
                  <span className="cr-sum-name">{nameOf(p)}</span>
                  {nu === undefined ? (
                    <span className="faint">{t('count.skipped')}</span>
                  ) : (
                    <span className="cr-sum-val">
                      <span className="faint">{money((p.chips || 0) * unitValue, currency)} → </span>
                      <b>{money(nu * unitValue, currency)}</b>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {leader && leader.chips > 0 && (
            <div className="cr-moves">
              <div>👑 {t('count.leader')} <b>{nameOf(leader.p)}</b> · {money(leader.chips * unitValue, currency)}</div>
              {biggest && biggest.delta !== 0 && (
                <div className={biggest.delta > 0 ? 'pos' : 'neg'}>
                  {biggest.delta > 0 ? '📈' : '📉'} {t('count.biggestMove')} <b>{nameOf(biggest.p)}</b>{' '}
                  {biggest.delta > 0 ? '+' : '−'}{money(Math.abs(biggest.delta) * unitValue, currency)}
                </div>
              )}
            </div>
          )}

          <div className="cr-check">
            <span>{t('count.onTable')} <b>{money(tableUnits * unitValue, currency)}</b></span>
            <span>{t('count.counted')} <b>{money(countedUnits * unitValue, currency)}</b></span>
            <span className={Math.abs(diff) < 0.005 ? 'faint' : diff > 0 ? 'pos' : 'neg'}>
              {t('count.diff')} {diff > 0 ? '+' : ''}{money(diff, currency)}
            </span>
          </div>
          <p className="faint cr-note">{t('count.diffHint')}</p>
        </div>
        <div className="cr-bar">
          <button className="btn btn-ghost" onClick={() => { setDone(false); setIdx(players.length - 1); seeded.current = null; }}>
            {t('count.back')}
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={commit}>{t('count.finish')}</button>
        </div>
      </div>
    );
  }

  // ---- one player's stack, tallied by colour ----
  const padDenom = denoms.find((d) => d.id === padId) ?? null;
  const typeDigit = (digit: string) =>
    setCounts((c) => {
      const nextRaw = `${c[padId!] || 0}${digit}`.replace(/^0+(?=\d)/, '');
      return { ...c, [padId!]: Math.min(999, +nextRaw) };
    });

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        {players.length > 1 && (
          <div className="cr-step">{t('count.playerOf', { i: idx + 1, n: players.length })}</div>
        )}
        <div className="cr-title">
          {player!.emoji ? player!.emoji + ' ' : ''}{player!.name || 'Player'}
        </div>
        <div className="cr-prev">
          {t('count.before')} {money((player!.chips || 0) * unitValue, currency)}
        </div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        <div className="segmented cr-mode">
          <button className={mode === 'money' ? 'active' : ''} onClick={() => setMode('money')}>
            {t('count.modeMoney')}
          </button>
          <button className={mode === 'colours' ? 'active' : ''} onClick={() => setMode('colours')}>
            {t('count.modeColours')}
          </button>
        </div>

        {mode === 'money' && (
          <div className="cr-money">
            <div className="faint" style={{ fontSize: 13 }}>
              {t('count.amountOf', { name: player!.name || 'Player' })}
            </div>
            <div className="quick-row">
              {heldMoney > 0 && (
                <button
                  type="button"
                  className="quick-chip is-set"
                  onClick={() => setMoneyText(String(Math.round(heldMoney * 100) / 100))}
                >
                  {t('count.buyInQuick')}
                </button>
              )}
              {quickAmounts.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="quick-chip"
                  onClick={() => setMoneyText(String(Math.round((parseMoney(moneyText) + n) * 100) / 100))}
                >
                  +{currency}{n}
                </button>
              ))}
              <button type="button" className="quick-chip" onClick={() => setMoneyText('')}>C</button>
            </div>
            <div className="input-affix cr-money-in">
              <span className="affix">{currency}</span>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                autoFocus
                value={moneyText}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setMoneyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || currentUnits <= 0) return;
                  if (only) saveOnly();
                  else goNext(currentUnits);
                }}
              />
            </div>
            <p className="faint cr-note">{t('count.moneyHint')}</p>
          </div>
        )}

        {mode === 'colours' && prefilled && (
          <div className="cr-prefill">
            <span>{t('count.prefilled')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCounts({}); setPrefilled(false); }}>
              {t('count.clear')}
            </button>
          </div>
        )}

        {mode === 'colours' && denoms.map((d) => {
          const over = overCount(d);
          return (
            <div className={`cr-denom ${padId === d.id ? 'active' : ''}`} key={d.id}>
              <span className="cr-swatch" style={{ background: d.color, borderColor: d.accent }} />
              <span className="cr-denom-v">{num(d.value)}</span>
              <button className="cr-btn" onClick={() => bump(d.id, -1)} aria-label="−1">−</button>
              <button
                type="button"
                className="cr-num"
                onClick={() => setPadId(padId === d.id ? null : d.id)}
                aria-label={`${num(d.value)} — ${t('count.tapToType')}`}
              >
                {counts[d.id] || 0}
              </button>
              <button className="cr-btn" onClick={() => bump(d.id, 1)}>+1</button>
              <button className="cr-btn wide" onClick={() => bump(d.id, 20)}>+20</button>
              <span className={`cr-denom-sum ${over ? 'over' : ''}`}>
                {over ? `⚠ ${over}/${d.count}` : num((counts[d.id] || 0) * d.value)}
              </span>
            </div>
          );
        })}

        {mode === 'colours' && (
          <button className="mins-toggle cr-all" onClick={() => setShowAll((v) => !v)}>
            <span>{showAll ? t('count.stackColours') : t('count.allColours')}</span>
          </button>
        )}

        <div className="cr-total">
          <span>{num(currentUnits)} {t('plan.chips').toLowerCase()}</span>
          <b>{money(currentUnits * unitValue, currency)}</b>
        </div>

        {isLast && players.length > 1 && (
          <button
            className="btn btn-ghost btn-block btn-sm"
            onClick={() => goNext(restUnits)}
            title={t('count.restHint')}
          >
            {t('count.rest')} {money(restUnits * unitValue, currency)}
          </button>
        )}
      </div>

      {mode === 'colours' && padDenom && (
        <div className="cr-pad">
          <div className="cr-pad-h">
            <span className="cr-swatch" style={{ background: padDenom.color, borderColor: padDenom.accent }} />
            <b>{num(padDenom.value)}</b>
            <span className="cr-pad-val">{counts[padDenom.id] || 0}</span>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setPadId(null)}>{t('count.padDone')}</button>
          </div>
          <div className="cr-pad-grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
              <button key={k} className="cr-key" onClick={() => typeDigit(k)}>{k}</button>
            ))}
            <button className="cr-key" onClick={() => setCounts((c) => ({ ...c, [padDenom.id]: 0 }))}>C</button>
            <button className="cr-key" onClick={() => typeDigit('0')}>0</button>
            <button
              className="cr-key"
              onClick={() => setCounts((c) => ({ ...c, [padDenom.id]: Math.floor((c[padDenom.id] || 0) / 10) }))}
              aria-label="Backspace"
            >
              ⌫
            </button>
          </div>
        </div>
      )}

      <div className="cr-bar">
        <button className="btn btn-ghost" onClick={() => goNext(null)}>{t('count.skip')}</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={currentUnits <= 0}
          onClick={() => (only ? saveOnly() : goNext(currentUnits))}
        >
          {only ? t('count.save') : isLast ? t('count.toSummary') : t('count.next')}
        </button>
      </div>
    </div>
  );
}
