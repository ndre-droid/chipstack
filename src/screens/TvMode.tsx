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
import { startingStackOf } from '../lib/startingStack';
import { autoTvScale, clampTvScale, TV_SCALE_MIN, TV_SCALE_MAX, TV_SCALE_STEP } from '../lib/tvScale';
import { colorUpEvents } from '../lib/planning';
import { customAccentVars } from '../lib/color';
import Sparkline from '../components/Sparkline';

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

export default function TvMode({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { blindLevels } = state.session;
  const { minutesPerLevel, currency, unitValue, skin, tvSkin, accents, tvQuips, tvCustomQuips, tvShowPlayers, tvRosterSort, tvShowPayouts, tvShowBustOrder, breakMinutes, breakEvery, tvBackground, tvBackgroundFocus, tvBackgroundTone, deviceIsTv, liveSessionCode, liveSessionRole, gameMode, cashUseTimer, tvShowStartStack, bountyMode, bountyAmount, customAccent, tvPenalties, tvHouseRules } = state.settings;

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
  // Cash game with the timer off = a single fixed blind level, no countdown.
  const showTimer = !isCash || cashUseTimer;
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
  const [flash, setFlash] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [spin, setSpin] = useState<{ name: string; done: boolean; penalty?: string } | null>(null);
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
            customAccent: doc.data.customAccent,
            tvPenalties: doc.data.tvPenalties,
            tvHouseRules: doc.data.tvHouseRules,
            moments: doc.data.moments,
            counting: doc.data.counting ?? null,
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
    const id = window.setInterval(beat, 12000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTv, liveSessionCode]);

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
          pushClockIfConnected(levelIdx, false, true, minutesPerLevel * 60);
          return minutesPerLevel * 60;
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
              knockouts: p.knockouts || 0,
            };
          })
        : Array.from({ length: playerCount }, (_, i) => ({ id: String(i), name: `Seat ${i + 1}`, amount: buyIn, out: false, net: null as number | null, stackMoney: null as number | null, emoji: '', chips: 0, trail: [] as number[], knockouts: 0 })),
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

  // header hint for the right-hand column — it only says "buy-in" while nobody has
  // a counted stack to value.
  const rosterAmountLabel = roster.some((p) => p.stackMoney !== null) ? t('tv.stack') : t('tv.buyIn');

  // chip-leader crown: the still-in player with the most (host-entered) chips
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
        <div className={`tv-connect-pill ${paired ? 'live' : ''}`}>
          {paired ? `● ${t('tv.liveConnected')}` : `${t('connect.code')} ${liveSessionCode}`}
        </div>
      )}
      {firebaseConfigured && isHostView && <div className="tv-connect-pill live">● {t('tv.liveConnected')}</div>}
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
          <div className="tv-stats">
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
            <div className="tv-players tv-roster">
              <div className="tv-players-h">
                <span>{t('tv.players')}</span>
                <span className="tv-players-h-sub">{rosterAmountLabel}</span>
              </div>
              <div className="tv-players-list">
                {sortedRoster.map((p) => (
                  <div className={`tv-players-row ${p.out ? 'out' : ''}`} key={p.id}>
                    {p.emoji && <span className="tv-players-emoji">{p.emoji}</span>}
                    {p.id === chipLeaderId && <span className="tv-crown" title="Chip leader">👑</span>}
                    <span className="tv-players-name">{p.name}</span>
                    {!p.out && p.trail.length > 1 && (
                      <Sparkline className="tv-spark" points={p.trail} width={64} height={20} />
                    )}
                    {bountyMode && !isCash && p.knockouts > 0 && (
                      <span className="tv-bounty" title="Bounties">🎯{p.knockouts}</span>
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
          <div className="tv-level">{!showTimer ? t('tv.cashGame') : onBreak ? t('tv.break') : t('tv.level', { n: levelIdx + 1 })}</div>
          <div className="tv-blinds">
            {onBreak && showTimer ? t('tv.backSoon') : level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
            {(!onBreak || !showTimer) && level?.ante ? <span className="tv-ante"> · ante {level.ante}</span> : null}
          </div>
          {showTimer && (
            <>
              <div className={`tv-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmtClock(seconds)}</div>
              <div className="tv-progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
              <div className="tv-next">{onBreak ? '' : next ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` }) : t('tv.finalLevel')}</div>
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
          {!showTimer && <div className="tv-next">{t('tv.blindsFixed')}</div>}
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
        {showTimer && (
          <>
            <button onClick={() => goLevel(levelIdx - 1)} aria-label="Previous level"><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevron size={22} /></span></button>
            <button onClick={resetLevel} aria-label="Reset level"><IconReset size={20} /></button>
            <button className="tv-play" onClick={togglePlay}>{running ? <IconPause size={30} /> : <IconPlay size={30} />}</button>
            <button onClick={() => goLevel(levelIdx + 1)} aria-label="Next level"><IconChevron size={22} /></button>
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
          aria-label="Toggle language"
        >
          {state.settings.language === 'en' ? 'DE' : 'EN'}
        </button>
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

      {/* starting-stack overlay — cast from the phone (Table → Starting stack → Show on TV) */}
      {tvShowStartStack && startStack.denomsUsed.length > 0 && (
        <div className="tv-overlay tv-startstack" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowStartStack: false } })}>
          <div className="tv-overlay-label">{t('table.startingStack')}</div>
          <div className="tv-startstack-grid">
            {startStack.denomsUsed.map((d) => (
              <div className="tv-startstack-col" key={d.id}>
                <Chip value={d.value} color={d.color} accent={d.accent} size={92} shape={d.shape} />
                <span className="tv-startstack-count">×{startStack.counts[d.id]}</span>
              </div>
            ))}
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
