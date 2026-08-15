import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { IconPlus, IconTrash } from './Icons';
import { EmojiPicker } from './EmojiPicker';
import CountRound, { type ChipSnapshot } from './CountRound';
import PlayerSheet from './PlayerSheet';
import Sparkline from './Sparkline';

/** how old the newest count may get before the roster nudges you to count again */
const STALE_MINUTES = 25;
/** how long the undo offer stays up after a counting round */
const UNDO_MS = 8000;

type Prompt = { id: string; kind: 'cashout' | 'rebuy' };

/**
 * THE player list for the night — the ONLY one. Everything that happens to a player
 * mid-game lives here: joining, rebuying (fixed or any amount), having their stack
 * counted, cashing out, busting, coming back for another buy-in, and correcting any
 * of it after the fact via the per-player sheet.
 *
 * Money is cumulative: `buyIn` is every euro that went on the table for that player
 * and `cashOut` every euro that came off, so cashing out ADDS to `cashOut` and a
 * later re-entry ADDS to `buyIn` — the earlier cash-out stays on the record and the
 * net stays right. Stacks (`chips`) are an overview figure and never feed settlement.
 */
export default function PlayerRoster() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { ledger, session, settings } = state;
  const { currency, unitValue } = settings;
  const isCash = settings.gameMode === 'cash';
  const bountyMode = !!settings.bountyMode && !isCash;

  const [menuId, setMenuId] = useState<string | null>(null);
  const [emojiId, setEmojiId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [koPickId, setKoPickId] = useState<string | null>(null); // busted player awaiting bounty attribution
  const [editId, setEditId] = useState<string | null>(null);
  const [round, setRound] = useState<{ only?: string } | null>(null);
  const [undo, setUndo] = useState<ChipSnapshot[] | null>(null);
  const undoTimer = useRef<number | null>(null);
  // re-render on a slow tick so "counted 20 min ago" doesn't go stale on screen
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(h);
  }, []);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  const offerUndo = (snapshot: ChipSnapshot[]) => {
    setUndo(snapshot);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  /** newest counting round across the table, in minutes ago (null = never counted) */
  const lastCountAt = ledger.reduce<number | null>((newest, p) => {
    const last = p.chipHistory?.[p.chipHistory.length - 1]?.at;
    return last && (newest === null || last > newest) ? last : newest;
  }, null);
  const countedMinsAgo = lastCountAt === null ? null : Math.floor((Date.now() - lastCountAt) / 60000);
  const stale = ledger.length > 0 && (countedMinsAgo === null || countedMinsAgo >= STALE_MINUTES);

  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const onTable = totalIn - totalOut;
  const pool = isCash ? Math.max(0, onTable) : totalIn;
  const counted = ledger.filter((p) => !p.out).reduce((s, p) => s + (p.chips || 0), 0) * unitValue;
  const anyCounted = ledger.some((p) => !p.out && (p.chips || 0) > 0);
  const diff = counted - onTable;

  /** Keep the planning player count in step with who's actually here. */
  const syncCount = (n: number) => dispatch({ type: 'SET_PLAYER_COUNT', n: Math.max(1, n) });

  const addPlayer = () => {
    dispatch({ type: 'LEDGER_ADD' });
    syncCount(ledger.length + 1);
  };

  const removePlayer = (id: string) => {
    dispatch({ type: 'LEDGER_REMOVE', id });
    syncCount(ledger.length - 1);
    setMenuId(null);
  };

  const closeRow = () => { setMenuId(null); setPrompt(null); };

  /** Cash-out ADDS to the total taken off the table, so a second one later still adds up. */
  const cashOut = (id: string, amount: number) => {
    const p = ledger.find((x) => x.id === id);
    if (!p) return;
    dispatch({
      type: 'LEDGER_UPDATE',
      id,
      patch: { cashOut: (p.cashOut || 0) + amount, out: true, outAt: Date.now(), chips: undefined },
    });
    closeRow();
  };

  /** Buying (back) in ADDS to the total put on the table and puts them in play. */
  const buyIn = (id: string, amount: number) => {
    const p = ledger.find((x) => x.id === id);
    if (!p) return;
    dispatch({
      type: 'LEDGER_UPDATE',
      id,
      patch: { buyIn: (p.buyIn || 0) + amount, out: false, outAt: undefined },
    });
    closeRow();
  };

  return (
    <>
      <div className="section-label">
        {t('roster.title')}
        <span className="hint">{t('roster.hint')}</span>
      </div>

      <div className="card">
        {ledger.length === 0 ? (
          <>
            <div className="empty" style={{ paddingBottom: 12 }}>{t('roster.empty')}</div>
            <button
              className="btn btn-primary btn-block"
              onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: session.playerCount })}
            >
              {t('roster.startWith', { n: session.playerCount })}
            </button>
            <button className="btn btn-ghost btn-block btn-sm mt8" onClick={addPlayer}>
              <IconPlus size={16} /> {t('roster.addPlayer')}
            </button>
          </>
        ) : (
          <>
            <div className="pr-list">
              {ledger.map((p) => {
                const gone = !!p.out;
                const cashedOut = (p.cashOut || 0) > 0;
                const net = (p.cashOut || 0) - (p.buyIn || 0);
                return (
                  <div className={`pr-row ${gone ? 'is-out' : ''}`} key={p.id}>
                    <div className="pr-top">
                      <button
                        type="button"
                        className="pr-emoji"
                        onClick={() => setEmojiId(emojiId === p.id ? null : p.id)}
                        aria-label={t('roster.avatar')}
                      >
                        {p.emoji || '🙂'}
                      </button>
                      <input
                        className="ledger-name pr-name"
                        value={p.name}
                        placeholder={t('roster.name')}
                        onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
                      />
                      {bountyMode && (p.knockouts || 0) > 0 && <span className="pr-ko">🎯{p.knockouts}</span>}
                      <button
                        type="button"
                        className={`icon-btn pr-more ${menuId === p.id ? 'active' : ''}`}
                        onClick={() => { setMenuId(menuId === p.id ? null : p.id); setPrompt(null); }}
                        aria-label={t('roster.more')}
                      >
                        ⋯
                      </button>
                    </div>

                    {emojiId === p.id && (
                      <EmojiPicker
                        value={p.emoji}
                        onPick={(emoji) => {
                          dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { emoji } });
                          setEmojiId(null);
                        }}
                      />
                    )}

                    <div className="pr-stats">
                      <span className="pr-k">{t('roster.boughtIn')}</span>
                      <span className="pr-v">{money(p.buyIn || 0, currency)}</span>
                      {cashedOut && (
                        <>
                          <span className="pr-k">{t('roster.out')}</span>
                          <span className="pr-v">{money(p.cashOut, currency)}</span>
                        </>
                      )}
                      {gone ? (
                        <>
                          <div className="spacer" />
                          {!cashedOut && <span className="pr-k">{t('roster.busted')}</span>}
                          <span className={net >= 0 ? 'pos' : 'neg'}>
                            {net >= 0 ? '+' : ''}{money(net, currency)}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost btn-sm pr-rebuy"
                            onClick={() => buyIn(p.id, session.buyIn)}
                            title={t('roster.rebuy')}
                          >
                            <IconPlus size={13} /> {money(session.buyIn, currency)}
                          </button>
                          <div className="spacer" />
                          {(p.chipHistory?.length ?? 0) > 1 && (
                            <Sparkline className="pr-spark" points={p.chipHistory!.map((h) => h.chips)} />
                          )}
                          <button className="pr-stack" onClick={() => setRound({ only: p.id })}>
                            <span className="pr-k">{t('roster.stack')}</span>
                            <b>{p.chips ? money(p.chips * unitValue, currency) : '—'}</b>
                            <span className="pr-count-ic">🧮</span>
                          </button>
                        </>
                      )}
                    </div>

                    {menuId === p.id && (
                      <div className="pr-menu">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(p.id); closeRow(); }}>
                          ✏️ {t('roster.edit')}
                        </button>
                        <button
                          className={`btn btn-sm ${prompt?.id === p.id && prompt.kind === 'rebuy' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setPrompt(prompt?.id === p.id && prompt.kind === 'rebuy' ? null : { id: p.id, kind: 'rebuy' })}
                        >
                          {gone ? t('roster.buyBackIn') : t('roster.addBuyIn')}
                        </button>
                        {!gone && (
                          <button
                            className={`btn btn-sm ${prompt?.id === p.id && prompt.kind === 'cashout' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setPrompt(prompt?.id === p.id && prompt.kind === 'cashout' ? null : { id: p.id, kind: 'cashout' })}
                          >
                            {t('roster.cashOut')}
                          </button>
                        )}
                        {!isCash && !gone && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { out: true, outAt: Date.now(), chips: undefined } });
                              setKoPickId(bountyMode ? p.id : null);
                              setMenuId(null);
                            }}
                          >
                            {t('roster.markOut')}
                          </button>
                        )}
                        <div className="spacer" />
                        <button
                          className="icon-btn danger"
                          style={{ width: 32, height: 32 }}
                          onClick={() => removePlayer(p.id)}
                          aria-label={t('roster.remove')}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}

                    {prompt?.id === p.id && (
                      <AmountPrompt
                        label={
                          prompt.kind === 'cashout'
                            ? t('roster.cashOutPrompt', { name: p.name || 'Player' })
                            : t('roster.buyInPrompt', { name: p.name || 'Player' })
                        }
                        currency={currency}
                        defaultValue={
                          prompt.kind === 'cashout'
                            ? p.chips
                              ? Math.round(p.chips * unitValue * 100) / 100
                              : p.buyIn || 0
                            : session.buyIn
                        }
                        confirmLabel={t('roster.confirm')}
                        onCancel={() => setPrompt(null)}
                        onConfirm={(v) => (prompt.kind === 'cashout' ? cashOut(p.id, v) : buyIn(p.id, v))}
                      />
                    )}

                    {koPickId === p.id && (
                      <div className="ko-pick">
                        <div className="faint" style={{ fontSize: 12 }}>{t('table.koPrompt', { name: p.name || 'Player' })}</div>
                        <div className="ko-pick-grid">
                          {ledger.filter((o) => o.id !== p.id && !o.out).map((o) => (
                            <button
                              key={o.id}
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                dispatch({ type: 'LEDGER_UPDATE', id: o.id, patch: { knockouts: (o.knockouts || 0) + 1 } });
                                setKoPickId(null);
                              }}
                            >
                              {o.emoji ? `${o.emoji} ` : ''}{o.name || 'Player'}
                            </button>
                          ))}
                          <button className="btn btn-ghost btn-sm ko-skip" onClick={() => setKoPickId(null)}>{t('table.koSkip')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pr-actions">
              <button className="btn btn-ghost btn-sm" onClick={addPlayer}>
                <IconPlus size={15} /> {t('roster.addPlayer')}
              </button>
              <button className={`btn btn-sm ${stale ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRound({})}>
                🧮 {t('roster.countRound')}
              </button>
            </div>

            <div className={`pr-age ${stale ? 'is-stale' : ''}`}>
              {countedMinsAgo === null
                ? t('roster.neverCounted')
                : countedMinsAgo < 1
                  ? t('roster.countedJustNow')
                  : t('roster.countedAgo', { n: countedMinsAgo })}
            </div>

            <div className="pr-totals">
              <span>{isCash ? t('table.onTablePool') : t('table.poolTotal')} <b>{money(pool, currency)}</b></span>
              {/* In a tournament the pool is everything bought in, but a cash-out means less
                  than that is still in front of the players — spell the basis out. */}
              {anyCounted && Math.abs(pool - onTable) > 0.005 && (
                <span>{t('roster.onTable')} <b>{money(onTable, currency)}</b></span>
              )}
              {anyCounted && (
                <>
                  <span>{t('roster.counted')} <b>{money(counted, currency)}</b></span>
                  <span className={Math.abs(diff) < 0.005 ? 'faint' : diff > 0 ? 'pos' : 'neg'}>
                    {diff > 0 ? '+' : ''}{money(diff, currency)}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {round && <CountRound only={round.only} onClose={() => setRound(null)} onUndoable={offerUndo} />}
      {editId && <PlayerSheet playerId={editId} onClose={() => setEditId(null)} />}

      {undo && (
        <div className="snackbar" role="status">
          <span>{t('roster.countSaved')}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              dispatch({ type: 'LEDGER_RESTORE_CHIPS', players: undo });
              setUndo(null);
            }}
          >
            {t('roster.undo')}
          </button>
        </div>
      )}
    </>
  );
}

/** Inline "how much?" row used for both cash-outs and (re-)buy-ins. */
function AmountPrompt({
  label,
  currency,
  defaultValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  label: string;
  currency: string;
  defaultValue: number;
  confirmLabel: string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : '');
  const submit = () => onConfirm(Math.max(0, +value || 0));

  return (
    <div className="pr-cashout">
      <div className="faint" style={{ fontSize: 12 }}>{label}</div>
      <div className="input-affix" style={{ marginTop: 6 }}>
        <span className="affix">{currency}</span>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step="any"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <button className="btn btn-primary btn-sm" style={{ margin: 4 }} onClick={submit}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
