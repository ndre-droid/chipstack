import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { IconPlus, IconTrash } from './Icons';
import { EmojiPicker } from './EmojiPicker';
import CountRound, { type ChipSnapshot } from './CountRound';
import Sparkline from './Sparkline';

/** how old the newest count may get before the roster nudges you to count again */
const STALE_MINUTES = 25;
/** how long the undo offer stays up after a counting round */
const UNDO_MS = 8000;

/**
 * THE player list for the night, on the Table tab — one place for everything that
 * happens to a player mid-game: joining, rebuying, having their stack counted,
 * cashing out, busting, leaving. Replaces the old "players at the table" stepper
 * (which only counted a number, not people) and the photo chip-count card.
 *
 * Stacks are stored in chip-units (`LedgerPlayer.chips`) and shown as money; they
 * are an overview figure and never feed the buy-in / settlement maths.
 */
export default function PlayerRoster() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { ledger, session, settings } = state;
  const { currency, unitValue } = settings;
  const isCash = settings.gameMode === 'cash';

  const [menuId, setMenuId] = useState<string | null>(null);
  const [emojiId, setEmojiId] = useState<string | null>(null);
  const [cashOutId, setCashOutId] = useState<string | null>(null);
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

  const onTable = ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0);
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
                const gone = p.out || (p.cashOut || 0) > 0;
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
                      <button
                        type="button"
                        className={`icon-btn pr-more ${menuId === p.id ? 'active' : ''}`}
                        onClick={() => { setMenuId(menuId === p.id ? null : p.id); setCashOutId(null); }}
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
                      {gone ? (
                        <>
                          <span className="pr-k">
                            {(p.cashOut || 0) > 0 ? t('roster.cashedOut') : t('roster.busted')}
                          </span>
                          <span className={net >= 0 ? 'pos' : 'neg'}>
                            {net >= 0 ? '+' : ''}{money(net, currency)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="pr-k">{t('roster.boughtIn')}</span>
                          <span className="pr-v">{money(p.buyIn || 0, currency)}</span>
                          <button
                            className="btn btn-ghost btn-sm pr-rebuy"
                            onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: (p.buyIn || 0) + session.buyIn } })}
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
                        {gone ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { out: false, outAt: undefined, cashOut: 0 } });
                              setMenuId(null);
                            }}
                          >
                            {t('roster.backIn')}
                          </button>
                        ) : (
                          <>
                            <button
                              className={`btn btn-sm ${cashOutId === p.id ? 'btn-primary' : 'btn-ghost'}`}
                              onClick={() => setCashOutId(cashOutId === p.id ? null : p.id)}
                            >
                              {t('roster.cashOut')}
                            </button>
                            {!isCash && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { out: true, outAt: Date.now(), chips: undefined } });
                                  setMenuId(null);
                                }}
                              >
                                {t('roster.markOut')}
                              </button>
                            )}
                          </>
                        )}
                        <div className="spacer" />
                        <button className="icon-btn danger" style={{ width: 32, height: 32 }} onClick={() => removePlayer(p.id)} aria-label={t('roster.remove')}>
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}

                    {cashOutId === p.id && (
                      <div className="pr-cashout">
                        <div className="faint" style={{ fontSize: 12 }}>{t('roster.cashOutPrompt', { name: p.name || 'Player' })}</div>
                        <div className="input-affix" style={{ marginTop: 6 }}>
                          <span className="affix">{currency}</span>
                          <input
                            id={`pr-cashout-${p.id}`}
                            className="input"
                            type="number"
                            inputMode="decimal"
                            autoFocus
                            defaultValue={p.chips ? Math.round(p.chips * unitValue * 100) / 100 : p.buyIn || ''}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ margin: 4 }}
                            onClick={() => {
                              const el = document.getElementById(`pr-cashout-${p.id}`) as HTMLInputElement | null;
                              const v = Math.max(0, +(el?.value ?? 0));
                              dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { cashOut: v, out: true, outAt: Date.now(), chips: undefined } });
                              setCashOutId(null);
                              setMenuId(null);
                            }}
                          >
                            {t('roster.confirm')}
                          </button>
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
              <span>{t('roster.onTable')} <b>{money(onTable, currency)}</b></span>
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
