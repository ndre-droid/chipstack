import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import Chip from '../components/Chip';
import { IconPlay, IconPause, IconChevron, IconReset } from '../components/Icons';
import { fmtMoney } from '../lib/money';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { secondsLeft as clockSecondsLeft } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';

const QUIPS = [
  'Blinds are going up — finish your beer, it’s the house rule now.',
  'The cards don’t know it’s your birthday.',
  'Scared money don’t make money. Broke money doesn’t either.',
  'If you can’t spot the fish in the first hour… it’s you.',
  'A chip and a chair. Also snacks. Bring snacks.',
  'Trust everyone, but always cut the cards.',
  'Tight is right — until someone shoves and proves it wrong.',
  'The river gives, the river takes, the river doesn’t care about your feelings.',
  'Slow-rolling is a personality disorder. Please seek help.',
  'Big stack energy: act like you’ve got it even when you don’t.',
  'Bad beat stories get shorter every time you retell them. Funny, that.',
  'Check-raising your best friend builds character. Yours, not theirs.',
  'The dealer button has seen things tonight it can never unsee.',
  'Somewhere, a guy is going all-in on ace-high. Respect the chaos.',
  'Your poker face needs work. Your actual face gave it away three hands ago.',
  '“I was pot-committed” has ended more friendships than it’s saved.',
  'Math says fold. Your gut says call. Your gut has been wrong all night.',
  'Nobody remembers the hands you won. Everyone remembers the ones you didn’t.',
];

