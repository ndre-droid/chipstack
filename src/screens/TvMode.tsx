import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store';
import Chip from '../components/Chip';
import ChipStackViz from '../components/ChipStackViz';
import { IconPlay, IconPause, IconChevron, IconReset } from '../components/Icons';
import { useT, useFmt } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { secondsLeft as clockSecondsLeft, initialClock } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';
import { queueClock } from '../lib/liveSyncQueue';
import { getLocalClock, setLocalClock } from '../lib/localClock';
import { startingStackOf } from '../lib/startingStack';
import { autoTvScale, clampTvScale, TV_SCALE_MIN, TV_SCALE_MAX, TV_SCALE_STEP } from '../lib/tvScale';
import { colorUpEvents } from '../lib/planning';
import { payoutsFor } from '../lib/payouts';
import { lateRegState } from '../lib/lateReg';
import type { MomentVotes } from '../lib/liveSession';
import { customAccentVars } from '../lib/color';
import Sparkline from '../components/Sparkline';
import { useWakeLock } from '../lib/useWakeLock';

const PENALTIES = [
  'downs a shot', 'buys the next round', 'shuffles for a whole level',
  'tells a bad-beat story — the SHORT version', 'deals the next orbit',
  'refills everyone’s snacks', 'no phone until the next break',
];
const HOUSE_RULES = [
  'Splashing the pot = you deal the next round.',
  'Verbal is binding. Say it, you did it.',
  'Angle-shooting? Straight to the penalty spinner.',
  'Whoever’s shortest stack picks the next music.',
  'String bet = fold. No mercy.',
  'Winner of the biggest pot so far cuts the deck.',
];

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

// The app is intentionally SILENT: on the TV, any sound the browser makes hijacks
// the user's Sonos (the TV grabs the speaker group from their phone). So all cues
// are visual (flash / overlays) + haptic (navigator.vibrate) — never audio.

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Split a ticking number into fixed-advance digit cells (see `.tv-d`). The skinned
 * faces are not all tabular — the casino serif is proportional — so without this the
 * centred clock jumps sideways on every tick.
 */
const digitCells = (text: string) =>
  [...text].map((c, i) =>
    c >= '0' && c <= '9'
      ? <i className="tv-d" key={i}>{c}</i>
      : <i className="tv-d-sep" key={i}>{c}</i>,
  );

/** Smallest roster row still worth reading across a room; matches the CSS clamp. */
const ROW_MIN_FS = 11;

