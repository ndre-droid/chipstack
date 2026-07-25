import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store';
import Chip from '../components/Chip';
import { IconPlay, IconPause, IconChevron, IconReset } from '../components/Icons';
import { useT, useFmt } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { secondsLeft as clockSecondsLeft, initialClock } from '../lib/clockLogic';
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
  const { money, num } = useFmt();
  const { blindLevels } = state.session;
  const { minutesPerLevel, currency, unitValue, skin, tvSkin, accents, tvQuips, tvCustomQuips, tvShowPlayers, tvShowPayouts, tvShowBustOrder, breakMinutes, breakEvery, tvBackground, tvBackgroundFocus, tvBackgroundTone, deviceIsTv, liveSessionCode, liveSessionRole } = state.settings;
  const breakMins = breakMinutes ?? 5;
  // per-photo smart placement: crop toward the subject, keep it clear, and nudge the
  // clock to the calm side; brighter photos get a stronger scrim so text stays legible.
  const focus = tvBackgroundFocus ?? { x: 50, y: 50 };
  const scrim = tvBackgroundTone == null ? 0.5 : Math.max(0.32, Math.min(0.74, 0.3 + tvBackgroundTone * 0.5));
  const focusV = focus.y < 42 ? 'top' : focus.y > 58 ? 'bottom' : 'mid'; // where the subject sits vertically
  const effTvSkin = (tvSkin ?? 'match') === 'match' ? skin ?? 'minimal' : (tvSkin as Exclude<typeof tvSkin, 'match'>);
  const tvAccent = accents?.[effTvSkin] ?? 'amber';
  const { playerCount, buyIn } = state.session;
  const denominations = state.denominations;
  const ledger = state.ledger;

  // Role model:
  //  - isTv:       this device shows a pairing code, owns the clock, mirrors the
  //                phone's data once a phone connects (data present in the doc).
  //  - isHostView: a controlling phone previewing its TV — read-only mirror.
  //  - standalone: no live session — runs entirely on its own local data/clock.
  const isTv = firebaseConfigured && liveSessionRole === 'tv' && !!liveSessionCode;
  const isHostView = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;
  const synced = isTv || isHostView;
  const ownsClockAdvance = liveSessionRole !== 'host'; // TV + standalone auto-advance; host preview mirrors

  const [levelIdx, setLevelIdx] = useState(0);
  const [seconds, setSeconds] = useState(minutesPerLevel * 60);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [spin, setSpin] = useState<{ name: string; done: boolean } | null>(null);
  const [paired, setPaired] = useState(false); // a phone has connected (doc has data)
  const [connectToast, setConnectToast] = useState(false); // brief "phone connected" cue
  const prevPaired = useRef(false);
  const tick = useRef<number | null>(null);

  // This device is the TV: make sure a pairing code/doc exists and claim the 'tv'
  // role. Reuses the persisted code across reloads so it stays stable on screen.
  useEffect(() => {
    if (!firebaseConfigured || !deviceIsTv) return;
    let cancelled = false;
    import('../lib/liveSession')
      .then(({ tvEnsurePairing }) =>
        tvEnsurePairing(liveSessionRole === 'tv' ? liveSessionCode : null, initialClock(minutesPerLevel)),
      )
      .then((code) => {
        if (cancelled) return;
        if (liveSessionRole !== 'tv' || liveSessionCode !== code) {
          dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'tv' } });
        }
      })
      .catch(() => {
        /* offline or transient — retried on next mount */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIsTv]);

  // Subscribe to the shared session: mirror the clock always, and (as the TV)
  // apply the phone's data once it connects. Firebase is only imported here.
  useEffect(() => {
    if (!synced || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(liveSessionCode, (doc) => {
        if (isTv && doc.data) {
          setPaired(true);
          dispatch({
            type: 'LIVE_APPLY_REMOTE',
            denominations: doc.data.denominations,
            session: doc.data.session,
            ledger: doc.data.ledger,
            currency: doc.data.currency,
            unitValue: doc.data.unitValue,
            tvBackground: doc.data.tvBackground ?? null,
            tvBackgroundFocus: doc.data.tvBackgroundFocus ?? null,
            tvBackgroundTone: doc.data.tvBackgroundTone ?? null,
            minutesPerLevel: doc.data.minutesPerLevel,
            skin: doc.data.skin,
            tvSkin: doc.data.tvSkin,
            accents: doc.data.accents,
            tvQuips: doc.data.tvQuips,
            tvCustomQuips: doc.data.tvCustomQuips,
            tvShowPlayers: doc.data.tvShowPlayers,
            tvShowPayouts: doc.data.tvShowPayouts,
            tvShowBustOrder: doc.data.tvShowBustOrder,
            breakMinutes: doc.data.breakMinutes,
            breakEvery: doc.data.breakEvery,
            language: doc.data.language,
          });
        } else if (isTv) {
          setPaired(false);
        }
        // guard: a doc can exist with data but no clock (stale/dead code)
        if (doc.clock) {
          setLevelIdx(doc.clock.levelIdx);
          setOnBreak(doc.clock.onBreak);
          setRunning(doc.clock.running);
          setSeconds(clockSecondsLeft(doc.clock));
        }
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, liveSessionCode, liveSessionRole]);

  const pushClockIfConnected = (li: number, ob: boolean, run: boolean, secs: number) => {
    if (!synced || !liveSessionCode) return;
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

  // Standalone → become the designated TV: App will re-mount this fullscreen and
  // the pairing effect above claims a code.
  const useAsTv = () => dispatch({ type: 'UPDATE_SETTINGS', patch: { deviceIsTv: true } });

  // Deep-link QR: opening this URL on a phone loads the app and auto-connects as
  // host to this code (App reads `?tv=`), so the phone can pair by scanning too.
  const pairQr = useMemo(() => {
    if (!liveSessionCode) return null;
    try {
      const url = `${window.location.origin}${window.location.pathname}?tv=${liveSessionCode}`;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(6, 12);
    } catch {
      return null;
    }
  }, [liveSessionCode]);

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];
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
        // host preview never auto-advances — the TV owns that and pushes it here
        if (!ownsClockAdvance) return 0;
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
        // auto-break: take a break after every N levels of play
        if (stillRunning && breakEvery > 0 && (levelIdx + 1) % breakEvery === 0) {
          setOnBreak(true);
          pushClockIfConnected(nextIdx, true, true, breakMins * 60);
          return breakMins * 60;
        }
        pushClockIfConnected(nextIdx, false, stillRunning, minutesPerLevel * 60);
        return minutesPerLevel * 60;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, onBreak, blindLevels.length, minutesPerLevel, levelIdx, synced, liveSessionCode, liveSessionRole, ownsClockAdvance, breakEvery, breakMins]);

  // flash a "phone connected" cue on the big screen the moment a phone pairs
  useEffect(() => {
    if (paired && !prevPaired.current) {
      setConnectToast(true);
      const id = window.setTimeout(() => setConnectToast(false), 4000);
      prevPaired.current = true;
      return () => window.clearTimeout(id);
    }
    if (!paired) prevPaired.current = false;
  }, [paired]);

  // the rotation = the user's own sayings first, then the built-ins
  const quips = useMemo(() => {
    const custom = (tvCustomQuips ?? []).map((q) => q.trim()).filter(Boolean);
    return [...custom, ...QUIPS];
  }, [tvCustomQuips]);

  // rotate quips
  useEffect(() => {
    if (!tvQuips) return;
    const id = window.setInterval(() => setQuipIdx((i) => (i + 1) % quips.length), 11000);
    return () => window.clearInterval(id);
  }, [tvQuips, quips.length]);

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
    setSeconds(breakMins * 60);
    setRunning(true);
    pushClockIfConnected(levelIdx, true, true, breakMins * 60);
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
    const secs = (onBreak ? breakMins : minutesPerLevel) * 60;
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
  const playersLeft = ledger.length ? Math.max(1, ledger.filter((p) => !p.out && (p.cashOut || 0) === 0).length) : playerCount;
  const poolPoints = unitValue > 0 ? Math.round(poolMoney / unitValue) : 0;
  const avgStack = Math.round(poolPoints / playersLeft);
  const avgBB = currentBB > 0 ? Math.round(avgStack / currentBB) : 0;

  const legend = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0).sort((a, b) => a.value - b.value),
    [denominations],
  );
  // roster shown on the TV — names + amounts, live from the host's ledger
  const roster = useMemo(
    () =>
      ledger.length
        ? ledger.map((p) => ({ id: p.id, name: p.name || 'Player', amount: p.buyIn || 0, out: !!p.out || (p.cashOut || 0) > 0 }))
        : Array.from({ length: playerCount }, (_, i) => ({ id: String(i), name: `Seat ${i + 1}`, amount: buyIn, out: false })),
    [ledger, playerCount, buyIn],
  );

  // prize-pool payout split (auto structure by entrant count)
  const payouts = useMemo(() => {
    const entrants = ledger.length || playerCount;
    const pct =
      entrants <= 3 ? [1] : entrants <= 5 ? [0.65, 0.35] : entrants <= 8 ? [0.5, 0.3, 0.2] : [0.45, 0.27, 0.18, 0.1];
    const places = ['1st', '2nd', '3rd', '4th'];
    return pct.map((p, i) => ({ place: places[i], amount: Math.round(poolMoney * p) }));
  }, [ledger.length, playerCount, poolMoney]);

  // knocked-out / finish order — later busts finish higher
  const bustOrder = useMemo(() => {
    const entrants = ledger.length;
    const outs = ledger
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.out)
      .sort((a, b) => (a.p.outAt ?? a.i) - (b.p.outAt ?? b.i)); // first bust first
    // place = entrants - bustIndex; show newest bust (best place) first
    return outs
      .map((x, idx) => ({ id: x.p.id, name: x.p.name || 'Player', place: entrants - idx }))
      .reverse();
  }, [ledger]);

  // "next break in N levels" cue
  const levelsToBreak = breakEvery > 0 ? (breakEvery - ((levelIdx + 1) % breakEvery)) % breakEvery : -1;

  const pct = Math.max(0, Math.min(100, (seconds / ((onBreak ? breakMins : minutesPerLevel) * 60)) * 100));

  return (
    <div
      className={`tv ${tvBackground ? 'has-bg' : ''}`}
      data-tv-skin={effTvSkin}
      data-tv-accent={tvAccent}
      data-tv-focus-v={tvBackground ? focusV : undefined}
      style={
        tvBackground
          ? ({
              backgroundImage: `url(${tvBackground})`,
              backgroundPosition: `${focus.x}% ${focus.y}%`,
              ['--tv-focus-x' as string]: `${focus.x}%`,
              ['--tv-focus-y' as string]: `${focus.y}%`,
              ['--tv-scrim' as string]: scrim,
            } as CSSProperties)
          : undefined
      }
    >
      {tvBackground && <div className="tv-bg-scrim" />}

      {/* Corner status pill */}
      {firebaseConfigured && isTv && (
        <div className={`tv-connect-pill ${paired ? 'live' : ''}`}>
          {paired ? `● ${t('tv.liveConnected')}` : `${t('connect.code')} ${liveSessionCode}`}
        </div>
      )}
      {firebaseConfigured && isHostView && <div className="tv-connect-pill live">● {t('tv.liveConnected')}</div>}
      {connectToast && <div className="tv-toast">📱 {t('tv.phoneConnected')}</div>}
      {/* Standalone: offer to make this device the permanent TV */}
      {firebaseConfigured && !deviceIsTv && !synced && (
        <button className="tv-connect-pill use-tv" onClick={useAsTv}>📺 {t('tv.useAsTv')}</button>
      )}

      {/* This device is the TV, waiting for a phone — show the code to type on the phone */}
      {firebaseConfigured && isTv && !paired && liveSessionCode && (
        <div className="tv-pair">
          <div className="tv-pair-lead">
            <div className="tv-pair-title">{t('tv.controlFromPhone')}</div>
            <div className="tv-pair-sub">{t('tv.enterOnPhone')}</div>
          </div>
          <div className="tv-pair-code">
            {liveSessionCode.split('').map((c, i) => (
              <span className="tv-pair-digit" key={i}>{c}</span>
            ))}
          </div>
          {pairQr && (
            <div className="tv-pair-qr">
              <img src={pairQr} alt="" />
              <span>{t('tv.scanToConnect')}</span>
            </div>
          )}
        </div>
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
            <span className="tv-stat-v">{money(poolMoney, currency)}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">{t('tv.playersLeft')}</span>
            <span className="tv-stat-v">{playersLeft}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">{t('tv.avgStack')}</span>
            <span className="tv-stat-v">{num(avgStack)}<small> · {avgBB} BB</small></span>
          </div>
          {tvShowPayouts && payouts.length > 0 && poolMoney > 0 && (
            <div className="tv-players">
              <div className="tv-players-h">{t('tv.payouts')}</div>
              <div className="tv-players-list">
                {payouts.map((p) => (
                  <div className="tv-players-row" key={p.place}>
                    <span className="tv-players-name">{p.place}</span>
                    <span className="tv-players-amt">{money(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tvShowPlayers && roster.length > 0 && (
            <div className="tv-players">
              <div className="tv-players-h">
                <span>{t('tv.players')}</span>
                <span className="tv-players-h-sub">{t('tv.buyIn')}</span>
              </div>
              <div className="tv-players-list">
                {roster.map((p) => (
                  <div className={`tv-players-row ${p.out ? 'out' : ''}`} key={p.id}>
                    <span className="tv-players-name">{p.name}</span>
                    <span className="tv-players-amt">{money(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tvShowBustOrder && bustOrder.length > 0 && (
            <div className="tv-players">
              <div className="tv-players-h">{t('tv.knockedOut')}</div>
              <div className="tv-players-list">
                {bustOrder.map((p) => (
                  <div className="tv-players-row" key={p.id}>
                    <span className="tv-players-amt" style={{ marginLeft: 0, minWidth: '2.4em' }}>{p.place}.</span>
                    <span className="tv-players-name">{p.name}</span>
                  </div>
                ))}
              </div>
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
          {!onBreak && breakEvery > 0 && (
            <div className="tv-break-cue">
              {levelsToBreak === 0 ? t('tv.breakAfter') : t('tv.breakIn', { n: levelsToBreak })}
            </div>
          )}
        </main>

        {/* right: chip legend */}
        <aside className="tv-side tv-legend">
          <div className="tv-legend-h">{t('tv.chipValues')}</div>
          {legend.map((d) => (
            <div className="tv-legend-row" key={d.id}>
              <Chip value={d.value} color={d.color} accent={d.accent} size={34} shape={d.shape} />
              <span className="tv-legend-v">{d.value}</span>
              <span className="tv-legend-m">{money(d.value * unitValue, currency)}</span>
            </div>
          ))}
        </aside>
      </div>

      {/* quip ticker */}
      {tvQuips && quips.length > 0 && <div className="tv-quip" key={quipIdx}>{quips[quipIdx % quips.length]}</div>}

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
        <button className="tv-txt tv-exit" onClick={onClose}>{deviceIsTv ? t('tv.exitTv') : t('tv.exit')}</button>
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
    </div>
  );
}