const beep = (freq = 880, dur = 0.14, type: OscillatorType = 'sine') => {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ac.destination);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.start();
    o.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), (dur + 0.1) * 1000);
  } catch {
    /* audio not available */
  }
};
const chime = () => {
  beep(660, 0.16);
  setTimeout(() => beep(880, 0.16), 150);
  setTimeout(() => beep(1180, 0.28), 320);
};
const buzzer = () => beep(200, 0.5, 'square');

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function TvMode({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { blindLevels } = state.session;
  const { minutesPerLevel, currency, unitValue, skin, tvSkin, accents, tvQuips, tvBackground, liveSessionCode, liveSessionRole } = state.settings;
  const effTvSkin = (tvSkin ?? 'match') === 'match' ? skin ?? 'minimal' : (tvSkin as Exclude<typeof tvSkin, 'match'>);
  const tvAccent = accents?.[effTvSkin] ?? 'amber';
  const { playerCount, buyIn } = state.session;
  const denominations = state.denominations;
  const ledger = state.ledger;

  const connected = firebaseConfigured && liveSessionRole === 'tv' && !!liveSessionCode;

  const [levelIdx, setLevelIdx] = useState(0);
  const [seconds, setSeconds] = useState(minutesPerLevel * 60);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [spin, setSpin] = useState<{ name: string; done: boolean } | null>(null);
  const tick = useRef<number | null>(null);

  const [showJoin, setShowJoin] = useState(false);
  const [joinDigits, setJoinDigits] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  // subscribe to the shared session once connected; mirror data + clock locally.
  // The Firebase SDK is only dynamically imported once a code is actually joined.
  useEffect(() => {
    if (!connected || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(liveSessionCode, (doc) => {
        dispatch({
          type: 'LIVE_APPLY_REMOTE',
          denominations: doc.data.denominations,
          session: doc.data.session,
          ledger: doc.data.ledger,
          currency: doc.data.currency,
          unitValue: doc.data.unitValue,
        });
        setLevelIdx(doc.clock.levelIdx);
        setOnBreak(doc.clock.onBreak);
        setRunning(doc.clock.running);
        setSeconds(clockSecondsLeft(doc.clock));
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, liveSessionCode]);

  const pushClockIfConnected = (li: number, ob: boolean, run: boolean, secs: number) => {
    if (!connected || !liveSessionCode) return;
    const next: ClockState = {
      levelIdx: li,
      onBreak: ob,
      running: run,
      periodEndsAt: run ? Date.now() + secs * 1000 : null,
      remaining: secs,
      minutesPerLevel,
    };
    import('../lib/liveSession').then(({ pushClock }) =>
      pushClock(liveSessionCode, next).catch(() => {
        /* transient network error — the next control action will retry */
      }),
    );
  };

  const connectWithCode = async () => {
    if (joinDigits.length < 4) return;
    setJoinErr(null);
    setJoinBusy(true);
    try {
      const { checkCodeExists } = await import('../lib/liveSession');
      const exists = await checkCodeExists(joinDigits);
      if (!exists) {
        setJoinErr(t('tv.joinNotFound'));
        return;
      }
      dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: joinDigits, liveSessionRole: 'tv' } });
      setShowJoin(false);
      setJoinDigits('');
    } catch {
      setJoinErr(t('tv.joinNotFound'));
    } finally {
      setJoinBusy(false);
    }
  };
  const disconnectLive = () => dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: null, liveSessionRole: null } });

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];
  const currentSB = level?.smallBlind ?? 1;
  const currentBB = level?.bigBlind ?? 1;

  // keep screen awake while the TV is showing
  useEffect(() => {
    let lock: { release: () => void } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* not supported */
      }
    };
    req();
    return () => {
      try {
        lock?.release();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // main clock
  useEffect(() => {
    if (!running) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    tick.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s > 1) return s - 1;
        if (onBreak) {
          setOnBreak(false);
          chime();
          pushClockIfConnected(levelIdx, false, true, minutesPerLevel * 60);
          return minutesPerLevel * 60;
        }
        chime();
        try {
          navigator.vibrate?.([300, 120, 300]);
        } catch {
          /* ignore */
        }
        setFlash(true);
        setTimeout(() => setFlash(false), 3200);
        let nextIdx = levelIdx;
        let stillRunning = true;
        if (levelIdx + 1 < blindLevels.length) {
          nextIdx = levelIdx + 1;
          setLevelIdx(nextIdx);
        } else {
          stillRunning = false;
          setRunning(false);
        }
        pushClockIfConnected(nextIdx, false, stillRunning, minutesPerLevel * 60);
        return minutesPerLevel * 60;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, onBreak, blindLevels.length, minutesPerLevel, levelIdx, connected, liveSessionCode]);

  // rotate quips
  useEffect(() => {
    if (!tvQuips) return;
    const id = window.setInterval(() => setQuipIdx((i) => (i + 1) % QUIPS.length), 11000);
    return () => window.clearInterval(id);
  }, [tvQuips]);

  // shot clock
  useEffect(() => {
    if (shot === null) return;
    if (shot <= 0) {
      buzzer();
      const t = setTimeout(() => setShot(null), 1500);
      return () => clearTimeout(t);
    }
    const id = window.setTimeout(() => setShot((s) => (s ?? 0) - 1), 1000);
    if (shot <= 5) beep(720, 0.08);
    return () => window.clearTimeout(id);
  }, [shot]);

  const goLevel = (i: number) => {
    const c = Math.max(0, Math.min(blindLevels.length - 1, i));
    setLevelIdx(c);
    setSeconds(minutesPerLevel * 60);
    setOnBreak(false);
    pushClockIfConnected(c, false, running, minutesPerLevel * 60);
  };
  const takeBreak = () => {
    setOnBreak(true);
    setSeconds(5 * 60);
    setRunning(true);
    pushClockIfConnected(levelIdx, true, true, 5 * 60);
  };
  const cancelBreak = () => {
    setOnBreak(false);
    setSeconds(minutesPerLevel * 60);
    pushClockIfConnected(levelIdx, false, running, minutesPerLevel * 60);
  };
  const togglePlay = () => {
    setRunning((r) => {
      const nr = !r;
      pushClockIfConnected(levelIdx, onBreak, nr, seconds);
      return nr;
    });
  };
  const resetLevel = () => {
    const secs = (onBreak ? 5 : minutesPerLevel) * 60;
    setSeconds(secs);
    pushClockIfConnected(levelIdx, onBreak, running, secs);
  };

  const players = useMemo(
    () => (ledger.length ? ledger.map((p) => p.name || 'Player') : Array.from({ length: playerCount }, (_, i) => `Seat ${i + 1}`)),
    [ledger, playerCount],
  );
  const spinRound = () => {
    if (!players.length) return;
    let n = 0;
    const total = 18 + Math.floor(Math.random() * 8);
    const step = () => {
      setSpin({ name: players[n % players.length], done: false });
      beep(520, 0.04);
      n++;
      if (n < total) {
        setTimeout(step, 60 + n * 12);
      } else {
        const winner = players[Math.floor(Math.random() * players.length)];
        setSpin({ name: winner, done: true });
        chime();
        setTimeout(() => setSpin(null), 4500);
      }
    };
    step();
  };

  // standings
  const poolMoney = ledger.length ? ledger.reduce((s, p) => s + (p.buyIn || 0), 0) : playerCount * buyIn;
  const playersLeft = ledger.length ? Math.max(1, ledger.filter((p) => (p.cashOut || 0) === 0).length) : playerCount;
  const poolPoints = unitValue > 0 ? Math.round(poolMoney / unitValue) : 0;
  const avgStack = Math.round(poolPoints / playersLeft);
  const avgBB = currentBB > 0 ? Math.round(avgStack / currentBB) : 0;

  const legend = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0).sort((a, b) => a.value - b.value),
    [denominations],
  );
  const tooSmall = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0 && d.value < currentSB).sort((a, b) => a.value - b.value),
    [denominations, currentSB],
  );

  const pct = Math.max(0, Math.min(100, (seconds / ((onBreak ? 5 : minutesPerLevel) * 60)) * 100));

  return (
    <div
      className={`tv ${tvBackground ? 'has-bg' : ''}`}
      data-tv-skin={effTvSkin}
      data-tv-accent={tvAccent}
      style={tvBackground ? { backgroundImage: `url(${tvBackground})` } : undefined}
    >
      {tvBackground && <div className="tv-bg-scrim" />}

      {firebaseConfigured && (
        <button
          className={`tv-connect-pill ${connected ? 'live' : ''}`}
          onClick={() => (connected ? disconnectLive() : setShowJoin(true))}
        >
          {connected ? `● ${t('tv.liveConnected')}` : t('tv.joinConnect')}
        </button>
      )}

      {flash && (
        <div className="tv-flash">
          <div>{t('tv.blindsUp')}</div>
          <div className="tv-flash-sub">{level && `${level.smallBlind} / ${level.bigBlind}`}</div>
        </div>
      )}

      <div className="tv-grid">
        {/* left: standings + colour-up */}
        <aside className="tv-side">
          <div className="tv-stat">
            <span className="tv-stat-k">{t('tv.prizePool')}</span>
            <span className="tv-stat-v">{fmtMoney(poolMoney, currency)}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">{t('tv.playersLeft')}</span>
            <span className="tv-stat-v">{playersLeft}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">{t('tv.avgStack')}</span>
            <span className="tv-stat-v">{avgStack.toLocaleString()}<small> · {avgBB} BB</small></span>
          </div>
          {tooSmall.length > 0 && (
            <div className="tv-colorup">
              <span className="tv-colorup-h">{t('tv.colorUp')}</span>
              <span>{t('tv.colorUpDesc', { list: tooSmall.map((d) => d.value).join(', '), sb: currentSB })}</span>
            </div>
          )}
        </aside>

        {/* center: the clock */}
        <main className="tv-clock">
          <div className="tv-level">{onBreak ? t('tv.break') : t('tv.level', { n: levelIdx + 1 })}</div>
          <div className="tv-blinds">
            {onBreak ? t('tv.backSoon') : level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
            {!onBreak && level?.ante ? <span className="tv-ante"> · ante {level.ante}</span> : null}
          </div>
          <div className={`tv-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmtClock(seconds)}</div>
          <div className="tv-progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
          <div className="tv-next">{onBreak ? '' : next ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` }) : t('tv.finalLevel')}</div>
        </main>

        {/* right: chip legend */}
        <aside className="tv-side tv-legend">
          <div className="tv-legend-h">{t('tv.chipValues')}</div>
          {legend.map((d) => (
            <div className="tv-legend-row" key={d.id}>
              <Chip value={d.value} color={d.color} accent={d.accent} size={34} shape={d.shape} />
              <span className="tv-legend-v">{d.value}</span>
              <span className="tv-legend-m">{fmtMoney(d.value * unitValue, currency)}</span>
            </div>
          ))}
        </aside>
      </div>

      {/* quip ticker */}
      {tvQuips && <div className="tv-quip" key={quipIdx}>{QUIPS[quipIdx]}</div>}

      {/* controls (for the phone holding the session) */}
      <div className="tv-controls">
        <button onClick={() => goLevel(levelIdx - 1)} aria-label="Previous level"><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevron size={22} /></span></button>
        <button onClick={resetLevel} aria-label="Reset level"><IconReset size={20} /></button>
        <button className="tv-play" onClick={togglePlay}>{running ? <IconPause size={30} /> : <IconPlay size={30} />}</button>
        <button onClick={() => goLevel(levelIdx + 1)} aria-label="Next level"><IconChevron size={22} /></button>
        {onBreak ? (
          <button className="tv-txt tv-exit" onClick={cancelBreak}>{t('tv.cancelBreak')}</button>
        ) : (
          <button className="tv-txt" onClick={takeBreak}>{t('tv.break')}</button>
        )}
        <button className="tv-txt" onClick={() => setShot(30)}>{t('tv.shotClock')}</button>
        <button className="tv-txt" onClick={spinRound}>{t('tv.whoDrinks')}</button>
        <button className="tv-txt tv-exit" onClick={onClose}>{t('tv.exit')}</button>
      </div>

      {/* shot clock overlay */}
      {shot !== null && (
        <div className="tv-overlay" onClick={() => setShot(null)}>
          <div className="tv-overlay-label">{t('tv.shotClock')}</div>
          <div className={`tv-overlay-num ${shot <= 5 ? 'urgent' : ''}`}>{Math.max(0, shot)}</div>
          <div className="tv-overlay-hint">{t('tv.tapToDismiss')}</div>
        </div>
      )}

      {/* who-buys spinner overlay */}
      {spin && (
        <div className="tv-overlay">
          <div className="tv-overlay-label">{t('tv.whoDrinksNext')}</div>
          <div className={`tv-overlay-name ${spin.done ? 'won' : ''}`}>{spin.name}</div>
          {spin.done && <div className="tv-overlay-hint">🍻 {t('tv.youreUp')}</div>}
        </div>
      )}

      {/* join-a-live-session overlay */}
      {showJoin && (
        <div className="tv-overlay">
          <div className="tv-overlay-label">{t('tv.joinTitle')}</div>
          <p className="tv-join-hint">{t('tv.joinHint')}</p>
          <div className="tv-join-display">{joinDigits.padEnd(6, '·')}</div>
          {joinErr && <div className="tv-join-error">{joinErr}</div>}
          <div className="tv-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => (
              <button
                key={k}
                className={`tv-key ${k === 'OK' ? 'ok' : ''} ${k === '⌫' ? 'del' : ''}`}
                disabled={joinBusy}
                onClick={() => {
                  if (k === '⌫') setJoinDigits((d) => d.slice(0, -1));
                  else if (k === 'OK') connectWithCode();
                  else if (joinDigits.length < 6) setJoinDigits((d) => d + k);
                }}
              >
                {joinBusy && k === 'OK' ? '…' : k}
              </button>
            ))}
          </div>
          <button className="tv-txt" style={{ marginTop: 18 }} onClick={() => { setShowJoin(false); setJoinDigits(''); setJoinErr(null); }}>
            {t('tv.skipJoin')}
          </button>
        </div>
      )}
    </div>
  );
}
