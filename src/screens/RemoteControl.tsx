import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { fmtMoney } from '../lib/money';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { togglePlayPause, goLevel, startBreak, cancelBreak, secondsLeft, initialClock } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';
import { IconPlay, IconPause, IconChevron, IconPlus, IconTrash } from '../components/Icons';

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The phone's remote, shown on the Table tab only while this phone is hosting a
 * Live Session. It is the single clock (never runs its own countdown — it derives
 * from the shared deadline and sends commands) plus a players & prize-pool editor.
 * Everything here writes to the shared session, so the TV mirrors it instantly.
 */
export default function RemoteControl() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { liveSessionCode, liveSessionRole, minutesPerLevel, currency } = state.settings;
  const { ledger, session } = state;
  const maxIdx = session.blindLevels.length - 1;

  const [clock, setClock] = useState<ClockState>(() => initialClock(minutesPerLevel));
  const [now, setNow] = useState(Date.now());

  const active = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;

  useEffect(() => {
    if (!active || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(liveSessionCode, (doc) => setClock(doc.clock));
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

  void now; // triggers the re-render each second so secondsLeft() below is fresh

  const pool = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);

  return (
    <>
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
            <button className="btn btn-ghost btn-sm" onClick={() => send(startBreak(clock))}>{t('tv.break')}</button>
          )}
        </div>
      </div>

      {/* Players & prize pool — editing here syncs straight to the TV */}
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.remotePlayers')}
        <span className="hint">{t('table.remotePlayersHint')}</span>
      </div>
      <div className="card">
        {ledger.length === 0 ? (
          <div className="empty" style={{ paddingBottom: 12 }}>{t('table.remotePlayersHint')}</div>
        ) : (
          <div className="remote-players">
            {ledger.map((p) => (
              <div className="remote-player-row" key={p.id}>
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
                <button className="icon-btn danger" style={{ width: 34, height: 34 }} onClick={() => dispatch({ type: 'LEDGER_REMOVE', id: p.id })} aria-label="Remove player">
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex-between mt12">
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'LEDGER_ADD' })}>
            <IconPlus size={16} /> {t('table.addPlayer')}
          </button>
          <div style={{ textAlign: 'right' }}>
            <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('table.poolTotal')}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--acc)' }}>{fmtMoney(pool, currency)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