export default function TvMode({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { blindLevels } = state.session;
  const { minutesPerLevel, currency, unitValue, skin, tvSkin, accents, tvQuips, tvCustomQuips, tvShowPlayers, tvRosterSort, tvShowPayouts, tvShowBustOrder, breakMinutes, breakEvery, tvBackground, tvBackgroundFocus, tvBackgroundTone, deviceIsTv, liveSessionCode, liveSessionRole, gameMode, cashUseTimer, tvShowStartStack, bountyMode, bountyAmount, customAccent, tvPenalties, tvHouseRules, showTrend } = state.settings;

  /* Display size. Per-device and deliberately NOT part of LiveData: the laptop
     acting as the big screen needs its own zoom, and a phone must not shrink it.
     `null` = never set on this device, so pick a starting point from the device
     itself (a real TV browser keeps 1). */
  const tvScale = state.settings.tvScale ?? autoTvScale();
  const setTvScale = (n: number) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { tvScale: clampTvScale(n) } });

  /* How tall the layout canvas actually is once the zoom is applied. Below the
     threshold the side panels can't all stand full height, so the stat tiles go
     two-up instead of squeezing the players roster out. A media query can't see
     this — it would only see the untouched viewport. */
  const [viewportH, setViewportH] = useState(typeof window === 'undefined' ? 1080 : window.innerHeight);
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const tvCompact = viewportH / tvScale < 860;
  const isCash = gameMode === 'cash';
  // Cash game with the timer off = no countdown. There's still a ladder, though:
  // a cash table raises the blinds when it feels like it, not on a clock, so the
  // big screen gets a manual stepper instead of a timer. Nothing to step through
  // with a single level, so the stepper stays hidden then.
  const showTimer = !isCash || cashUseTimer;
  const manualBlinds = !showTimer && state.session.blindLevels.length > 1;
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
  const counting = state.counting;
  // age of the newest counting round — the break banner nudges when it goes stale
  const lastCountAt = ledger.reduce<number | null>((newest, p) => {
    const last = p.chipHistory?.[p.chipHistory.length - 1]?.at;
    return last && (newest === null || last > newest) ? last : newest;
  }, null);
  const countedMinsAgo = lastCountAt === null ? null : Math.floor((Date.now() - lastCountAt) / 60000);
  const countStale = ledger.length > 0 && (countedMinsAgo === null || countedMinsAgo >= 25);

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
  /* The period's wall-clock deadline (epoch ms) while it runs, null while paused.
     THIS is the countdown's truth — `seconds` is only what was last painted from
     it. Counting ticks instead loses whatever a throttled timer doesn't deliver,
     and a laptop or TV browser with the tab in the background delivers roughly one
     tick a minute; the big screen then quietly runs minutes behind the table. */
  const deadline = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [spin, setSpin] = useState<{ name: string; done: boolean; penalty?: string } | null>(null);
  const [paired, setPaired] = useState(false); // a phone has connected (doc has data)
  const [liveLost, setLiveLost] = useState(false); // the session listener dropped and is re-opening
  const [connectToast, setConnectToast] = useState(false); // brief "phone connected" cue
  /* When the host phone last said anything. Android silently discards a
     backgrounded tab, and the big screen then kept showing a frozen table as if it
     were current — this is what lets it admit the phone is gone. Null means the
     phone has never sent one (an older build), and then nothing is claimed. */
  const [hostSeenLocal, setHostSeenLocal] = useState<number | null>(null);
  const hostSeenServer = useRef<number | null>(null);
  const [staleTick, setStaleTick] = useState(0);
  const prevPaired = useRef(false);
  const tick = useRef<number | null>(null);
  /* Bumped when the session document disappears, to make the pairing effect below
     run again and put it back. */
  const [pairSeq, setPairSeq] = useState(0);
  /* The clock exactly as it stands, for the effects that must not depend on it.
     Re-advertising mid-game has to restore THIS, not a fresh level 1. */
  const clockRef = useRef<ClockState>(initialClock(minutesPerLevel));

  // This device is the TV: make sure a pairing code/doc exists and claim the 'tv'
  // role. Reuses the persisted code across reloads so it stays stable on screen.
  useEffect(() => {
    if (!firebaseConfigured || !deviceIsTv) return;
    let cancelled = false;
    import('../lib/liveSession')
      .then(({ tvEnsurePairing }) =>
        tvEnsurePairing(liveSessionRole === 'tv' ? liveSessionCode : null, clockRef.current),
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
    // `pairSeq` is what re-runs this after the document was swept or deleted — the
    // code is reused, so the same four digits stay on the wall
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIsTv, pairSeq]);

  // Subscribe to the shared session: mirror the clock always, and (as the TV)
  // apply the phone's data once it connects. Firebase is only imported here.
  useEffect(() => {
    if (!synced || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(
        liveSessionCode,
        (doc) => {
          if (isTv && doc.data) {
            setPaired(true);
            dispatch({
              type: 'LIVE_APPLY_REMOTE',
              denominations: doc.data.denominations,
              session: doc.data.session,
              ledger: doc.data.ledger,
              currency: doc.data.currency,
              unitValue: doc.data.unitValue,
              tvBackgroundFocus: doc.data.tvBackgroundFocus ?? null,
              tvBackgroundTone: doc.data.tvBackgroundTone ?? null,
              minutesPerLevel: doc.data.minutesPerLevel,
              skin: doc.data.skin,
              tvSkin: doc.data.tvSkin,
              accents: doc.data.accents,
              tvQuips: doc.data.tvQuips,
              tvCustomQuips: doc.data.tvCustomQuips,
              tvShowPlayers: doc.data.tvShowPlayers,
              tvRosterSort: doc.data.tvRosterSort,
              tvShowPayouts: doc.data.tvShowPayouts,
              tvShowBustOrder: doc.data.tvShowBustOrder,
              breakMinutes: doc.data.breakMinutes,
              breakEvery: doc.data.breakEvery,
              language: doc.data.language,
              gameMode: doc.data.gameMode,
              cashUseTimer: doc.data.cashUseTimer,
              tvShowStartStack: doc.data.tvShowStartStack,
              chipArt: doc.data.chipArt,
              bountyMode: doc.data.bountyMode,
              bountyAmount: doc.data.bountyAmount,
              showTrend: doc.data.showTrend ?? true,
              payoutSplit: doc.data.payoutSplit ?? null,
              lateRegLevels: doc.data.lateRegLevels ?? 0,
              customAccent: doc.data.customAccent,
              tvPenalties: doc.data.tvPenalties,
              tvHouseRules: doc.data.tvHouseRules,
              moments: doc.data.moments,
              counting: doc.data.counting ?? null,
            });
          } else if (isTv) {
            setPaired(false);
          }
          /* Recorded against THIS device's clock, not the server stamp: a TV stick
             with a badly set clock would otherwise declare a healthy phone dead.
             The server value is only used to notice that it moved. */
          const seen = doc.hostSeenAt?.toMillis?.();
          if (typeof seen === 'number' && seen !== hostSeenServer.current) {
            hostSeenServer.current = seen;
            setHostSeenLocal(Date.now());
          }
          // guard: a doc can exist with data but no clock (stale/dead code)
          if (doc.clock) {
            setLevelIdx(doc.clock.levelIdx);
            setOnBreak(doc.clock.onBreak);
            setRunning(doc.clock.running);
            const left = clockSecondsLeft(doc.clock);
            setSeconds(left);
            // adopt the sender's deadline so both screens expire at the same instant
            deadline.current = doc.clock.running ? (doc.clock.periodEndsAt ?? Date.now() + left * 1000) : null;
          }
        },
        (connected) => setLiveLost(!connected),
        /* The document this screen is showing has been deleted — the TTL sweep found
           an abandoned session, or another device ended it. A TV that owns the code
           puts it straight back (same four digits, current clock) rather than
           advertising a code nobody can connect to; a host previewing its own TV
           just stops claiming the table is live. */
        () => {
          setPaired(false);
          if (isTv) setPairSeq((n) => n + 1);
          else setLiveLost(true);
        },
      );
    }).catch(() => {
      /* the live-sync chunk is fetched on demand (see vite.config) — if it can't
         be loaded the big screen keeps running on its own data instead of dying. */
      setLiveLost(true);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, liveSessionCode, liveSessionRole]);

  /* The background photo rides in its own document (see liveData.backgroundOf), so
     it needs its own listener — the payoff is that the ledger no longer drags a few
     hundred kB of base64 along on every rename. */
  useEffect(() => {
    if (!synced || !liveSessionCode || !isTv) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeBackground }) => {
      if (cancelled) return;
      unsub = subscribeBackground(liveSessionCode, (image) => {
        dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: image } });
      });
    }).catch(() => {
      /* keep whatever background is already on screen */
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, liveSessionCode, isTv]);

  // This device is the TV: beat a heartbeat into the session doc so the host phone
  // can show a live "● TV connected / ⚠ TV offline" status and know a silent drop.
  useEffect(() => {
    if (!firebaseConfigured || !isTv || !liveSessionCode) return;
    let stopped = false;
    const beat = () =>
      import('../lib/liveSession')
        .then(({ tvHeartbeat }) => {
          if (!stopped) return tvHeartbeat(liveSessionCode);
        })
        .catch(() => {
          /* transient — the next beat retries */
        });
    beat();
    // 25s: the pill only has to tell a live TV from a dead one, and this is a write
    // to a public document every time — twice a minute is plenty.
    const id = window.setInterval(beat, 25000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTv, liveSessionCode]);

  /* Keep the snapshot the pairing effect re-advertises from in step with what is
     actually on screen. Written on render rather than in an effect so a re-advertise
     triggered from a listener callback never sees a stale level. */
  clockRef.current = {
    levelIdx,
    onBreak,
    running,
    periodEndsAt: deadline.current,
    remaining: seconds,
    minutesPerLevel,
  };

  /** Start (or re-arm) the current period: the painted seconds and the deadline
   *  they are derived from always move together. */
  const setPeriod = (secs: number, run: boolean) => {
    setSeconds(secs);
    deadline.current = run ? Date.now() + secs * 1000 : null;
  };

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
    queueClock(liveSessionCode, next); // retried on failure; a command too old to be true is dropped
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

  /* Nothing from the phone for a minute and a half. Only claimed once the phone has
     been heard from at least once, so an older build that never sends a heartbeat is
     never accused of being offline. `staleTick` is what re-evaluates this. */
  void staleTick;
  const hostStale = isTv && paired && hostSeenLocal !== null && Date.now() - hostSeenLocal > 90_000;

  // Keep the big screen awake for the whole session (see lib/useWakeLock.ts —
  // the browser hands the lock back only if you ask again after every hide).
  useWakeLock(true);


  // main clock — read off the deadline every tick, so a slow or skipped timer can
  // cost at most one repaint instead of accumulating into real drift. Also
  // re-read when the tab comes back, which is when the gap is largest.
  useEffect(() => {
    if (!running) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    const expire = () => {
      // host preview never auto-advances — the TV owns that and pushes it here
      if (!ownsClockAdvance) {
        setSeconds(0);
        return;
      }
      if (onBreak) {
        setOnBreak(false);
        setPeriod(minutesPerLevel * 60, true);
        pushClockIfConnected(levelIdx, false, true, minutesPerLevel * 60);
        return;
      }
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
        setPeriod(breakMins * 60, true);
        pushClockIfConnected(nextIdx, true, true, breakMins * 60);
        return;
      }
      setPeriod(minutesPerLevel * 60, stillRunning);
      pushClockIfConnected(nextIdx, false, stillRunning, minutesPerLevel * 60);
    };
    const step = () => {
      const end = deadline.current;
      if (end == null) {
        // running without a deadline shouldn't happen; degrade to a plain tick
        setSeconds((s) => Math.max(0, s - 1));
        return;
      }
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      if (left > 0) {
        setSeconds(left);
        return;
      }
      expire();
    };
    tick.current = window.setInterval(step, 1000);
    const catchUp = () => {
      if (!document.hidden) step();
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('focus', catchUp);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('focus', catchUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, onBreak, blindLevels.length, minutesPerLevel, levelIdx, synced, liveSessionCode, liveSessionRole, ownsClockAdvance, breakEvery, breakMins]);

  // The freshness check needs its own heartbeat: the clock's tick stops when the
  // game is paused, which is exactly when a dead phone is easiest to miss.
  useEffect(() => {
    if (!isTv || !paired) return;
    const id = window.setInterval(() => setStaleTick((n) => n + 1), 20000);
    return () => window.clearInterval(id);
  }, [isTv, paired]);

  /* Standalone big screen (no live session): share the phone's own clock rather
     than start a second one. Opening "Big screen" from the Table tab used to fork a
     fresh countdown, so the bar at the top of the tab and the screen on the wall
     disagreed about the level. Now the state is adopted on the way in and handed
     back on every discrete change. */
  const wroteLocal = useRef(false);
  useEffect(() => {
    if (synced) return;
    const c = getLocalClock();
    setLevelIdx(c.levelIdx);
    setOnBreak(c.onBreak);
    setRunning(c.running);
    const left = clockSecondsLeft(c);
    setSeconds(left);
    deadline.current = c.running ? (c.periodEndsAt ?? Date.now() + left * 1000) : null;
    wroteLocal.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  useEffect(() => {
    if (synced) return;
    // skip the pass that runs alongside the adoption above, or it would write the
    // pre-adoption state straight back over the clock it just read
    if (!wroteLocal.current) {
      wroteLocal.current = true;
      return;
    }
    setLocalClock({
      levelIdx,
      onBreak,
      running,
      periodEndsAt: running ? (deadline.current ?? Date.now() + seconds * 1000) : null,
      remaining: seconds,
      minutesPerLevel,
    });
    // `seconds` is deliberately not a dependency: the deadline is the truth, so one
    // write per discrete change is enough and a per-second write is pure noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, levelIdx, onBreak, running, minutesPerLevel]);

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

  /* The table votes from their own phones (see GuestView); the big screen is where
     the result belongs. Only shown once somebody has actually voted. */
  const [votes, setVotes] = useState<MomentVotes>({});
  useEffect(() => {
    if (!liveSessionCode || !firebaseConfigured) return;
    let alive = true;
    let stop: (() => void) | null = null;
    void import('../lib/liveSession').then(({ subscribeVotes }) => {
      if (!alive) return;
      stop = subscribeVotes(liveSessionCode, setVotes);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [liveSessionCode]);

  const topMoment = useMemo(() => {
    const entries = Object.entries(votes).filter(([, v]) => v.length > 0);
    if (!entries.length) return null;
    const [id, voters] = entries.sort((a, b) => b[1].length - a[1].length)[0];
    const moment = (state.moments ?? []).find((m) => m.id === id);
    return moment ? { text: moment.text, count: voters.length } : null;
  }, [votes, state.moments]);

  // the rotation = logged hand-of-the-night moments (📸) first, then the user's own
  // sayings, then the built-ins
  const quips = useMemo(() => {
    const moments = (state.moments ?? []).map((m) => `📸 ${m.text}`);
    const custom = (tvCustomQuips ?? []).map((q) => q.trim()).filter(Boolean);
    return [...moments, ...custom, ...QUIPS];
  }, [tvCustomQuips, state.moments]);

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
      try {
        navigator.vibrate?.([200, 80, 200]);
      } catch {
        /* ignore */
      }
      const t = setTimeout(() => setShot(null), 1500);
      return () => clearTimeout(t);
    }
    const id = window.setTimeout(() => setShot((s) => (s ?? 0) - 1), 1000);
    return () => window.clearTimeout(id);
  }, [shot]);

  const goLevel = (i: number) => {
    const c = Math.max(0, Math.min(blindLevels.length - 1, i));
    setLevelIdx(c);
    setPeriod(minutesPerLevel * 60, running);
    setOnBreak(false);
    pushClockIfConnected(c, false, running, minutesPerLevel * 60);
  };
  const takeBreak = () => {
    setOnBreak(true);
    setPeriod(breakMins * 60, true);
    setRunning(true);
    pushClockIfConnected(levelIdx, true, true, breakMins * 60);
  };
  const cancelBreak = () => {
    setOnBreak(false);
    setPeriod(minutesPerLevel * 60, running);
    pushClockIfConnected(levelIdx, false, running, minutesPerLevel * 60);
  };
  const togglePlay = () => {
    setRunning((r) => {
      const nr = !r;
      // pausing freezes the remaining seconds; resuming turns them into a deadline
      deadline.current = nr ? Date.now() + seconds * 1000 : null;
      pushClockIfConnected(levelIdx, onBreak, nr, seconds);
      return nr;
    });
  };
  const resetLevel = () => {
    const secs = (onBreak ? breakMins : minutesPerLevel) * 60;
    setPeriod(secs, running);
    pushClockIfConnected(levelIdx, onBreak, running, secs);
  };

  const players = useMemo(
    () => (ledger.length ? ledger.map((p) => p.name || 'Player') : Array.from({ length: playerCount }, (_, i) => `Seat ${i + 1}`)),
    [ledger, playerCount],
  );
  const penalties = useMemo(() => {
    const custom = (tvPenalties ?? []).map((p) => p.trim()).filter(Boolean);
    return [...custom, ...PENALTIES];
  }, [tvPenalties]);
  const spinRound = () => {
    if (!players.length) return;
    let n = 0;
    const total = 18 + Math.floor(Math.random() * 8);
    const step = () => {
      setSpin({ name: players[n % players.length], done: false });
      n++;
      if (n < total) {
        setTimeout(step, 60 + n * 12);
      } else {
        const winner = players[Math.floor(Math.random() * players.length)];
        const penalty = penalties[Math.floor(Math.random() * penalties.length)];
        setSpin({ name: winner, done: true, penalty });
        try {
          navigator.vibrate?.(200);
        } catch {
          /* ignore */
        }
        setTimeout(() => setSpin(null), 6000);
      }
    };
    step();
  };

  // standings. Cash game: money on the table = buy-ins − cash-outs (a player who
  // cashes out takes their money and leaves). Tournament: the pool is the fixed total.
  const totalIn = ledger.length ? ledger.reduce((s, p) => s + (p.buyIn || 0), 0) : playerCount * buyIn;
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const poolMoney = isCash ? Math.max(0, totalIn - totalOut) : totalIn;
  const playersLeft = ledger.length ? Math.max(1, ledger.filter((p) => !p.out && (p.cashOut || 0) === 0).length) : playerCount;
  const poolPoints = unitValue > 0 ? Math.round(poolMoney / unitValue) : 0;
  const avgStack = Math.round(poolPoints / playersLeft);
  const avgBB = currentBB > 0 ? Math.round(avgStack / currentBB) : 0;

  const legend = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0).sort((a, b) => a.value - b.value),
    [denominations],
  );
  // roster shown on the TV — names + amounts, live from the host's ledger. A player
  // who is still in shows what their counted chips are worth in money, plus how far
  // up or down that puts them; one who has left (busted, or cashed out in a cash
  // game) shows their final profit/loss. Without a chip count there's nothing to
  // value, so those rows fall back to the buy-in.
  const roster = useMemo(
    () =>
      ledger.length
        ? ledger.map((p) => {
            const left = !!p.out || (p.cashOut || 0) > 0;
            const chips = p.chips || 0;
            const stackMoney = !left && chips > 0 ? chips * unitValue : null;
            const net = left
              ? (p.cashOut || 0) > 0
                ? (p.cashOut || 0) - (p.buyIn || 0)
                : null
              : stackMoney !== null
                ? stackMoney - (p.buyIn || 0)
                : null;
            return {
              id: p.id,
              name: p.name || 'Player',
              amount: p.buyIn || 0,
              out: left,
              net,
              stackMoney,
              emoji: p.emoji || '',
              chips,
              trail: (p.chipHistory ?? []).map((h) => h.chips),
              // break-even in chip units — the dotted line the trend is read against
              trailBase: unitValue > 0 ? Math.round(Math.max(0, (p.buyIn || 0) - (p.cashOut || 0)) / unitValue) : 0,
              knockouts: p.knockouts || 0,
            };
          })
        : Array.from({ length: playerCount }, (_, i) => ({ id: String(i), name: `Seat ${i + 1}`, amount: buyIn, out: false, net: null as number | null, stackMoney: null as number | null, emoji: '', chips: 0, trail: [] as number[], trailBase: 0, knockouts: 0 })),
    [ledger, playerCount, buyIn, unitValue],
  );

  // roster order: as entered, or biggest stack / biggest profit first. Players who
  // are out sink to the bottom of a sorted list — the leaderboard is about who's
  // still playing.
  const sortedRoster = useMemo(() => {
    if ((tvRosterSort ?? 'seat') === 'seat') return roster;
    const rank = tvRosterSort === 'chips' ? (p: (typeof roster)[number]) => p.chips : (p: (typeof roster)[number]) => p.net ?? 0;
    return [...roster].sort((a, b) => Number(a.out) - Number(b.out) || rank(b) - rank(a));
  }, [roster, tvRosterSort]);

  /* Layout of the roster panel: past eight players the list goes two-up, and the
     rows are sized from the height the panel actually got. A TV has no scrollbar
     anyone can reach, so a list that doesn't fit doesn't merely scroll out of
     sight — it silently drops players (an eight-handed table showed three names).
     Measuring beats guessing in vmin here: the space left for the roster depends
     on which other panels are switched on. Two columns start at seven players —
     one column of eight had to drop to the smallest readable size and still lost
     a row, while two columns of four sit at full size. */
  const rosterCols = sortedRoster.length > 6 ? 2 : 1;
  const rosterRows = Math.ceil(sortedRoster.length / rosterCols) || 1;
  /* The stat tiles are the biggest thing in this column (three tiles ate 522 of
     665px, leaving the roster 121px for eight players). From six rows up they go
     side by side and lose some bulk so the roster keeps its share of the height. */
  const statsTwoUp = tvCompact || (tvShowPlayers && rosterRows >= 6);
  const rosterListRef = useRef<HTMLDivElement | null>(null);
  const [rowFs, setRowFs] = useState(0); // px; 0 = not measured yet, CSS default applies
  const [rosterHidden, setRosterHidden] = useState(0); // players that still didn't fit
  useEffect(() => {
    const el = rosterListRef.current;
    if (!el) {
      setRosterHidden(0);
      return;
    }
    /* Fit by measuring, not by predicting: a row's height depends on the emoji, the
       stack trail and whether the money needs a second line, so any formula for it
       would drift. Measure one row, scale the font by how far off it is, and let the
       effect run again on the new size — it settles in two or three passes. */
    const fit = () => {
      const avail = el.clientHeight;
      const first = el.querySelector('.tv-players-row') as HTMLElement | null;
      if (!avail || !first) return;
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const rowH = first.getBoundingClientRect().height + gap;
      if (rowH <= 0) return;
      const nameEl = first.querySelector('.tv-players-name') as HTMLElement | null;
      const currentFs = rowFs || (nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0);
      if (!currentFs) return;
      // never bigger than the design size, never too small to read from the sofa
      const cap = Math.min(40, 0.018 * Math.min(window.innerWidth, window.innerHeight));
      const target = avail / rosterRows;
      const next = Math.max(ROW_MIN_FS, Math.min(cap, (currentFs * target) / rowH));
      if (Math.abs(next - currentFs) > 0.3) setRowFs(next);
      // Only a roster pinned at the smallest readable size can still lose rows.
      // Count the ones that really don't fit — this runs again after the size
      // change lands, so the number it reports is the number on screen.
      const box = el.getBoundingClientRect();
      let shown = 0;
      el.querySelectorAll('.tv-players-row').forEach((row) => {
        const b = row.getBoundingClientRect();
        if (b.top >= box.top - 1 && b.bottom <= box.bottom + 1) shown++;
      });
      setRosterHidden(Math.max(0, sortedRoster.length - shown));
    };
    fit();
    /* The panel keeps moving after this first pass: the display webfont swaps in
       and the stat tiles above grow, which takes height away from the roster. A
       ResizeObserver catches that on a live screen; the timer and the font hook are
       the belt for browsers that deliver observer callbacks lazily. */
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const settle = window.setTimeout(fit, 400);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
    };
    // rowFs is a dependency on purpose: re-measuring after the size changed is how
    // this converges. The list's height comes from `flex: 1 1 0`, so it cannot be
    // pushed around by the font size it is being measured for.
  }, [rosterRows, rosterCols, rowFs, sortedRoster.length, viewportH, tvScale, statsTwoUp]);

  // header hint for the right-hand column — it only says "buy-in" while nobody has
  // a counted stack to value.
  const rosterAmountLabel = roster.some((p) => p.stackMoney !== null) ? t('tv.stack') : t('tv.buyIn');

  // the chip leader: the still-in player with the most (host-entered) chips. Marked
  // by the weight + colour of their NAME — a crown beside it sat next to the player's
  // own emoji and read as one more emoji, and it shifted every leader's name across.
  const chipLeaderId = useMemo(() => {
    let best: string | null = null;
    let bestChips = 0;
    for (const p of roster) {
      if (!p.out && p.chips > bestChips) {
        bestChips = p.chips;
        best = p.id;
      }
    }
    return best;
  }, [roster]);

  // The starting stack, mirrored from the host: the exact same helper the phone
  // uses, fed by the synced `session` — including the excluded chips and any
  // hand-tuned counts, which used to be phone-local and never reached the TV.
  const startStack = useMemo(
    () => startingStackOf(denominations, state.session, unitValue),
    [denominations, state.session, unitValue],
  );

  // color-up alarm: at the current level, which chips should be raced off?
  const colorUpNow = useMemo(() => {
    if (isCash || !showTimer) return null;
    try {
      const events = colorUpEvents(startStack.counts, denominations, blindLevels, 0, Math.max(1, playerCount));
      const ev = events.find((e) => e.levelIndex === levelIdx);
      if (!ev || !ev.retirements.length) return null;
      return { from: ev.retirements.map((r) => r.fromValue), to: ev.retirements[0].toValue };
    } catch {
      return null;
    }
  }, [isCash, showTimer, levelIdx, denominations, blindLevels, playerCount, startStack]);

  // prize-pool payout split (auto structure by entrant count)
  // Shared with the phone's payout card (lib/payouts.ts) so the two can never
  // disagree about who gets what — the split is editable now.
  const payouts = useMemo(
    () =>
      payoutsFor(poolMoney, ledger.length || playerCount, state.settings.payoutSplit).map((p) => ({
        place: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][p.place - 1] ?? `${p.place}.`,
        amount: p.amount,
      })),
    [ledger.length, playerCount, poolMoney, state.settings.payoutSplit],
  );

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

  // --- Knockout bounty earnings (tournament) ---
  const bountyAmt = bountyAmount ?? 5;
  const bountyPool = bountyMode && !isCash ? (ledger.length || playerCount) * bountyAmt : 0;

  // --- Elimination flash: fire a full-screen cue when a player is newly busted ---
  const [elim, setElim] = useState<{ name: string; emoji: string; place: number } | null>(null);
  const prevOut = useRef<Set<string>>(new Set());
  const elimInit = useRef(false);
  useEffect(() => {
    if (isCash) return;
    const nowOut = new Set(ledger.filter((p) => p.out).map((p) => p.id));
    if (!elimInit.current) {
      prevOut.current = nowOut; // don't flash for players already out when TV opens
      elimInit.current = true;
      return;
    }
    const fresh = ledger.find((p) => p.out && !prevOut.current.has(p.id));
    prevOut.current = nowOut;
    if (fresh) {
      const place = ledger.length - nowOut.size + 1; // busts leave from the bottom up
      setElim({ name: fresh.name || 'Player', emoji: fresh.emoji || '', place });
      try { navigator.vibrate?.([120, 60, 220]); } catch { /* ignore */ }
      const id = window.setTimeout(() => setElim(null), 4500);
      return () => window.clearTimeout(id);
    }
  }, [ledger, isCash]);

  // --- Winner celebration: one player left in a tournament with >1 entrant ---
  const winner = useMemo(() => {
    if (isCash || ledger.length < 2) return null;
    const alive = ledger.filter((p) => !p.out && (p.cashOut || 0) === 0);
    return alive.length === 1 ? alive[0] : null;
  }, [ledger, isCash]);
  const [celebrate, setCelebrate] = useState(false);
  const wonRef = useRef<string | null>(null);
  useEffect(() => {
    if (winner && wonRef.current !== winner.id) {
      wonRef.current = winner.id;
      setCelebrate(true);
      try { navigator.vibrate?.([200, 80, 200, 80, 400]); } catch { /* ignore */ }
    }
    if (!winner) wonRef.current = null;
  }, [winner]);

  // --- House rule shown on the break (stable for the whole break) ---
  const houseRules = useMemo(() => {
    const custom = (tvHouseRules ?? []).map((r) => r.trim()).filter(Boolean);
    return [...custom, ...HOUSE_RULES];
  }, [tvHouseRules]);
  const [houseRuleIdx, setHouseRuleIdx] = useState(0);
  useEffect(() => {
    if (onBreak) setHouseRuleIdx(Math.floor(Math.random() * Math.max(1, houseRules.length)));
  }, [onBreak, houseRules.length]);

  const pct = Math.max(0, Math.min(100, (seconds / ((onBreak ? breakMins : minutesPerLevel) * 60)) * 100));

  // "Can I still buy in?" — the same answer the phone shows, on the wall.
  const lateReg = lateRegState(isCash ? 0 : state.settings.lateRegLevels ?? 0, levelIdx, seconds, minutesPerLevel);

  // custom accent overrides the preset hue on the TV too
  const accentStyle = customAccent && /^#[0-9a-fA-F]{6}$/.test(customAccent) ? customAccentVars(customAccent) : null;

  /* The payout split rides in the right column next to the chip legend: the left
     column carries the stats, the roster and the bust order and used to run out of
     height first, squeezing the players list. */
  const payoutsPanel = !isCash && tvShowPayouts && payouts.length > 0 && poolMoney > 0 && (
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
  );
  const bustPanel = !isCash && tvShowBustOrder && bustOrder.length > 0 && (
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
  );

  return (
    <div
      className={`tv ${tvBackground ? 'has-bg' : ''}`}
      data-tv-skin={effTvSkin}
      data-tv-accent={tvAccent}
      data-tv-focus-v={tvBackground ? focusV : undefined}
      data-tv-compact={tvCompact ? '' : undefined}
      style={{
        ['--tv-scale']: tvScale,
        ...(accentStyle ?? {}),
        ...(tvBackground
          ? {
              // Quoted on purpose: the generated SVG presets are data URLs that
              // still contain raw ' characters (encodeURIComponent leaves them),
              // and an UNQUOTED url() with an apostrophe is invalid CSS — the
              // browser drops the whole declaration, so the preset never showed.
              backgroundImage: `url("${tvBackground}")`,
              backgroundPosition: `${focus.x}% ${focus.y}%`,
              ['--tv-focus-x']: `${focus.x}%`,
              ['--tv-focus-y']: `${focus.y}%`,
              ['--tv-scrim']: scrim,
            }
          : {}),
      } as CSSProperties}
    >
      {tvBackground && <div className="tv-bg-scrim" />}

      {/* Corner status pill */}
      {firebaseConfigured && isTv && (
        <div className={`tv-connect-pill ${liveLost || hostStale ? 'lost' : paired ? 'live' : ''}`}>
          {liveLost
            ? `⚠ ${t('tv.connectionLost')}`
            : hostStale
              ? `⚠ ${t('tv.phoneOffline')}`
              : paired
                ? `● ${t('tv.liveConnected')}`
                : `${t('connect.code')} ${liveSessionCode}`}
        </div>
      )}
      {firebaseConfigured && isHostView && (
        <div className={`tv-connect-pill ${liveLost ? 'lost' : 'live'}`}>
          {liveLost ? `⚠ ${t('tv.connectionLost')}` : `● ${t('tv.liveConnected')}`}
        </div>
      )}
      {connectToast && <div className="tv-toast">📱 {t('tv.phoneConnected')}</div>}
      {/* A counting round is running on the phone — show the table how far it got. */}
      {counting && (
        <div className="tv-counting">
          🧮 {t('tv.counting')}
          <b>{counting.emoji ? `${counting.emoji} ` : ''}{counting.name}</b>
          <span className="tv-counting-step">{counting.index}/{counting.total}</span>
        </div>
      )}
      {/* Standalone: offer to make this device the permanent TV */}
      {firebaseConfigured && !deviceIsTv && !synced && (
        <button className="tv-connect-pill use-tv" onClick={useAsTv}>📺 {t('tv.useAsTv')}</button>
      )}

      {/* This device is the TV, waiting for a phone — show the code to type on the phone */}
      {firebaseConfigured && isTv && !paired && liveSessionCode && (
        <div className="tv-pair">
          <div className="tv-pair-idle" aria-hidden>
            <Chip value={legend[0]?.value ?? 100} color={legend[0]?.color ?? '#0C0C10'} accent={legend[0]?.accent ?? '#CBA85A'} size={56} shape={legend[0]?.shape} />
          </div>
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
          {/* Wrapped so a short screen (a laptop standing in for the TV) can lay the
              tiles two-up instead of eating the roster's vertical space. */}
          <div className="tv-stats" data-2up={statsTwoUp ? '' : undefined}>
            <div className="tv-stat">
              <span className="tv-stat-k">{isCash ? t('tv.onTable') : t('tv.prizePool')}</span>
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
            {bountyMode && !isCash && bountyPool > 0 && (
              <div className="tv-stat">
                <span className="tv-stat-k">🎯 {t('tv.bountyPool')}</span>
                <span className="tv-stat-v">{money(bountyPool, currency)}<small> · {money(bountyAmt, currency)} {t('tv.each')}</small></span>
              </div>
            )}
          </div>
          {tvShowPlayers && roster.length > 0 && (
            <div
              className="tv-players tv-roster"
              data-dense={rosterRows > 7 ? '' : undefined}
              style={{
                ['--tv-roster-rows']: rosterRows,
                ...(rowFs ? { ['--tv-row-fs']: `${rowFs}px` } : {}),
              } as CSSProperties}
            >
              <div className="tv-players-h">
                <span>{t('tv.players')}</span>
                <span className="tv-players-h-sub">
                  {rosterHidden > 0 && <span className="tv-players-more">+{rosterHidden} · </span>}
                  {rosterAmountLabel}
                </span>
              </div>
              <div className="tv-players-list" data-cols={rosterCols} ref={rosterListRef}>
                {sortedRoster.map((p) => (
                  <div className={`tv-players-row ${p.out ? 'out' : ''}`} key={p.id}>
                    {p.emoji && <span className="tv-players-emoji">{p.emoji}</span>}
                    <span className={`tv-players-name${p.id === chipLeaderId ? ' leader' : ''}`}>{p.name}</span>
                    {showTrend !== false && !p.out && p.trail.length > 1 && (
                      // sized off the fitted row so the trail can never be the thing
                      // that makes a row too tall to fit
                      <Sparkline
                        className="tv-spark"
                        points={p.trail}
                        baseline={p.trailBase}
                        width={Math.round((rowFs || 19) * 3.3)}
                        height={Math.round((rowFs || 19) * 1.05)}
                      />
                    )}
                    {bountyMode && !isCash && p.knockouts > 0 && (
                      <span className="tv-bounty" title={t('tv.bounties')}>🎯{p.knockouts}</span>
                    )}
                    {p.stackMoney !== null ? (
                      // still in, chips counted: what the stack is worth, with the
                      // running profit/loss underneath it
                      <span className="tv-players-amt tv-stackcell">
                        <span className="tv-stack-money">{money(p.stackMoney, currency)}</span>
                        {p.net !== null && (
                          <small className={`tv-stack-net ${p.net >= 0 ? 'pos' : 'neg'}`}>
                            {p.net >= 0 ? '+' : '−'}{money(Math.abs(p.net), currency)}
                          </small>
                        )}
                      </span>
                    ) : p.net !== null ? (
                      <span className={`tv-players-amt tv-net ${p.net >= 0 ? 'pos' : 'neg'}`}>
                        {p.net >= 0 ? '+' : '−'}{money(Math.abs(p.net), currency)}
                      </span>
                    ) : (
                      <span className="tv-players-amt">{money(p.amount, currency)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {bustPanel}
        </aside>

        {/* center: the clock (or, cash game with timer off, just the fixed blinds) */}
        <main className={`tv-clock ${showTimer ? '' : 'tv-clock-static'}`}>
          <div className="tv-level">
            {!showTimer
              ? manualBlinds
                ? `${t('tv.cashGame')} · ${t('tv.level', { n: levelIdx + 1 })}`
                : t('tv.cashGame')
              : onBreak
                ? t('tv.break')
                : t('tv.level', { n: levelIdx + 1 })}
          </div>
          <div className="tv-blinds">
            {onBreak && showTimer ? t('tv.backSoon') : level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
            {(!onBreak || !showTimer) && level?.ante ? <span className="tv-ante"> · ante {level.ante}</span> : null}
          </div>
          {showTimer && (
            <>
              <div className={`tv-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{digitCells(fmtClock(seconds))}</div>
              <div className="tv-progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
              <div className="tv-next">{onBreak ? '' : next ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` }) : t('tv.finalLevel')}</div>
              {topMoment && (
                <div className="tv-topmoment">
                  <span className="tv-topmoment-k">🏅 {t('vote.winner')}</span>
                  <span className="tv-topmoment-v">{topMoment.text}</span>
                </div>
              )}
              {lateReg.enabled && lateReg.open && (
                <div className="tv-latereg">
                  {lateReg.lastLevel ? t('table.lateRegLast') : t('table.lateRegOpen', { mins: lateReg.minutesLeft ?? 0 })}
                </div>
              )}
              {!onBreak && colorUpNow && (
                <div className="tv-colorup">
                  🎨 {t('tv.colorUpNow', { from: colorUpNow.from.join(', '), to: colorUpNow.to })}
                </div>
              )}
              {!onBreak && breakEvery > 0 && (
                <div className="tv-break-cue">
                  {levelsToBreak === 0 ? t('tv.breakAfter') : t('tv.breakIn', { n: levelsToBreak })}
                </div>
              )}
              {/* A break is when everyone is up anyway — the ideal moment to recount. */}
              {onBreak && !counting && countStale && (
                <div className="tv-colorup">
                  🧮 {countedMinsAgo === null ? t('tv.countNever') : t('tv.countAgo', { n: countedMinsAgo })}
                </div>
              )}
              {onBreak && houseRules.length > 0 && (
                <div className="tv-houserule">
                  <span className="tv-houserule-k">{t('tv.houseRule')}</span>
                  <span className="tv-houserule-v">{houseRules[houseRuleIdx % houseRules.length]}</span>
                </div>
              )}
            </>
          )}
          {!showTimer && (
            <div className="tv-next">
              {!manualBlinds
                ? t('tv.blindsFixed')
                : next
                  ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` })
                  : t('tv.topLevel')}
            </div>
          )}
        </main>

        {/* right: chip legend (plus, on a short screen, the panels the left column
            can no longer hold — otherwise they squeeze the players roster away) */}
        <aside className="tv-side tv-right">
          <div className="tv-legend">
            <div className="tv-legend-h">{t('tv.chipValues')}</div>
            {legend.map((d) => (
              <div className="tv-legend-row" key={d.id}>
                <Chip value={d.value} color={d.color} accent={d.accent} size={34} shape={d.shape} />
                <span className="tv-legend-v">{d.value}</span>
                <span className="tv-legend-m">{money(d.value * unitValue, currency)}</span>
              </div>
            ))}
          </div>
          {payoutsPanel}
        </aside>
      </div>

      {/* quip ticker */}
      {tvQuips && quips.length > 0 && <div className="tv-quip" key={quipIdx}>{quips[quipIdx % quips.length]}</div>}

      {/* controls (for the phone holding the session) */}
      <div className="tv-controls">
        {/* Cash game without the timer: no clock to run, but the blinds still go up
            when the table says so — step the ladder by hand from the big screen. */}
        {manualBlinds && (
          <span className="tv-blindstep" title={t('tv.raiseBlinds')}>
            <button onClick={() => goLevel(levelIdx - 1)} disabled={levelIdx <= 0} aria-label={t('tv.lowerBlinds')}>
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevron size={22} /></span>
            </button>
            <span className="tv-blindstep-v">{level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}</span>
            <button onClick={() => goLevel(levelIdx + 1)} disabled={levelIdx >= blindLevels.length - 1} aria-label={t('tv.raiseBlinds')}>
              <IconChevron size={22} />
            </button>
          </span>
        )}
        {showTimer && (
          <>
            <button onClick={() => goLevel(levelIdx - 1)} aria-label={t('table.prevLevel')}><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevron size={22} /></span></button>
            <button onClick={resetLevel} aria-label={t('tv.resetLevel')}><IconReset size={20} /></button>
            <button className="tv-play" onClick={togglePlay}>{running ? <IconPause size={30} /> : <IconPlay size={30} />}</button>
            <button onClick={() => goLevel(levelIdx + 1)} aria-label={t('table.nextLevelBtn')}><IconChevron size={22} /></button>
            {onBreak ? (
              <button className="tv-txt tv-exit" onClick={cancelBreak}>{t('tv.cancelBreak')}</button>
            ) : (
              <button className="tv-txt" onClick={takeBreak}>{t('tv.break')}</button>
            )}
          </>
        )}
        {/* Display size — a laptop standing in for the TV needs everything bigger. */}
        <span className="tv-zoom" title={t('tv.displaySize')}>
          <button
            onClick={() => setTvScale(tvScale - TV_SCALE_STEP)}
            disabled={tvScale <= TV_SCALE_MIN}
            aria-label={`${t('tv.displaySize')} −`}
          >
            A<sup>−</sup>
          </button>
          <span className="tv-zoom-v">{Math.round(tvScale * 100)}%</span>
          <button
            onClick={() => setTvScale(tvScale + TV_SCALE_STEP)}
            disabled={tvScale >= TV_SCALE_MAX}
            aria-label={`${t('tv.displaySize')} +`}
          >
            A<sup>+</sup>
          </button>
        </span>
        <button className="tv-txt" onClick={() => setShot(30)}>{t('tv.shotClock')}</button>
        <button className="tv-txt" onClick={spinRound}>{t('tv.whoDrinks')}</button>
        <button
          className="tv-txt"
          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { language: state.settings.language === 'en' ? 'de' : 'en' } })}
          aria-label={t('tv.toggleLanguage')}
        >
          {state.settings.language === 'en' ? 'DE' : 'EN'}
        </button>
        <button className="tv-txt tv-exit" onClick={onClose}>{deviceIsTv ? t('tv.exitTv') : t('tv.exit')}</button>
      </div>

      {/* shot clock overlay */}
      {shot !== null && (
        <div className="tv-overlay" onClick={() => setShot(null)}>
          <div className="tv-overlay-label">{t('tv.shotClock')}</div>
          <div className={`tv-overlay-num ${shot <= 5 ? 'urgent' : ''}`}>{digitCells(String(Math.max(0, shot)))}</div>
          <div className="tv-overlay-hint">{t('tv.tapToDismiss')}</div>
        </div>
      )}

      {/* starting-stack overlay — cast from the phone (Table → Starting stack → Show on TV) */}
      {tvShowStartStack && startStack.denomsUsed.length > 0 && (
        <div className="tv-overlay tv-startstack" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowStartStack: false } })}>
          <div className="tv-overlay-label">{t('table.startingStack')}</div>
          {/* The real pile per denomination, not one chip and a number: the phone's
              chip-mix slider moves these stacks, and the big screen shows the chips
              arriving and leaving as it is dragged. */}
          <div className="tv-startstack-grid">
            <ChipStackViz
              denoms={startStack.denomsUsed}
              counts={startStack.counts}
              surface="tv"
              maxChipSize={96}
            />
          </div>
          <div className="tv-startstack-total">
            {num(startStack.totalValue)} {t('plan.chips').toLowerCase()} · {money(buyIn, currency)} · {startStack.chipCount} {t('plan.chips').toLowerCase()}
          </div>
          <div className="tv-overlay-hint">{t('tv.tapToDismiss')}</div>
        </div>
      )}

      {/* who-buys spinner overlay */}
      {spin && (
        <div className="tv-overlay">
          <div className="tv-overlay-label">{t('tv.whoDrinksNext')}</div>
          <div className={`tv-overlay-name ${spin.done ? 'won' : ''}`}>{spin.name}</div>
          {spin.done && spin.penalty && <div className="tv-overlay-penalty">{spin.penalty}</div>}
          {spin.done && <div className="tv-overlay-hint">🍻 {t('tv.youreUp')}</div>}
        </div>
      )}

      {/* elimination flash — a player just busted */}
      {elim && (
        <div className="tv-elim">
          <div className="tv-elim-lead">{t('tv.eliminated')}</div>
          <div className="tv-elim-name">{elim.emoji && <span>{elim.emoji} </span>}{elim.name}</div>
          <div className="tv-elim-place">{t('tv.finishPlace', { n: elim.place })}</div>
        </div>
      )}

      {/* winner celebration — confetti + champion */}
      {celebrate && winner && (
        <div className="tv-overlay tv-celebrate" onClick={() => setCelebrate(false)}>
          <div className="tv-confetti" aria-hidden>
            {Array.from({ length: 60 }, (_, i) => (
              <i key={i} style={{ ['--i' as string]: i } as CSSProperties} />
            ))}
          </div>
          <div className="tv-champ-cup">🏆</div>
          <div className="tv-champ-name">{winner.emoji ? `${winner.emoji} ` : ''}{winner.name || 'Player'}</div>
          <div className="tv-champ-sub">{t('tv.champion')}</div>
          <div className="tv-overlay-hint">{t('tv.tapToDismiss')}</div>
        </div>
      )}
    </div>
  );
}
