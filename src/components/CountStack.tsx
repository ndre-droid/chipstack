import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { parseMoney } from '../lib/money';
import { startingStackOf, handoutStack } from '../lib/startingStack';
import type { Denomination, LedgerSnapshot } from '../types';

/**
 * ONE player's stack, counted exactly.
 *
 * The exact path, not the usual one: the round itself is dragged on
 * `StackShareRound`, and this sheet is what you open when a single pile has to be
 * right — a colour-by-colour tally, or a typed amount. It never walks the table.
 *
 * With `onResult` it hands the number back instead of writing it, so the slider
 * round can take an exact stack for one row without committing the whole table.
 */
export default function CountStack({
  playerId,
  onClose,
  onResult,
  onUndoable,
}: {
  playerId: string;
  onClose: () => void;
  /** given: return the counted units to the caller. Absent: write them to the ledger. */
  onResult?: (units: number) => void;
  /** offered the ledger as it stood, so the caller can put an undo up */
  onUndoable?: (previous: LedgerSnapshot) => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { denominations, ledger, session, settings } = state;
  const { unitValue, currency } = settings;

  const player = ledger.find((p) => p.id === playerId);

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
     real table it is by far the fastest — you look at the pile, type a number. Tallying
     by colour is the exact-but-slow path, kept one tap away. The choice is remembered
     in settings, so a table that prefers one never re-picks it. */
  const mode: 'money' | 'colours' = settings.countMode ?? 'money';
  const setMode = (m: 'money' | 'colours') => dispatch({ type: 'UPDATE_SETTINGS', patch: { countMode: m } });

  const [counts, setCounts] = useState<Record<string, number>>({});
  /** the money-mode field, as typed (a string so "" isn't the same as 0) */
  const [moneyText, setMoneyText] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [padId, setPadId] = useState<string | null>(null);
  // back closes the numpad first, then the sheet
  useBackHandler(padId !== null, () => setPadId(null));
  useBackHandler(true, onClose);

  const colourUnits = denoms.reduce((s, d) => s + (counts[d.id] || 0) * d.value, 0);
  const moneyUnits = moneyToUnits(Math.max(0, parseMoney(moneyText)), unitValue);
  const currentUnits = mode === 'money' ? moneyUnits : colourUnits;

  /** One-tap amounts, same set the roster offers. */
  const quickAmounts = [session.buyIn, 5, 10, 20, 50].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
  /** What this player has on the table — the sensible "still on their stack" answer. */
  const heldMoney = Math.max(0, (player?.buyIn || 0) - (player?.cashOut || 0)) || session.buyIn;

  // A player nobody has counted yet is still holding what they were handed — so
  // pre-fill with a chip pattern worth exactly THEIR stack, not the standard
  // buy-in. Someone who bought in for €5 starts from €5 of chips.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!player || seeded.current === player.id) return;
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
  }, [player, denominations, session, unitValue]);

  const bump = (id: string, by: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + by) }));

  const save = () => {
    if (onResult) {
      onResult(currentUnits);
    } else {
      onUndoable?.(ledger);
      dispatch({ type: 'LEDGER_SET_CHIPS_MANY', entries: [{ id: playerId, chips: currentUnits }] });
    }
    onClose();
  };

  /**
   * Inventory check: you can't be holding more chips of a colour than exist in the
   * box. One player against the whole box — the table-wide version went away with
   * the walk-the-table round.
   */
  const overCount = (d: Denomination) => {
    const held = counts[d.id] || 0;
    return d.count > 0 && held > d.count ? held : 0;
  };

  if (!player) {
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-body">
          <div className="empty">{t('count.noPlayers')}</div>
          <button className="btn btn-primary btn-block" onClick={onClose}>{t('count.close')}</button>
        </div>
      </div>
    );
  }

  const padDenom = denoms.find((d) => d.id === padId) ?? null;
  const typeDigit = (digit: string) =>
    setCounts((c) => {
      const nextRaw = `${c[padId!] || 0}${digit}`.replace(/^0+(?=\d)/, '');
      return { ...c, [padId!]: Math.min(999, +nextRaw) };
    });

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">
          {player.emoji ? player.emoji + ' ' : ''}{player.name || 'Player'}
        </div>
        <div className="cr-prev">
          {t('count.before')} {money((player.chips || 0) * unitValue, currency)}
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
              {t('count.amountOf', { name: player.name || 'Player' })}
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
                  if (e.key === 'Enter' && currentUnits > 0) save();
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
              aria-label={t('count.backspace')}
            >
              ⌫
            </button>
          </div>
        </div>
      )}

      <div className="cr-bar">
        <button className="btn btn-ghost" onClick={onClose}>{t('count.close')}</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={currentUnits <= 0}
          onClick={save}
        >
          {t('count.save')}
        </button>
      </div>
    </div>
  );
}
