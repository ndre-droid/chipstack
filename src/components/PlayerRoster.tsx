import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { IconPlus, IconTrash } from './Icons';
import { EmojiPicker } from './EmojiPicker';
import CountRound, { type LedgerSnapshot } from './CountRound';
import PlayerSheet from './PlayerSheet';
import Sparkline from './Sparkline';
import { handoutStack } from '../lib/startingStack';
import { moneyToUnits } from '../lib/distribution';
import { parseMoney } from '../lib/money';
import { useConfirm } from './Confirm';
import { netOf } from '../lib/settle';
import { useBackHandler } from '../lib/backHandler';
import { haptic } from '../lib/platform';
import PeoplePicker from './PeoplePicker';

/** how old the newest count may get before the roster nudges you to count again */
const STALE_MINUTES = 25;
/** how long the undo offer stays up after a counting round */
const UNDO_MS = 8000;

type Prompt = { id: string; kind: 'cashout' | 'rebuy' };
/** the chips to physically hand over after a buy-in, shown until dismissed */
type Handout = { id: string; amount: number; denoms: { value: number; color: string; accent: string; n: number }[] };

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
  // The stack being typed in right now. Entering the euro amount straight into the
  // row is the FASTEST thing at a live table, so it is the primary path; the
  // colour-by-colour tally sits one tap further in.
  const [stackId, setStackId] = useState<string | null>(null);
  // Names are read-only until tapped: a bare always-live input in every row meant a
  // stray tap while scrolling the roster silently renamed somebody.
  const [nameId, setNameId] = useState<string | null>(null);
  const [handout, setHandout] = useState<Handout | null>(null);
  const [tableMenu, setTableMenu] = useState(false);
  const [pickPeople, setPickPeople] = useState(false);
  const confirm = useConfirm();
  // What the ledger looked like before the last money change, plus what to call it.
  const [undo, setUndo] = useState<{ ledger: LedgerSnapshot; label: string } | null>(null);
  const undoTimer = useRef<number | null>(null);
  // re-render on a slow tick so "counted 20 min ago" doesn't go stale on screen
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(h);
  }, []);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  const offerUndo = (ledgerBefore: LedgerSnapshot, label = t('roster.countSaved')) => {
    setUndo({ ledger: ledgerBefore, label });
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

  /** Who is winning right now — the phone gets the same crown the TV shows. */
  const inPlayCounted = ledger.filter((p) => !p.out && (p.chips || 0) > 0);
  const leaderId = inPlayCounted.reduce<string | null>(
    (best, p) => (best === null || (p.chips || 0) > (ledger.find((x) => x.id === best)?.chips || 0) ? p.id : best),
    null,
  );
  const contested = inPlayCounted.length > 1;

  /* Nine people in seat order is a scrolling exercise when you just want to see who
     is winning. Display-only — the underlying ledger order never changes, and this
     is deliberately NOT the TV's sort (see Settings.rosterSort). */
  const sortMode = settings.rosterSort ?? 'seat';
  const shown = (() => {
    if (sortMode === 'seat') return ledger;
    const key = (p: (typeof ledger)[number]) => (sortMode === 'chips' ? (p.chips || 0) * unitValue : netOf(p, unitValue));
    // whoever has left the table sinks to the bottom either way
    return [...ledger].sort((a, b) => Number(!!a.out) - Number(!!b.out) || key(b) - key(a));
  })();
  const cycleSort = () => {
    const order = ['seat', 'chips', 'profit'] as const;
    const next = order[(order.indexOf(sortMode) + 1) % order.length];
    dispatch({ type: 'UPDATE_SETTINGS', patch: { rosterSort: next } });
  };
  const sortLabel = { seat: t('roster.sortSeat'), chips: t('roster.sortChips'), profit: t('roster.sortProfit') }[sortMode];

  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const onTable = totalIn - totalOut;
  const pool = isCash ? Math.max(0, onTable) : totalIn;
  const counted = ledger.filter((p) => !p.out).reduce((s, p) => s + (p.chips || 0), 0) * unitValue;
  const anyCounted = ledger.some((p) => !p.out && (p.chips || 0) > 0);
  const diff = counted - onTable;

  /** One-tap amounts: the buy-in first, then the usual small notes people throw in. */
  const quickAmounts = [session.buyIn, 5, 10, 20, 50]
    .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
    .slice(0, 4);

  /** What a still-playing stack is worth against what they put in — the number
   *  everybody asks for mid-game and had to work out in their head. Shared with the
   *  settle-up tab so the same player can't read +€12 here and −€20 there. */
  const netNow = (p: (typeof ledger)[number]) => netOf(p, unitValue);

  // The planning player count follows the roster automatically (see the reducer),
  // so nothing here has to remember to keep the two in step.
  // Adding somebody goes through the saved-players sheet: the same six people show
  // up most weeks, and retyping them every night was the single most tedious thing
  // about setting up.
  const addPlayer = () => setPickPeople(true);

  const removePlayer = (id: string) => {
    const gone = ledger.find((p) => p.id === id);
    dispatch({ type: 'LEDGER_REMOVE', id });
    offerUndo(ledger, t('roster.undoRemoved', { name: gone?.name || '' }));
    setMenuId(null);
  };

  const closeRow = () => { setMenuId(null); setPrompt(null); };

  /* Android back closes whatever the row has open, innermost first, before it gets
     anywhere near leaving the app. The sheets (counting round, player sheet) register
     themselves, so they are not listed here. */
  useBackHandler(
    !!(handout || koPickId || tableMenu || emojiId || stackId || prompt || menuId || nameId),
    () => {
      if (handout) setHandout(null);
      else if (koPickId) setKoPickId(null);
      else if (tableMenu) setTableMenu(false);
      else if (emojiId) setEmojiId(null);
      else if (stackId) setStackId(null);
      else if (prompt) setPrompt(null);
      else if (menuId) setMenuId(null);
      else setNameId(null);
    },
  );

  /** Cash-out ADDS to the total taken off the table, so a second one later still adds up. */
  const cashOut = (id: string, amount: number) => {
    const p = ledger.find((x) => x.id === id);
    if (!p) return;
    dispatch({
      type: 'LEDGER_UPDATE',
      id,
      patch: { cashOut: (p.cashOut || 0) + amount, out: true, outAt: Date.now(), chips: undefined },
    });
    offerUndo(ledger, t('roster.undoCashOut', { name: p.name || '' }));
    haptic(18);
    closeRow();
  };

  /**
   * Buying (back) in ADDS to the total put on the table and puts them in play — and
   * hands over chips worth exactly that amount, so a €5 late buy-in is €5 of chips,
   * not a fresh full stack. The breakdown is shown so you know what to push across.
   */
  const buyIn = (id: string, amount: number) => {
    const p = ledger.find((x) => x.id === id);
    if (!p || amount <= 0) return;
    const stack = handoutStack(state.denominations, session, unitValue, amount);
    dispatch({
      type: 'LEDGER_UPDATE',
      id,
      patch: {
        buyIn: (p.buyIn || 0) + amount,
        out: false,
        outAt: undefined,
        chips: (p.chips || 0) + moneyToUnits(amount, unitValue),
      },
    });
    offerUndo(ledger, t('roster.undoRebuy', { name: p.name || '' }));
    haptic(12);
    setHandout({
      id,
      amount,
      denoms: stack.denomsUsed.map((d) => ({ value: d.value, color: d.color, accent: d.accent, n: stack.counts[d.id] || 0 })),
    });
    closeRow();
  };

  /**
   * Type a player's stack as money. Goes through the same action a counting round
   * uses, so the trail, the sparkline, the undo offer and the single TV push all
   * behave identically — only the input is faster.
   */
  const setStackMoney = (id: string, amount: number) => {
    const p = ledger.find((x) => x.id === id);
    if (!p) return;
    const units = moneyToUnits(Math.max(0, amount), unitValue);
    // same reason as the counting round: the trail point lands on every in-play row
    offerUndo(ledger);
    dispatch({ type: 'LEDGER_SET_CHIPS_MANY', entries: [{ id, chips: units > 0 ? units : undefined }] });
    setStackId(null);
  };

  return (
    <>
      <div className="section-label">
        {t('roster.title')}
        {ledger.length > 3 ? (
          <button className="pr-sort hint" onClick={cycleSort} aria-label={t('roster.sort')}>
            ⇅ {sortLabel}
          </button>
        ) : (
          <span className="hint">{t('roster.hint')}</span>
        )}
      </div>

      <div className="card">
        {ledger.length === 0 ? (
          <>
            <div className="empty" style={{ paddingBottom: 12 }}>{t('roster.empty')}</div>
            {/* One tap for the usual crowd — the fastest possible start to a night. */}
            {state.lastLineup.length > 0 && (
              <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'LEDGER_SEAT_LINEUP' })}>
                {t('roster.lastLineup')}
                <span className="pr-lineup-names">{state.lastLineup.map((l) => l.name).join(' · ')}</span>
              </button>
            )}
            <button
              className={`btn btn-block ${state.lastLineup.length ? 'btn-ghost mt8' : 'btn-primary'}`}
              onClick={addPlayer}
            >
              <IconPlus size={16} /> {t('roster.addPlayers')}
            </button>
            <button
              className="btn btn-ghost btn-block btn-sm mt8"
              onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: session.playerCount })}
            >
              {t('roster.startWith', { n: session.playerCount })}
            </button>
          </>
        ) : (
          <>
            <div className="pr-list">
              {shown.map((p) => {
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
                      {nameId === p.id ? (
                        <input
                          className="ledger-name pr-name"
                          value={p.name}
                          placeholder={t('roster.name')}
                          autoFocus
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() => setNameId(null)}
                          onKeyDown={(e) => {
                            // close on the key itself as well as on blur: an Android soft
                            // keyboard's "done" does not always blur the field
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              e.currentTarget.blur();
                              setNameId(null);
                            }
                          }}
                          onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
                        />
                      ) : (
                        <button
                          type="button"
                          // the chip leader is marked ON the name (weight + accent), not with a
                          // crown beside it: that shifted the name sideways and read as just
                          // another player emoji
                          className={`pr-name-btn${leaderId === p.id && contested ? ' leader' : ''}`}
                          onClick={() => setNameId(p.id)}
                          aria-label={t('roster.editName')}
                          title={leaderId === p.id && contested ? t('roster.leader') : undefined}
                        >
                          {p.name || t('roster.name')}
                        </button>
                      )}
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
                          {settings.showTrend !== false && (p.chipHistory?.length ?? 0) > 1 && (
                            <Sparkline
                              className="pr-spark"
                              points={p.chipHistory!.map((h) => h.chips)}
                              baseline={moneyToUnits(Math.max(0, (p.buyIn || 0) - (p.cashOut || 0)), unitValue)}
                            />
                          )}
                          {(p.chips || 0) > 0 && (
                            <span className={`pr-net ${netNow(p) >= 0 ? 'pos' : 'neg'}`}>
                              {netNow(p) >= 0 ? '+' : ''}{money(netNow(p), currency)}
                            </span>
                          )}
                          <button
                            className={`pr-stack ${stackId === p.id ? 'active' : ''}`}
                            onClick={() => { setStackId(stackId === p.id ? null : p.id); setPrompt(null); setMenuId(null); }}
                            title={t('roster.stackEditHint')}
                          >
                            <span className="pr-k">{t('roster.stack')}</span>
                            <b>{p.chips ? money(p.chips * unitValue, currency) : '—'}</b>
                            <span className="pr-count-ic">✎</span>
                          </button>
                        </>
                      )}
                    </div>

                    {menuId === p.id && (
                      <div className="pr-menu">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(p.id); closeRow(); }}>
                          ✏️ {t('roster.edit')}
                        </button>
                        {/* Somebody who wandered in and got typed by hand — keep them
                            so next week they are one tap in the picker. */}
                        {!p.personId && (p.name || '').trim() && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              dispatch({ type: 'PERSON_SAVE', person: { name: p.name, emoji: p.emoji } });
                              closeRow();
                            }}
                          >
                            ⭐ {t('roster.saveToPeople')}
                          </button>
                        )}
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
                              offerUndo(ledger, t('roster.undoBust', { name: p.name || '' }));
                              haptic([14, 60, 14]);
                              setKoPickId(bountyMode ? p.id : null);
                              setMenuId(null);
                            }}
                          >
                            {t('roster.markOut')}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            dispatch({ type: 'LEDGER_RESET_PLAYER', id: p.id });
                            closeRow();
                          }}
                        >
                          ↺ {t('roster.resetPlayer')}
                        </button>
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

                    {stackId === p.id && (
                      <StackPrompt
                        label={t('roster.stackOf', { name: p.name || 'Player' })}
                        currency={currency}
                        value={p.chips ? Math.round(p.chips * unitValue * 100) / 100 : 0}
                        buyInLabel={t('count.buyInQuick')}
                        buyIn={Math.max(0, (p.buyIn || 0) - (p.cashOut || 0)) || session.buyIn}
                        quick={quickAmounts}
                        confirmLabel={t('count.save')}
                        byColourLabel={t('roster.byColour')}
                        onByColour={() => { setStackId(null); setRound({ only: p.id }); }}
                        onCancel={() => setStackId(null)}
                        onConfirm={(v) => setStackMoney(p.id, v)}
                      />
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
                        quick={quickAmounts}
                        onCancel={() => setPrompt(null)}
                        onConfirm={(v) => (prompt.kind === 'cashout' ? cashOut(p.id, v) : buyIn(p.id, v))}
                      />
                    )}

                    {handout?.id === p.id && (
                      <div className="pr-handout">
                        <div className="pr-handout-h">
                          {t('roster.handOver', { amount: money(handout.amount, currency) })}
                          <button className="btn btn-ghost btn-sm" onClick={() => setHandout(null)}>{t('roster.gotIt')}</button>
                        </div>
                        <div className="pr-handout-chips">
                          {handout.denoms.map((d) => (
                            <span className="pr-handout-chip" key={d.value}>
                              <span className="cr-swatch" style={{ background: d.color, borderColor: d.accent }} />
                              {d.n}× {d.value}
                            </span>
                          ))}
                        </div>
                      </div>
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
              <button
                className={`icon-btn ${tableMenu ? 'active' : ''}`}
                style={{ flex: 'none', width: 36 }}
                onClick={() => setTableMenu((v) => !v)}
                aria-label={t('roster.tableActions')}
              >
                ↺
              </button>
            </div>

            {tableMenu && (
              <div className="pr-table-menu">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    dispatch({ type: 'LEDGER_SET_ALL_CHIPS', chips: moneyToUnits(session.buyIn, unitValue) });
                    setTableMenu(false);
                  }}
                >
                  {t('roster.allToBuyIn', { amount: money(session.buyIn, currency) })}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    dispatch({ type: 'LEDGER_CLEAR_CHIPS' });
                    setTableMenu(false);
                  }}
                >
                  {t('roster.clearStacks')}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    confirm.ask({
                      text: t('roster.resetTableConfirm'),
                      confirmLabel: t('roster.resetTable'),
                      onYes: () => dispatch({ type: 'LEDGER_RESET_ALL' }),
                    });
                    setTableMenu(false);
                  }}
                >
                  ↺ {t('roster.resetTable')}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    dispatch({ type: 'UPDATE_SETTINGS', patch: { showTrend: settings.showTrend === false } });
                    setTableMenu(false);
                  }}
                >
                  {settings.showTrend !== false ? '✓ ' : ''}{t('roster.trendLine')}
                </button>
                <button
                  className="btn btn-ghost btn-sm danger-text"
                  onClick={() => {
                    confirm.ask({
                      text: t('roster.newNightConfirm'),
                      confirmLabel: t('roster.newNight'),
                      danger: true,
                      onYes: () => dispatch({ type: 'LEDGER_CLEAR' }),
                    });
                    setTableMenu(false);
                  }}
                >
                  {t('roster.newNight')}
                </button>
              </div>
            )}

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

      {confirm.node}
      {round && <CountRound only={round.only} onClose={() => setRound(null)} onUndoable={offerUndo} />}
      {pickPeople && <PeoplePicker onClose={() => setPickPeople(false)} />}
      {editId && <PlayerSheet playerId={editId} onClose={() => setEditId(null)} />}

      {undo && (
        <div className="snackbar" role="status">
          <span>{undo.label}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              dispatch({ type: 'LEDGER_RESTORE', ledger: undo.ledger });
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
  quick,
  onConfirm,
  onCancel,
}: {
  label: string;
  currency: string;
  defaultValue: number;
  confirmLabel: string;
  quick: number[];
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : '');
  const submit = () => onConfirm(Math.max(0, parseMoney(value)));
  /** taps ADD up, so 5 + 5 + 10 is three taps and no typing */
  const add = (n: number) => setValue(String(Math.round((parseMoney(value) + n) * 100) / 100));

  return (
    <div className="pr-cashout">
      <div className="faint" style={{ fontSize: 12 }}>{label}</div>
      <div className="quick-row">
        {quick.map((n) => (
          <button key={n} type="button" className="quick-chip" onClick={() => add(n)}>
            +{currency}{n}
          </button>
        ))}
        <button type="button" className="quick-chip" onClick={() => setValue('')}>C</button>
      </div>
      <div className="input-affix" style={{ marginTop: 6 }}>
        <span className="affix">{currency}</span>
        <input
          className="input"
          type="text"
          inputMode="decimal"
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

/**
 * The stack, typed as money. This is the PRIMARY way a stack gets updated during a
 * game: you glance at the pile, type "47", done. The colour-by-colour tally is one
 * tap away for when someone wants it exact.
 *
 * The quick chips ADD (so 20 + 20 + 5 is three taps), except "= buy-in", which SETS
 * — it answers "they're still on their starting stack", which is a total, not a
 * top-up.
 */
function StackPrompt({
  label,
  currency,
  value,
  buyIn,
  buyInLabel,
  quick,
  confirmLabel,
  byColourLabel,
  onByColour,
  onConfirm,
  onCancel,
}: {
  label: string;
  currency: string;
  value: number;
  buyIn: number;
  buyInLabel: string;
  quick: number[];
  confirmLabel: string;
  byColourLabel: string;
  onByColour: () => void;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  const submit = () => onConfirm(Math.max(0, parseMoney(text)));
  const add = (n: number) => setText(String(Math.round((parseMoney(text) + n) * 100) / 100));

  return (
    <div className="pr-stackedit">
      <div className="faint" style={{ fontSize: 12 }}>{label}</div>
      <div className="quick-row">
        {buyIn > 0 && (
          <button type="button" className="quick-chip is-set" onClick={() => setText(String(buyIn))}>
            {buyInLabel}
          </button>
        )}
        {quick.map((n) => (
          <button key={n} type="button" className="quick-chip" onClick={() => add(n)}>
            +{currency}{n}
          </button>
        ))}
        <button type="button" className="quick-chip" onClick={() => setText('')}>C</button>
      </div>
      <div className="input-affix" style={{ marginTop: 6 }}>
        <span className="affix">{currency}</span>
        <input
          className="input"
          type="text"
          inputMode="decimal"
          autoFocus
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <button className="btn btn-primary btn-sm" style={{ margin: 4 }} onClick={submit}>
          {confirmLabel}
        </button>
      </div>
      <button className="btn btn-ghost btn-sm btn-block mt8" onClick={onByColour}>
        🧮 {byColourLabel}
      </button>
    </div>
  );
}
