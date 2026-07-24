import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { togglePlayPause, goLevel, startBreak, cancelBreak, secondsLeft, initialClock } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';
import { IconPlay, IconPause, IconChevron } from '../components/Icons';

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Shown on the Table tab only while this phone is hosting a Live Session.
 * Sends clock commands to the shared Firestore doc — the TV (the clock
 * owner) picks them up instantly. This panel never runs its own countdown,
 * so it stays correct even if the phone is backgrounded or locked.
 */
export default function RemoteControl() {
  const { state } = useStore();
  const t = useT();
  const { liveSessionCode, liveSessionRole, minutesPerLevel } = state.settings;
  const maxIdx = state.session.blindLevels.length - 1;

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
    </>
  );
}
