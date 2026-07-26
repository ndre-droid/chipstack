import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { togglePlayPause, goLevel, startBreak, cancelBreak, secondsLeft, initialClock, setMinutesPerLevel } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';
import { IconPlay, IconPause, IconChevron, IconPlus, IconTrash } from '../components/Icons';

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The phone's remote, shown on the Table tab only while this phone is hosting a
 * Live Session. It drives the live game: the clock, level length, blinds and the
 * players & pool (rebuys, bust / cash-out) — everything writes to the shared session
 * so the TV mirrors it instantly. The TV's look (design, extras, quips) lives in the
 * separate TV broadcast card. This panel never runs its own countdown; it derives
 * from the shared deadline and sends commands.
 */
export default function RemoteControl() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { liveSessionCode, liveSessionRole, minutesPerLevel, currency, breakMinutes, breakEvery, gameMode, cashUseTimer } = state.settings;
  const { ledger, session } = state;
  const isCash = gameMode === 'cash';
  const showTimer = !isCash || cashUseTimer; // cash + no timer = no clock/break/blinds
  const maxIdx = session.blindLevels.length - 1;

  const [clock, setClock] = useState<ClockState>(() => initialClock(minutesPerLevel));
  const [now, setNow] = useState(Date.now());
  const [showBlinds, setShowBlinds] = useState(false);
  const [cashOutId, setCashOutId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const syncTimer = useRef<number | null>(null);

  const active = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;

  useEffect(() => {
    if (!active || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      // The TV owns the clock; a doc may briefly exist with data but no clock
      // (e.g. a stale/dead code). Never overwrite our valid clock with undefined.
      unsub = subscribeSession(liveSessionCode, (doc) => {
        if (doc.clock) setClock(doc.clock);
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [active, liveSessionCode]);

  // local 1s tick purely to refresh the displayed countdown — never writes state
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active || !liveSessionCode) return null;

  const send = (next: ClockState) => {
    setClock(next); // optimistic
    import('../lib/liveSession').then(({ pushClock }) =>
      pushClock(liveSessionCode, next).catch(() => {
        /* the next command or the TV's own tick will reconcile */
      }),
    );
  };

  // Force-push the full data to the TV right now. Changes normally sync
  // automatically (useLiveHostSync), but if a write was dropped while the TV
  // briefly disconnected, this re-sends everything so the phone can recover
  // without reloading (which isn't possible inside the installed app).
  const resync = () => {
    if (!liveSessionCode) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    setSyncState('sending');
    import('../lib/liveSession')
      .then(({ hostPushData }) => hostPushData(liveSessionCode, state))
      .then(() => {
        setSyncState('sent');
        syncTimer.current = window.setTimeout(() => setSyncState('idle'), 2000);
      })
      .catch(() => {
        setSyncState('error');
        syncTimer.current = window.setTimeout(() => setSyncState('idle'), 3500);
      });
  };
  useEffect(() => () => { if (syncTimer.current) window.clearTimeout(syncTimer.current); }, []);

  const setMinutes = (m: number) => {
    const n = Math.max(1, Math.min(180, m));
    dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: n } });
    send(setMinutesPerLevel(clock, n)); // reflect on the TV's current level immediately
  };

  void now; // triggers the re-render each second so secondsLeft() below is fresh

  // Cash game: money on the table = buy-ins − cash-outs. Tournament: the fixed pool.
  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const pool = isCash ? Math.max(0, totalIn - totalOut) : totalIn;

  return (
    <>
      {showTimer && (
      <>
      {/* --- Clock --- */}
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.remoteControl')}
        <span className="hint">{t('table.remoteHint')}</span>
      </div>
      <div className="card clock-card">
        <div className="clock-face">
          <div className="clock-level">{clock.onBreak ? t('tv.break') : t('table.remoteLevel', { n: clock.levelIdx + 1 })}</div>
          <div className={`clock-time ${clock.running && secondsLeft(clock) <= 30 ? 'urgent' : ''}`}>{fmtClock(secondsLeft(clock))}</div>
        </div>
        <div className="clock-controls">
          <button className="icon-btn" onClick={() => send(goLevel(clock, -1, maxIdx))} aria-label="Previous level">
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
              <IconChevron size={20} />
            </span>
          </button>
          <button className="clock-play" onClick={() => send(togglePlayPause(clock))}>
            {clock.running ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button className="icon-btn" onClick={() => send(goLevel(clock, 1, maxIdx))} aria-label="Next level">
            <IconChevron size={20} />
          </button>
          {clock.onBreak ? (
            <button className="btn btn-ghost btn-sm" onClick={() => send(cancelBreak(clock))}>{t('tv.cancelBreak')}</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => send(startBreak(clock, breakMinutes))}>{t('tv.break')}</button>
          )}
        </div>

        {/* Level length — fully adjustable from the phone */}
        <div className="clock-adjust">
          <button className="adj10" onClick={() => setMinutes(minutesPerLevel - 10)}>−10</button>
          <button className="adj1" onClick={() => setMinutes(minutesPerLevel - 1)}>−1</button>
          <div className="mpl-center">
            <b>{minutesPerLevel}</b>
            <small>{t('table.minPerLevel')}</small>
          </div>
          <button className="adj1" onClick={() => setMinutes(minutesPerLevel + 1)}>+1</button>
          <button className="adj10" onClick={() => setMinutes(minutesPerLevel + 10)}>+10</button>
        </div>

        {/* one-tap timer presets */}
        <div className="chip-toggle-row" style={{ marginTop: 10, justifyContent: 'center' }}>
          {[
            { label: t('table.turbo'), m: 10 },
            { label: t('table.standard'), m: 20 },
            { label: t('table.deep'), m: 30 },
          ].map((p) => (
            <button key={p.m} className={`chip-toggle ${minutesPerLevel === p.m ? '' : 'off'}`} onClick={() => setMinutes(p.m)}>
              {p.label} · {p.m}
            </button>
          ))}
        </div>
      </div>

      {/* --- Break --- */}
      <div className="card">
        <div className="row">
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.breakLength')}</div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakMinutes: Math.max(1, breakMinutes - 1) } })}>−</button>
            <span className="val">{breakMinutes}</span>
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakMinutes: breakMinutes + 1 } })}>+</button>
          </div>
        </div>
        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.breakEvery')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{breakEvery === 0 ? t('table.breakEveryOff') : t('table.breakEveryOn', { n: breakEvery })}</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakEvery: Math.max(0, breakEvery - 1) } })}>−</button>
            <span className="val">{breakEvery === 0 ? t('table.off') : breakEvery}</span>
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakEvery: breakEvery + 1 } })}>+</button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* --- Blinds --- */}
      <button className="section-label collapsible-head" onClick={() => setShowBlinds((v) => !v)}>
        {t('table.blinds')}
        <span className="hint">{t('table.blindsHint')}</span>
        <span className={`chevron ${showBlinds ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {showBlinds && (
        <div className="card">
          {session.blindLevels.map((b, i) => (
            <div className={`blind-row ${i === clock.levelIdx ? 'start' : ''}`} key={b.id} style={{ cursor: 'default' }}>
              <div className="lvl-badge">{i + 1}</div>
              <div className="blind-inputs">
                <input
                  className="mini-input"
                  type="number"
                  inputMode="numeric"
                  value={b.smallBlind || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { smallBlind: Math.max(0, +e.target.value) } })}
                />
                <span className="x">/</span>
                <input
                  className="mini-input"
                  type="number"
                  inputMode="numeric"
                  value={b.bigBlind || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { bigBlind: Math.max(0, +e.target.value) } })}
                />
                {i === clock.levelIdx && <span className="badge-soft" style={{ marginLeft: 6 }}>{t('table.now')}</span>}
              </div>
              <button
                className="icon-btn danger"
                style={{ width: 32, height: 32 }}
                onClick={() => dispatch({ type: 'REMOVE_BLIND', id: b.id })}
                aria-label="Remove level"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm mt8" onClick={() => dispatch({ type: 'ADD_BLIND' })}>
            <IconPlus size={16} /> {t('table.addLevel')}
          </button>
        </div>
      )}

      {/* --- Players & prize pool --- */}
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.remotePlayers')}
        <span className="hint">{t('table.remotePlayersHint')}</span>
      </div>
      <div className="card">
        <div className="resync-row">
          <div className="faint" style={{ fontSize: 12, flex: 1 }}>{t('table.buyInNote')}</div>
          <button
            className={`btn btn-sm ${syncState === 'error' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={resync}
            disabled={syncState === 'sending'}
          >
            {syncState === 'sending'
              ? t('table.sending')
              : syncState === 'sent'
                ? t('table.sent')
                : syncState === 'error'
                  ? t('table.syncError')
                  : t('table.sendToTv')}
          </button>
        </div>
        <div className="faint" style={{ fontSize: 11, margin: '2px 0 10px' }}>{t('table.syncHint')}</div>
        {ledger.length === 0 ? (
          <div className="empty" style={{ paddingBottom: 12 }}>{t('table.remotePlayersHint')}</div>
        ) : (
          <div className="remote-players">
            {ledger.map((p) => (
              <div className={`remote-player ${p.out ? 'out' : ''}`} key={p.id}>
                <div className="remote-player-top">
                  <input
                    className="ledger-name"
                    value={p.name}
                    placeholder="Player"
                    onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
                  />
                  <div className="input-affix remote-buyin">
                    <span className="affix">{currency}</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      value={p.buyIn || ''}
                      onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: Math.max(0, +e.target.value) } })}
                    />
                  </div>
                </div>
                <div className="remote-player-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: (p.buyIn || 0) + session.buyIn } })}
                  >
                    <IconPlus size={14} /> {t('table.rebuy')} {money(session.buyIn, currency)}
                  </button>
                  {isCash ? (
                    (p.cashOut || 0) > 0 ? (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { cashOut: 0, out: false, outAt: undefined } })}
                      >
                        {t('table.backIn')}
                      </button>
                    ) : (
                      <button
                        className={`btn btn-sm ${cashOutId === p.id ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setCashOutId(cashOutId === p.id ? null : p.id)}
                      >
                        {t('table.cashOut')}
                      </button>
                    )
                  ) : (
                    <button
                      className={`btn btn-sm ${p.out ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { out: !p.out, outAt: !p.out ? Date.now() : undefined } })}
                    >
                      {p.out ? t('table.backIn') : t('table.markOut')}
                    </button>
                  )}
                  <div className="spacer" />
                  <button className="icon-btn danger" style={{ width: 34, height: 34 }} onClick={() => dispatch({ type: 'LEDGER_REMOVE', id: p.id })} aria-label="Remove player">
                    <IconTrash size={15} />
                  </button>
                </div>
                {isCash && cashOutId === p.id && (
                  <div className="remote-cashout">
                    <div className="faint" style={{ fontSize: 12 }}>{t('table.cashOutPrompt', { name: p.name || 'Player' })}</div>
                    <div className="input-affix" style={{ marginTop: 6 }}>
                      <span className="affix">{currency}</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        autoFocus
                        defaultValue={p.buyIn || ''}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = Math.max(0, +(e.target as HTMLInputElement).value);
                            dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { cashOut: v, out: true, outAt: Date.now() } });
                            setCashOutId(null);
                          }
                        }}
                        id={`cashout-${p.id}`}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ margin: 4 }}
                        onClick={() => {
                          const el = document.getElementById(`cashout-${p.id}`) as HTMLInputElement | null;
                          const v = Math.max(0, +(el?.value ?? 0));
                          dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { cashOut: v, out: true, outAt: Date.now() } });
                          setCashOutId(null);
                        }}
                      >
                        {t('table.cashOut')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex-between mt12">
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'LEDGER_ADD' })}>
            <IconPlus size={16} /> {t('table.addPlayer')}
          </button>
          <div style={{ textAlign: 'right' }}>
            <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isCash ? t('table.onTablePool') : t('table.poolTotal')}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--acc)' }}>{money(pool, currency)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
