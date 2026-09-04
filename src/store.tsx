import { createContext, useContext, useDeferredValue, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, CarryBalance, ChipSet, Denomination, TimelineEvent, BlindLevel, Preset, Settings, SessionConfig, LedgerPlayer, AccentId, Skin, ChipArt, LeagueGame, Moment, CountingProgress, Person, TvLayout, TvTextScale } from './types';

import { applySharedSettings, shareableSettings } from './lib/settingsScope';
import { normalizeCalibrations } from './lib/chipRuler';
import { DEFAULT_TV_TEXT_SCALE, isDefaultTvLayout, normalizeTvLayout, normalizeTvTextScale } from './lib/tvLayout';
import { pushTrail } from './lib/chipTrail';

const uid = () => Math.random().toString(36).slice(2, 9);

// SLOWPLAY Nash ceramic set — colours matched to the physical chips.
function defaultDenoms(): Denomination[] {
  const d = (value: number, color: string, accent: string, count: number): Denomination => ({
    id: uid(),
    value,
    color,
    accent,
    count,
    enabled: true,
    shape: 'chip',
    minPerPlayer: 0,
  });
  return [
    d(1, '#ECE4D0', '#B49A54', 100),
    d(5, '#C0392B', '#F0D083', 100),
    d(10, '#31B6C9', '#EAF7F3', 80),
    d(25, '#2E9E52', '#F2E7A8', 100),
    d(50, '#E0782B', '#FCE3C4', 60),
    d(100, '#0C0C10', '#CBA85A', 100),
    d(500, '#7A3D9C', '#ECD6F4', 50),
    d(1000, '#E4B41F', '#6E5410', 40),
    d(5000, '#9A5228', '#F3D6B4', 25),
  ];
}

function defaultBlinds(sb = 10, bb = 20): BlindLevel[] {
  const b = (smallBlind: number, bigBlind: number): BlindLevel => ({ id: uid(), smallBlind, bigBlind, ante: 0 });
  return [b(sb, bb), b(sb * 2.5, bb * 2.5), b(sb * 5, bb * 5), b(sb * 10, bb * 10), b(sb * 20, bb * 20)].map((l) => ({
    ...l,
    smallBlind: Math.round(l.smallBlind),
    bigBlind: Math.round(l.bigBlind),
  }));
}

const defaultSettings: Settings = {
  unitValue: 0.01,
  currency: '€',
  defaultSmallBlind: 10,
  defaultBigBlind: 20,
  minutesPerLevel: 20,
  skin: 'minimal',
  accents: { minimal: 'amber', casino: 'gold', playful: 'coral', scifi: 'cyan', pokernacht: 'gold' },
  tvSkin: 'match',
  tvQuips: true,
  tvCustomQuips: [],
  tvShowPlayers: true,
  tvRosterSort: 'seat',
  rosterSort: 'seat',
  tvShowPayouts: false,
  tvShowBustOrder: false,
  breakMinutes: 5,
  breakAt: null,
  levelAlerts: false,
  breakEvery: 0,
  tvBackground: null,
  tvBackgroundFocus: null,
  tvBackgroundTone: null,
  appearance: 'dark',
  chipArt: 'deco',
  chipStyle: 'render3d',
  chipAnim: 'plan',
  language: 'en',
  gameMode: 'tournament',
  cashUseTimer: false,
  countMode: 'money',
  tvShowStartStack: false,
  bountyMode: false,
  bountyAmount: 5,
  showTrend: true,
  lateRegLevels: 0,
  payoutSplit: null,
  customAccent: null,
  tvPenalties: [],
  tvHouseRules: [],
  tvLayout: null,
  tvTextScale: { ...DEFAULT_TV_TEXT_SCALE },
  tvLayoutOwn: false,
  tvStartStackHidden: false,
  deviceIsTv: false,
  tvScale: null,
  liveSessionCode: null,
  liveSessionRole: null,
  guestName: null,
  guestEmoji: null,
  onboardedAt: null,
};

const SKINS = ['minimal', 'casino', 'playful', 'scifi', 'pokernacht'];
const ACCENTS = ['amber', 'gold', 'emerald', 'cyan', 'cobalt', 'violet', 'crimson', 'coral'];

const defaultSession: SessionConfig = {
  playerCount: 4,
  buyIn: 20,
  earlyRebuys: 2,
  lateRebuyAmount: 30,
  blindLevels: defaultBlinds(10, 20),
  smallBias: 0.9, // default to maximising chip use; slider still adjusts
  maxDenoms: 0, // 0 = use all available denominations
  useAllChips: false,
  excludedDenoms: [],
  startLevelIdx: 0,
  stackOverride: null,
  handoutAmount: null,
  handoutLevelIdx: null,
};

/** how many of tonight's events the timeline keeps — a long night, not a database */
const TIMELINE_MAX = 200;

/**
 * A player who just bought in is physically holding chips worth what they paid, so
 * that's where their live stack starts — no counting round needed to see a sane
 * number. Undefined when the buy-in is 0 (nothing to hold).
 */
const freshChips = (state: AppState): number | undefined => {
  const units = Math.round(state.session.buyIn / (state.settings.unitValue || 0.01));
  return units > 0 ? units : undefined;
};

const DEFAULT_SET_ID = 'set-default';

const initialDenoms = defaultDenoms();
const initialState: AppState = {
  denominations: initialDenoms,
  chipSets: [{ id: DEFAULT_SET_ID, name: 'My chips', denominations: initialDenoms }],
  activeChipSetId: DEFAULT_SET_ID,
  people: [],
  lastLineup: [],
  carry: [],
  timeline: [],
  settings: defaultSettings,
  session: defaultSession,
  presets: [],
  ledger: [],
  counting: null,
  league: [],
  moments: [],
};

type Action =
  | { type: 'ADD_DENOM' }
  | { type: 'UPDATE_DENOM'; id: string; patch: Partial<Denomination> }
  | { type: 'REMOVE_DENOM'; id: string }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<AppState['settings']> }
  | { type: 'UPDATE_SESSION'; patch: Partial<AppState['session']> }
  | { type: 'SET_PLAYER_COUNT'; n: number }
  | { type: 'ADD_BLIND' }
  | { type: 'UPDATE_BLIND'; id: string; patch: Partial<BlindLevel> }
  | { type: 'REMOVE_BLIND'; id: string }
  | { type: 'SAVE_PRESET'; name: string }
  | { type: 'LOAD_PRESET'; id: string }
  | { type: 'DELETE_PRESET'; id: string }
  | { type: 'IMPORT_SETUP'; denominations: Denomination[]; session: SessionConfig; settings: Partial<Settings> }
  | {
      type: 'LIVE_APPLY_REMOTE';
      denominations: Denomination[];
      session: SessionConfig;
      ledger: LedgerPlayer[];
      currency: string;
      unitValue: number;
      tvBackgroundFocus?: { x: number; y: number } | null;
      tvBackgroundTone?: number | null;
      minutesPerLevel?: number;
      skin?: Skin;
      tvSkin?: Skin | 'match';
      accents?: Record<Skin, AccentId>;
      tvQuips?: boolean;
      tvCustomQuips?: string[];
      tvShowPlayers?: boolean;
      tvRosterSort?: 'seat' | 'chips' | 'profit';
      tvShowPayouts?: boolean;
      tvShowBustOrder?: boolean;
      breakMinutes?: number;
      breakEvery?: number;
      language?: 'en' | 'de';
      gameMode?: 'tournament' | 'cash';
      cashUseTimer?: boolean;
      tvShowStartStack?: boolean;
      chipArt?: ChipArt;
      bountyMode?: boolean;
      bountyAmount?: number;
      showTrend?: boolean;
      payoutSplit?: number[] | null;
      lateRegLevels?: number;
      customAccent?: string | null;
      tvPenalties?: string[];
      tvHouseRules?: string[];
      tvLayout?: TvLayout | null;
      tvTextScale?: TvTextScale;
      moments?: Moment[];
      counting?: CountingProgress | null;
    }
  | { type: 'CHIPSET_SELECT'; id: string }
  | { type: 'CHIPSET_ADD'; name: string; copyActive?: boolean; denominations?: Denomination[] }
  | { type: 'CHIPSET_RENAME'; id: string; name: string }
  | { type: 'CHIPSET_REMOVE'; id: string }
  | { type: 'RESTORE_STATE'; state: AppState }
  | { type: 'CARRY_ADD'; entries: { name: string; personId?: string; amount: number }[] }
  | { type: 'CARRY_SETTLE'; id: string }
  | { type: 'CARRY_CLEAR' }
  | { type: 'PERSON_SAVE'; person: { id?: string; name: string; emoji?: string; payment?: string } }
  | { type: 'PERSON_REMOVE'; id: string }
  | { type: 'LEDGER_SEAT_PEOPLE'; ids: string[] }
  | { type: 'LEDGER_SEAT_LINEUP' }
  | { type: 'LEDGER_ADD'; name?: string; emoji?: string }
  | { type: 'LEDGER_ADD_MANY'; n: number }
  | { type: 'LEDGER_UPDATE'; id: string; patch: Partial<LedgerPlayer> }
  | { type: 'LEDGER_SET_ALL_CHIPS'; chips?: number }
  | { type: 'LEDGER_SET_CHIPS_MANY'; entries: { id: string; chips?: number }[] }
  | { type: 'LEDGER_RESTORE'; ledger: LedgerPlayer[] }
  | { type: 'COUNTING_SET'; progress: CountingProgress | null }
  | { type: 'LEDGER_RESET_PLAYER'; id: string }
  | { type: 'LEDGER_RESET_ALL' }
  | { type: 'LEDGER_CLEAR_CHIPS' }
  | { type: 'LEDGER_REMOVE'; id: string }
  | { type: 'LEDGER_SETTLE_ALL' }
  | { type: 'LEDGER_CLEAR' }
  | { type: 'LEAGUE_SAVE_GAME' }
  | { type: 'LEAGUE_DELETE_GAME'; id: string }
  | { type: 'LEAGUE_CLEAR' }
  | { type: 'MOMENT_ADD'; text: string }
  | { type: 'MOMENT_REMOVE'; id: string }
  | { type: 'RESET' };

/**
 * The Plan tab deals starting stacks for `session.playerCount`. Once people are
 * actually at the table that number stops being a guess — it IS the roster, and
 * letting the two drift meant planning chips for four while six played. So the
 * roster wins whenever it isn't empty, decided HERE rather than at every call site
 * (deleting somebody from the player sheet used to miss it).
 */
function reducer(state: AppState, action: Action): AppState {
  let next = baseReducer(state, action);
  if (next.ledger === state.ledger) return next;

  next = withTimeline(state, next, action);

  const n = Math.min(30, next.ledger.length);
  if (n === 0 || n === next.session.playerCount) return next;
  return { ...next, session: { ...next.session, playerCount: n } };
}

/** Actions whose ledger change is not something that "happened" at the table. */
const UNLOGGED = new Set(['LIVE_APPLY_REMOTE', 'RESTORE_STATE', 'LEDGER_CLEAR', 'LEDGER_RESET_PLAYER', 'LEDGER_RESET_ALL', 'LEDGER_CLEAR_CHIPS']);

/**
 * Record what just happened, by DIFFING the ledger rather than by asking each call
 * site to remember. Every path that moves money — the roster, the player sheet, the
 * counting round, a settle-all — goes through the reducer, so this is the one place
 * that cannot be forgotten when a new one is added.
 */
function withTimeline(prev: AppState, next: AppState, action: Action): AppState {
  if (UNLOGGED.has(action.type)) return next;

  // Undo takes the last thing off the list, which is what it just took back.
  if (action.type === 'LEDGER_RESTORE') {
    return next.timeline.length ? { ...next, timeline: next.timeline.slice(0, -1) } : next;
  }

  const before = new Map(prev.ledger.map((p) => [p.id, p]));
  const events: TimelineEvent[] = [];
  const at = Date.now();
  const ev = (e: Omit<TimelineEvent, 'id' | 'at'>) => events.push({ id: uid(), at, ...e });

  let countedTotal = 0;
  let countedPlayers = 0;

  for (const p of next.ledger) {
    const old = before.get(p.id);
    const who = { name: p.name || 'Player', emoji: p.emoji };
    if (!old) {
      ev({ kind: 'join', ...who, amount: p.buyIn || 0 });
      continue;
    }
    const boughtMore = (p.buyIn || 0) - (old.buyIn || 0);
    if (boughtMore > 0.005) ev({ kind: 'buyin', ...who, amount: Math.round(boughtMore * 100) / 100 });
    const cashedMore = (p.cashOut || 0) - (old.cashOut || 0);
    if (cashedMore > 0.005) ev({ kind: 'cashout', ...who, amount: Math.round(cashedMore * 100) / 100 });
    else if (p.out && !old.out) ev({ kind: 'bust', ...who });
    if (action.type === 'LEDGER_SET_CHIPS_MANY' && p.chips !== old.chips) {
      countedPlayers++;
      countedTotal += p.chips || 0;
    }
  }

  // a counting round is ONE line in the story, not one per player
  if (countedPlayers > 0) events.push({ id: uid(), at, kind: 'count', amount: countedTotal });

  if (!events.length) return next;
  return { ...next, timeline: [...next.timeline, ...events].slice(-TIMELINE_MAX) };
}

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_DENOM': {
      const next: Denomination = {
        id: uid(),
        value: 0,
        color: '#3a3a44',
        accent: '#CBA85A',
        count: 0,
        enabled: true,
        shape: 'chip',
        minPerPlayer: 0,
      };
      return { ...state, denominations: [...state.denominations, next] };
    }
    case 'UPDATE_DENOM':
      return {
        ...state,
        denominations: state.denominations.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      };
    case 'REMOVE_DENOM':
      return { ...state, denominations: state.denominations.filter((d) => d.id !== action.id) };
    case 'UPDATE_SETTINGS': {
      /* Picking a style means "give me that look". A free custom accent set under the
         previous style overrides --acc for every skin, so it used to follow you into
         the new one and quietly cancel the thing you just chose. Switching styles
         therefore hands the accent back to the style (each skin keeps its own hue in
         `accents`); picking a custom colour again afterwards still sticks. */
      const switchingStyle =
        (action.patch.skin !== undefined && action.patch.skin !== state.settings.skin) ||
        (action.patch.tvSkin !== undefined && action.patch.tvSkin !== state.settings.tvSkin);
      const patch = switchingStyle && action.patch.customAccent === undefined
        ? { ...action.patch, customAccent: null }
        : action.patch;
      return { ...state, settings: { ...state.settings, ...patch } };
    }
    case 'UPDATE_SESSION':
      return { ...state, session: { ...state.session, ...action.patch } };
    case 'SET_PLAYER_COUNT': {
      const n = Math.max(1, Math.min(30, Math.floor(action.n) || 1));
      return { ...state, session: { ...state.session, playerCount: n } };
    }
    case 'ADD_BLIND': {
      const last = state.session.blindLevels[state.session.blindLevels.length - 1];
      const sb = last ? last.bigBlind : state.settings.defaultSmallBlind;
      return {
        ...state,
        session: {
          ...state.session,
          blindLevels: [...state.session.blindLevels, { id: uid(), smallBlind: sb, bigBlind: sb * 2, ante: 0 }],
        },
      };
    }
    case 'UPDATE_BLIND':
      return {
        ...state,
        session: {
          ...state.session,
          blindLevels: state.session.blindLevels.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
        },
      };
    case 'REMOVE_BLIND':
      return {
        ...state,
        session: {
          ...state.session,
          blindLevels: state.session.blindLevels.filter((b) => b.id !== action.id),
        },
      };
    case 'SAVE_PRESET': {
      const preset: Preset = {
        id: uid(),
        name: action.name.trim() || `Preset ${state.presets.length + 1}`,
        denominations: JSON.parse(JSON.stringify(state.denominations)),
        session: JSON.parse(JSON.stringify(state.session)),
        // A saved setup is chips, blinds, money and looks — not who this device is
        // or what it is connected to right now (see lib/settingsScope). It also
        // keeps the big-screen photo out of localStorage once per preset.
        settings: JSON.parse(JSON.stringify(shareableSettings(state.settings))),
      };
      // replace a preset with the same name, else append
      const existing = state.presets.findIndex((p) => p.name.toLowerCase() === preset.name.toLowerCase());
      const presets = existing >= 0 ? state.presets.map((p, i) => (i === existing ? preset : p)) : [...state.presets, preset];
      return { ...state, presets };
    }
    case 'LOAD_PRESET': {
      const p = state.presets.find((x) => x.id === action.id);
      if (!p) return state;
      return {
        ...state,
        denominations: JSON.parse(JSON.stringify(p.denominations)),
        session: JSON.parse(JSON.stringify(p.session)),
        // Older presets were saved with the whole settings object, live session
        // code and all — loading one used to disconnect a running session (or, on
        // the big screen, walk it out of TV mode). Device-local fields are pinned.
        settings: applySharedSettings(state.settings, JSON.parse(JSON.stringify(p.settings))),
      };
    }
    case 'DELETE_PRESET':
      return { ...state, presets: state.presets.filter((p) => p.id !== action.id) };
    case 'IMPORT_SETUP':
      return {
        ...state,
        denominations: action.denominations,
        session: { ...defaultSession, ...action.session },
        /* A scanned setup code is somebody else's phone talking. It may not say who
           this device is, and it certainly may not point it at a live session it
           never joined — an old code still carries all of that (see settingsScope). */
        settings: applySharedSettings(state.settings, { ...defaultSettings, ...action.settings }),
      };
    case 'LIVE_APPLY_REMOTE':
      return {
        ...state,
        denominations: action.denominations,
        session: action.session,
        ledger: action.ledger,
        ...(action.moments !== undefined ? { moments: action.moments } : {}),
        ...(action.counting !== undefined ? { counting: action.counting } : {}),
        settings: {
          ...state.settings,
          currency: action.currency,
          unitValue: action.unitValue,
          // The host owns the big-screen photo so a phone upload shows on the TV.
          ...(action.tvBackgroundFocus !== undefined ? { tvBackgroundFocus: action.tvBackgroundFocus } : {}),
          ...(action.tvBackgroundTone !== undefined ? { tvBackgroundTone: action.tvBackgroundTone } : {}),
          // The host also drives the TV look, timer length and toggles remotely.
          ...(action.minutesPerLevel !== undefined ? { minutesPerLevel: action.minutesPerLevel } : {}),
          ...(action.skin !== undefined ? { skin: action.skin } : {}),
          ...(action.tvSkin !== undefined ? { tvSkin: action.tvSkin } : {}),
          ...(action.accents !== undefined ? { accents: action.accents } : {}),
          ...(action.tvQuips !== undefined ? { tvQuips: action.tvQuips } : {}),
          ...(action.tvCustomQuips !== undefined ? { tvCustomQuips: action.tvCustomQuips } : {}),
          ...(action.tvShowPlayers !== undefined ? { tvShowPlayers: action.tvShowPlayers } : {}),
          ...(action.tvRosterSort !== undefined ? { tvRosterSort: action.tvRosterSort } : {}),
          ...(action.tvShowPayouts !== undefined ? { tvShowPayouts: action.tvShowPayouts } : {}),
          ...(action.tvShowBustOrder !== undefined ? { tvShowBustOrder: action.tvShowBustOrder } : {}),
          ...(action.breakMinutes !== undefined ? { breakMinutes: action.breakMinutes } : {}),
          ...(action.breakEvery !== undefined ? { breakEvery: action.breakEvery } : {}),
          // mirror the phone's language so the TV's labels + number grouping match
          ...(action.language !== undefined ? { language: action.language } : {}),
          // the host also drives whether it's a tournament or cash game
          ...(action.gameMode !== undefined ? { gameMode: action.gameMode } : {}),
          ...(action.cashUseTimer !== undefined ? { cashUseTimer: action.cashUseTimer } : {}),
          ...(action.tvShowStartStack !== undefined ? { tvShowStartStack: action.tvShowStartStack } : {}),
          ...(action.chipArt !== undefined ? { chipArt: action.chipArt } : {}),
          ...(action.bountyMode !== undefined ? { bountyMode: action.bountyMode } : {}),
          ...(action.bountyAmount !== undefined ? { bountyAmount: action.bountyAmount } : {}),
          ...(action.showTrend !== undefined ? { showTrend: action.showTrend } : {}),
          ...(action.payoutSplit !== undefined ? { payoutSplit: action.payoutSplit } : {}),
          ...(action.lateRegLevels !== undefined ? { lateRegLevels: action.lateRegLevels } : {}),
          ...(action.customAccent !== undefined ? { customAccent: action.customAccent } : {}),
          ...(action.tvPenalties !== undefined ? { tvPenalties: action.tvPenalties } : {}),
          ...(action.tvHouseRules !== undefined ? { tvHouseRules: action.tvHouseRules } : {}),
          /* The arrangement and the text sizes are set on the phone and mirrored
             here like the rest of the look — UNLESS this screen was arranged on
             itself, in which case its own layout wins and the phone's is ignored
             (`tvLayoutOwn`, cleared by "Reset arrangement"). Without that, an edit
             made on the TV lived until the host's next push, which is why arranging
             used to be hidden on a paired screen entirely. */
          ...(action.tvLayout !== undefined && !state.settings.tvLayoutOwn ? { tvLayout: action.tvLayout } : {}),
          /* Text size is NOT part of that claim. It rode along with `tvLayoutOwn`
             and so went dead the moment a screen was arranged on itself — the
             phone's steppers moved and the TV never changed, which is the whole
             point of having them (the TV has no keyboard to dial sizes in on). */
          ...(action.tvTextScale !== undefined ? { tvTextScale: action.tvTextScale } : {}),
        },
      };
    /* Chip sets. `denominations` stays THE active box of chips that the rest of the
       app reads; switching parks the current chips back in their set first, so an
       edit made just before switching is never lost. */
    case 'CHIPSET_SELECT': {
      const target = state.chipSets.find((c) => c.id === action.id);
      if (!target || action.id === state.activeChipSetId) return state;
      return {
        ...state,
        chipSets: state.chipSets.map((c) =>
          c.id === state.activeChipSetId ? { ...c, denominations: state.denominations } : c,
        ),
        denominations: target.denominations,
        activeChipSetId: target.id,
        // a stack tuned for the old box means nothing for the new one
        session: { ...state.session, stackOverride: null, excludedDenoms: [] },
      };
    }
    case 'CHIPSET_ADD': {
      const denominations = action.denominations
        ? action.denominations
        : action.copyActive
          ? state.denominations.map((d) => ({ ...d, id: uid() }))
          : defaultDenoms();
      const set: ChipSet = { id: uid(), name: action.name.trim() || 'Chips', denominations };
      return {
        ...state,
        chipSets: [
          ...state.chipSets.map((c) => (c.id === state.activeChipSetId ? { ...c, denominations: state.denominations } : c)),
          set,
        ],
        denominations,
        activeChipSetId: set.id,
        session: { ...state.session, stackOverride: null, excludedDenoms: [] },
      };
    }
    case 'CHIPSET_RENAME':
      return {
        ...state,
        chipSets: state.chipSets.map((c) => (c.id === action.id ? { ...c, name: action.name.trim() || c.name } : c)),
      };
    case 'CHIPSET_REMOVE': {
      if (state.chipSets.length <= 1) return state; // never leave the app without chips
      const rest = state.chipSets.filter((c) => c.id !== action.id);
      if (action.id !== state.activeChipSetId) return { ...state, chipSets: rest };
      const next = rest[0];
      return {
        ...state,
        chipSets: rest,
        denominations: next.denominations,
        activeChipSetId: next.id,
        session: { ...state.session, stackOverride: null, excludedDenoms: [] },
      };
    }
    case 'RESTORE_STATE': {
      /* A backup file is another device's whole state. `lib/backup.ts` checks the
         shape; this puts it through the SAME normalisation a localStorage load
         gets, so a file written by an older version arrives with every field the
         current app expects instead of `undefined` where a default belongs.
         Device-local settings are then pinned back to this device: a backup taken
         on the big screen used to boot the phone that restored it straight into TV
         mode, claiming the 'tv' role of a session that ended weeks ago. */
      const restored = migrate(JSON.stringify(action.state));
      return { ...restored, settings: applySharedSettings(state.settings, restored.settings) };
    }
    /* Carrying a night forward. Entries are MERGED by person (or by name when there
       is no profile): a regular who has been owed twice is one line, not two. */
    case 'CARRY_ADD': {
      const at = Date.now();
      const next = [...state.carry];
      for (const e of action.entries) {
        if (Math.abs(e.amount) < 0.005) continue;
        const key = (c: CarryBalance) =>
          e.personId ? c.personId === e.personId : !c.personId && c.name.toLowerCase() === e.name.toLowerCase();
        const i = next.findIndex(key);
        if (i >= 0) {
          const merged = Math.round((next[i].amount + e.amount) * 100) / 100;
          if (Math.abs(merged) < 0.005) next.splice(i, 1);
          else next[i] = { ...next[i], amount: merged };
        } else {
          next.push({ id: uid(), name: e.name, personId: e.personId, amount: Math.round(e.amount * 100) / 100, since: at });
        }
      }
      return { ...state, carry: next };
    }
    case 'CARRY_SETTLE':
      return { ...state, carry: state.carry.filter((c) => c.id !== action.id) };
    case 'CARRY_CLEAR':
      return { ...state, carry: [] };
    case 'PERSON_SAVE': {
      const { id, name, emoji, payment } = action.person;
      const clean = name.trim();
      if (!clean) return state;
      const existing = id
        ? state.people.find((p) => p.id === id)
        : // same name typed again is the same person, not a second one
          state.people.find((p) => p.name.toLowerCase() === clean.toLowerCase());
      if (existing) {
        return {
          ...state,
          people: state.people.map((p) =>
            p.id === existing.id ? { ...p, name: clean, emoji: emoji ?? p.emoji, payment: payment ?? p.payment } : p,
          ),
        };
      }
      return { ...state, people: [...state.people, { id: uid(), name: clean, emoji, payment }] };
    }
    case 'PERSON_REMOVE':
      return { ...state, people: state.people.filter((p) => p.id !== action.id) };
    case 'LEDGER_SEAT_PEOPLE': {
      // seat saved people, skipping anybody already at the table
      const seated = new Set(state.ledger.map((p) => p.personId).filter(Boolean));
      const now = Date.now();
      const add = state.people
        .filter((p) => action.ids.includes(p.id) && !seated.has(p.id))
        .map<LedgerPlayer>((p) => ({
          id: uid(),
          personId: p.id,
          name: p.name,
          emoji: p.emoji,
          buyIn: state.session.buyIn,
          cashOut: 0,
          chips: freshChips(state),
          stakeChips: freshChips(state),
        }));
      if (!add.length) return state;
      return {
        ...state,
        ledger: [...state.ledger, ...add],
        people: state.people.map((p) => (action.ids.includes(p.id) ? { ...p, lastPlayedAt: now } : p)),
      };
    }
    case 'LEDGER_SEAT_LINEUP': {
      // "same as last time" — by person where we still have one, by name otherwise
      const seatedNames = new Set(state.ledger.map((p) => p.name.toLowerCase()));
      const add = state.lastLineup
        .filter((l) => !seatedNames.has(l.name.toLowerCase()))
        .map<LedgerPlayer>((l) => ({
          id: uid(),
          personId: l.personId,
          name: l.name,
          emoji: l.emoji,
          buyIn: state.session.buyIn,
          cashOut: 0,
          chips: freshChips(state),
          stakeChips: freshChips(state),
        }));
      if (!add.length) return state;
      return { ...state, ledger: [...state.ledger, ...add] };
    }
    case 'LEDGER_ADD':
      return {
        ...state,
        ledger: [
          ...state.ledger,
          {
            id: uid(),
            name: action.name || `Player ${state.ledger.length + 1}`,
            emoji: action.emoji,
            buyIn: state.session.buyIn,
            cashOut: 0,
            chips: freshChips(state),
            stakeChips: freshChips(state),
          },
        ],
      };
    case 'LEDGER_ADD_MANY': {
      const add: LedgerPlayer[] = [];
      for (let i = 0; i < action.n; i++)
        add.push({
          id: uid(),
          name: `Player ${state.ledger.length + add.length + 1}`,
          buyIn: state.session.buyIn,
          cashOut: 0,
          chips: freshChips(state),
          stakeChips: freshChips(state),
        });
      return { ...state, ledger: [...state.ledger, ...add] };
    }
    case 'LEDGER_UPDATE': {
      const ledger = state.ledger.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p));
      // Correcting a regular's name or avatar at the table is meant to stick: without
      // this it reverted the moment they were seated again next week.
      const row = ledger.find((p) => p.id === action.id);
      const touchesProfile = action.patch.name !== undefined || action.patch.emoji !== undefined;
      if (!row?.personId || !touchesProfile) return { ...state, ledger };
      return {
        ...state,
        ledger,
        people: state.people.map((p) =>
          p.id === row.personId ? { ...p, name: row.name || p.name, emoji: row.emoji ?? p.emoji } : p,
        ),
      };
    }
    case 'LEDGER_SET_ALL_CHIPS':
      // one-tap "everyone starts with X" — fill every player's live stack at once
      return { ...state, ledger: state.ledger.map((p) => ({ ...p, chips: action.chips })) };
    case 'LEDGER_SET_CHIPS_MANY': {
      // a whole counting round commits in ONE dispatch → one render, one TV push
      const byId = new Map(action.entries.map((e) => [e.id, e.chips]));
      const at = Date.now();
      /* Every still-playing player gets a point, not only the ones in `entries` —
         somebody whose stack was typed on its own would otherwise build up a longer
         trail than the rest, and the trend lines stopped being comparable (the
         "why does only half the table have a graph?" bug). An uncounted player
         carries their last known stack forward, which is exactly what is believed
         about them at that moment. Players who are out keep their trail frozen. */
      return {
        ...state,
        ledger: state.ledger.map((p) => {
          if (p.out || (p.cashOut || 0) > 0) return p;
          const chips = byId.has(p.id) ? byId.get(p.id) : p.chips;
          return {
            ...p,
            chips,
            chipHistory: pushTrail(p.chipHistory, { at, chips: chips ?? 0 }),
          };
        }),
      };
    }
    case 'LEDGER_RESTORE':
      // Undo, for anything that touched the money: the ledger exactly as it stood
      // before. One shape covers a counting round, a rebuy, a cash-out, a bust and
      // a removal — each of which is one mistap away from being wrong out loud.
      return { ...state, ledger: action.ledger };
    case 'COUNTING_SET':
      return { ...state, counting: action.progress };
    case 'LEDGER_RESET_PLAYER':
      // back to "just sat down": one buy-in, nothing cashed out, a fresh stack.
      return {
        ...state,
        ledger: state.ledger.map((p) =>
          p.id === action.id
            ? {
                ...p,
                buyIn: state.session.buyIn,
                cashOut: 0,
                out: false,
                outAt: undefined,
                chips: freshChips(state),
                stakeChips: freshChips(state),
                chipHistory: undefined,
                knockouts: 0,
              }
            : p,
        ),
      };
    case 'LEDGER_RESET_ALL':
      // same, for everyone — keeps the people (names, emojis), drops the night's numbers
      return {
        ...state,
        counting: null,
        ledger: state.ledger.map((p) => ({
          ...p,
          buyIn: state.session.buyIn,
          cashOut: 0,
          out: false,
          outAt: undefined,
          chips: freshChips(state),
          stakeChips: freshChips(state),
          chipHistory: undefined,
          knockouts: 0,
        })),
      };
    case 'LEDGER_CLEAR_CHIPS':
      // only the stack figures — buy-ins and cash-outs stay untouched
      return { ...state, ledger: state.ledger.map((p) => ({ ...p, chips: undefined, chipHistory: undefined })) };
    case 'LEDGER_REMOVE':
      return { ...state, ledger: state.ledger.filter((p) => p.id !== action.id) };
    case 'LEDGER_SETTLE_ALL': {
      // Close the night in one go: whatever is still in front of a player becomes
      // their cash-out, exactly as the provisional settle-up on the Cash tab was
      // already showing it. Cumulative, like every other cash-out.
      const at = Date.now();
      const unit = state.settings.unitValue || 0.01;
      return {
        ...state,
        ledger: state.ledger.map((p) =>
          p.out
            ? p
            : {
                ...p,
                cashOut: Math.round(((p.cashOut || 0) + (p.chips || 0) * unit) * 100) / 100,
                out: true,
                outAt: at,
                chips: undefined,
              },
        ),
      };
    }
    case 'LEDGER_CLEAR':
      // a fresh game night: clear players AND the night's logged moments. Who was
      // here is remembered so the next night can be seated in one tap.
      return {
        ...state,
        lastLineup: state.ledger.length
          ? state.ledger.map((p) => ({ personId: p.personId, name: p.name, emoji: p.emoji }))
          : state.lastLineup,
        ledger: [],
        moments: [],
        counting: null,
      };
    case 'LEAGUE_SAVE_GAME': {
      const players = state.ledger
        .filter((p) => (p.buyIn || 0) > 0 || (p.cashOut || 0) > 0)
        .map((p) => ({ name: p.name || 'Player', buyIn: p.buyIn || 0, cashOut: p.cashOut || 0 }));
      if (!players.length) return state;
      const game: LeagueGame = {
        id: uid(),
        date: Date.now(),
        mode: state.settings.gameMode,
        currency: state.settings.currency,
        players,
      };
      return { ...state, league: [game, ...state.league] };
    }
    case 'LEAGUE_DELETE_GAME':
      return { ...state, league: state.league.filter((g) => g.id !== action.id) };
    case 'LEAGUE_CLEAR':
      return { ...state, league: [] };
    case 'MOMENT_ADD': {
      const text = action.text.trim();
      if (!text) return state;
      const moment: Moment = { id: uid(), text, at: Date.now() };
      // newest first, keep the last 30 so the doc stays small
      return { ...state, moments: [moment, ...state.moments].slice(0, 30) };
    }
    case 'MOMENT_REMOVE':
      return { ...state, moments: state.moments.filter((m) => m.id !== action.id) };
    case 'RESET': {
      const fresh = defaultDenoms();
      return {
        denominations: fresh,
        chipSets: [{ id: DEFAULT_SET_ID, name: 'My chips', denominations: fresh }],
        activeChipSetId: DEFAULT_SET_ID,
        // the regulars are address-book data, not game data — a factory reset of the
        // chips and settings has no business deleting the people
        people: state.people,
        lastLineup: state.lastLineup,
        carry: state.carry,
        timeline: [],
        settings: { ...defaultSettings },
        session: { ...defaultSession, blindLevels: defaultBlinds(10, 20) },
        presets: state.presets,
        ledger: state.ledger,
        counting: null,
        league: state.league,
        moments: [],
      };
    }
    default:
      return state;
  }
}

const KEY = 'chipstack.state.v1';

/**
 * Merge saved state over current defaults so a user's chips / settings / session
 * survive app updates, and any field added in a newer version gets a sensible
 * default. Also migrates old shapes (players[] -> playerCount, rebuy -> rebuys).
 */
/** German phone, German app — the language picker in Settings still overrides it. */
function detectLanguage(): 'en' | 'de' {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs.some((l) => /^de/i.test(l ?? '')) ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

function migrate(raw: string | null): AppState {
  if (!raw) return { ...initialState, settings: { ...defaultSettings, language: detectLanguage() } };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return initialState;
  }
  if (!parsed || typeof parsed !== 'object') return initialState;

  const denomsRaw = parsed.denominations;
  const denominations: Denomination[] =
    Array.isArray(denomsRaw) && denomsRaw.length
      ? denomsRaw.map((d) => ({
          shape: 'chip' as const,
          minPerPlayer: 0,
          ...(d as Denomination),
        }))
      : defaultDenoms();

  const savedSettings = (parsed.settings ?? {}) as Record<string, unknown>;
  const settings = { ...defaultSettings, ...savedSettings } as Settings & { theme?: string; accent?: string };

  // build the per-skin accents map, migrating from the old single `accent`
  // (and, before that, from the legacy 6-theme model)
  const legacyThemeToAccent: Record<string, AccentId> = {
    gold: 'amber', emerald: 'emerald', crimson: 'crimson', retro: 'emerald', scifi: 'cyan', elite: 'gold',
  };
  const oldAccent =
    (typeof settings.accent === 'string' && ACCENTS.includes(settings.accent) && (settings.accent as AccentId)) ||
    (typeof settings.theme === 'string' ? legacyThemeToAccent[settings.theme] : undefined);
  const savedAccents = (savedSettings.accents ?? {}) as Record<string, unknown>;
  const accents = { ...defaultSettings.accents } as Record<Skin, AccentId>;
  for (const s of SKINS) {
    const v = savedAccents[s];
    if (typeof v === 'string' && ACCENTS.includes(v)) accents[s as Skin] = v as AccentId;
  }
  if (oldAccent && !(typeof savedAccents.minimal === 'string')) accents.minimal = oldAccent;
  settings.accents = accents;
  delete settings.theme;
  delete settings.accent;

  if (!SKINS.includes(settings.skin)) settings.skin = 'minimal';
  if (settings.tvSkin !== 'match' && !SKINS.includes(settings.tvSkin)) settings.tvSkin = 'match';
  if (typeof settings.tvQuips !== 'boolean') settings.tvQuips = true;
  if (!Array.isArray(settings.tvCustomQuips)) settings.tvCustomQuips = [];
  else settings.tvCustomQuips = settings.tvCustomQuips.filter((q): q is string => typeof q === 'string');
  if (typeof settings.tvShowPlayers !== 'boolean') settings.tvShowPlayers = true;
  if (!['seat', 'chips', 'profit'].includes(settings.tvRosterSort)) settings.tvRosterSort = 'seat';
  if (!['seat', 'chips', 'profit'].includes(settings.rosterSort)) settings.rosterSort = 'seat';
  // An existing install has already made all these decisions — never greet it with
  // the first-run wizard just because the field is new.
  if (typeof settings.onboardedAt !== 'number') settings.onboardedAt = 0;
  /* The chip ruler measures against ONE piece of glass, so its calibrations are a
     map keyed by screen. Anything in there that is not a believable calibration is
     dropped rather than carried: a ruler that trusts a hand-edited backup is
     confidently wrong at a table, which is worse than asking for two drags. */
  settings.chipRulerCals = normalizeCalibrations(settings.chipRulerCals);
  if (typeof settings.tvShowPayouts !== 'boolean') settings.tvShowPayouts = false;
  if (typeof settings.tvShowBustOrder !== 'boolean') settings.tvShowBustOrder = false;
  if (typeof settings.breakMinutes !== 'number' || settings.breakMinutes < 1) settings.breakMinutes = 5;
  if (typeof settings.breakEvery !== 'number' || settings.breakEvery < 0) settings.breakEvery = 0;
  if (typeof settings.tvBackground !== 'string') settings.tvBackground = null;
  {
    const f = settings.tvBackgroundFocus as unknown;
    settings.tvBackgroundFocus =
      f && typeof f === 'object' && typeof (f as { x: unknown }).x === 'number' && typeof (f as { y: unknown }).y === 'number'
        ? (f as { x: number; y: number })
        : null;
  }
  if (typeof settings.tvBackgroundTone !== 'number') settings.tvBackgroundTone = null;
  if (settings.language !== 'en' && settings.language !== 'de') settings.language = 'en';
  if (settings.gameMode !== 'tournament' && settings.gameMode !== 'cash') settings.gameMode = 'tournament';
  if (typeof settings.cashUseTimer !== 'boolean') settings.cashUseTimer = false;
  if (settings.countMode !== 'money' && settings.countMode !== 'colours') settings.countMode = 'money';
  if (typeof settings.tvShowStartStack !== 'boolean') settings.tvShowStartStack = false;
  if (typeof settings.tvStartStackHidden !== 'boolean') settings.tvStartStackHidden = false;
  if (typeof settings.bountyMode !== 'boolean') settings.bountyMode = false;
  if (typeof settings.bountyAmount !== 'number' || settings.bountyAmount < 0) settings.bountyAmount = 5;
  if (typeof settings.showTrend !== 'boolean') settings.showTrend = true;
  if (!Array.isArray(settings.payoutSplit) || !settings.payoutSplit.length) settings.payoutSplit = null;
  settings.lateRegLevels = Math.max(0, Math.min(20, Math.floor(settings.lateRegLevels) || 0));
  if (typeof settings.breakAt !== 'string' || !/^\d{2}:\d{2}$/.test(settings.breakAt)) settings.breakAt = null;
  if (typeof settings.levelAlerts !== 'boolean') settings.levelAlerts = false;
  if (typeof settings.customAccent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(settings.customAccent)) settings.customAccent = null;
  settings.tvPenalties = Array.isArray(settings.tvPenalties) ? settings.tvPenalties.filter((q): q is string => typeof q === 'string') : [];
  settings.tvHouseRules = Array.isArray(settings.tvHouseRules) ? settings.tvHouseRules.filter((q): q is string => typeof q === 'string') : [];
  /* The big screen's arrangement. Kept as null while it is the stock one, so a
     device that never touched it does not carry a copy of the default around (and
     the phone does not push one to the TV on every change). */
  {
    const laid = normalizeTvLayout(settings.tvLayout);
    settings.tvLayout = settings.tvLayout && !isDefaultTvLayout(laid) ? laid : null;
  }
  settings.tvTextScale = normalizeTvTextScale(settings.tvTextScale);
  if (typeof settings.tvLayoutOwn !== 'boolean') settings.tvLayoutOwn = false;
  // A screen with nothing of its own to keep has nothing to protect from the phone.
  if (!settings.tvLayout) settings.tvLayoutOwn = false;
  if (typeof settings.deviceIsTv !== 'boolean') settings.deviceIsTv = false;
  settings.tvScale =
    typeof settings.tvScale === 'number' && settings.tvScale > 0
      ? Math.min(2.5, Math.max(0.6, settings.tvScale))
      : null;
  if (typeof settings.liveSessionCode !== 'string') settings.liveSessionCode = null;
  // Pairing was rebuilt (TV owns the doc/clock; codes are now 4 digits). Any persisted
  // pre-rebuild session used a 6-digit code and is meaningless now — drop it so a stale
  // 'host' role can't point at a clock-less doc (which crashed the Table tab).
  if (settings.liveSessionCode && !/^\d{4}$/.test(settings.liveSessionCode)) {
    settings.liveSessionCode = null;
    settings.liveSessionRole = null;
  }
  if (!['host', 'tv', 'guest'].includes(settings.liveSessionRole as string)) settings.liveSessionRole = null;
  if (typeof settings.guestName !== 'string') settings.guestName = null;
  if (typeof settings.guestEmoji !== 'string') settings.guestEmoji = null;
  const validAppear = ['system', 'light', 'dark'];
  if (!validAppear.includes(settings.appearance)) settings.appearance = 'dark';
  const validArt = ['deco', 'classic', 'diamond', 'sunburst'];
  if (!validArt.includes(settings.chipArt)) settings.chipArt = 'deco';
  if (settings.chipStyle !== 'vector' && settings.chipStyle !== 'render3d') settings.chipStyle = 'render3d';
  if (!['off', 'plan', 'all'].includes(settings.chipAnim as string)) settings.chipAnim = 'plan';

  const savedSession = (parsed.session ?? {}) as Record<string, unknown>;
  const session = { ...defaultSession, ...savedSession } as SessionConfig & {
    players?: unknown[];
    rebuy?: number;
  };
  if (Array.isArray(session.players)) {
    if (typeof savedSession.playerCount !== 'number') session.playerCount = session.players.length || 4;
    delete session.players;
  }
  if (typeof savedSession.lateRebuyAmount !== 'number' && typeof session.rebuy === 'number') {
    session.lateRebuyAmount = session.rebuy;
  }
  delete session.rebuy;
  session.playerCount = Math.max(1, Math.min(30, Math.floor(session.playerCount) || 4));
  if (typeof session.earlyRebuys !== 'number') session.earlyRebuys = 2;
  if (typeof session.maxDenoms !== 'number') session.maxDenoms = 0;
  if (typeof session.useAllChips !== 'boolean') session.useAllChips = false;
  if (!Array.isArray(session.excludedDenoms)) session.excludedDenoms = [];
  if (typeof session.startLevelIdx !== 'number' || session.startLevelIdx < 0) session.startLevelIdx = 0;
  if (!session.stackOverride || typeof session.stackOverride.key !== 'string') session.stackOverride = null;
  // A saved night from before the handout switcher shows the starting stack, which
  // is exactly what null means.
  if (typeof session.handoutAmount !== 'number' || !(session.handoutAmount > 0)) session.handoutAmount = null;
  if (typeof session.handoutLevelIdx !== 'number' || !(session.handoutLevelIdx >= 0)) session.handoutLevelIdx = null;
  if (!Array.isArray(session.blindLevels) || session.blindLevels.length === 0)
    session.blindLevels = defaultBlinds(settings.defaultSmallBlind, settings.defaultBigBlind);

  const presets = Array.isArray(parsed.presets) ? (parsed.presets as Preset[]) : [];
  const ledger = Array.isArray(parsed.ledger) ? (parsed.ledger as LedgerPlayer[]) : [];
  const league = Array.isArray(parsed.league) ? (parsed.league as LeagueGame[]) : [];
  const moments = Array.isArray(parsed.moments) ? (parsed.moments as Moment[]) : [];

  // A saved state from before the roster drove the player count can hold both a
  // roster of six and a planning count of four. The roster is the truth.
  if (ledger.length > 0) session.playerCount = Math.min(30, ledger.length);

  /* Chip sets arrived after the single `denominations` list. An older save has one
     box of chips and no sets, so it becomes the first set. */
  const savedSets = Array.isArray(parsed.chipSets) ? (parsed.chipSets as ChipSet[]) : [];
  const chipSets: ChipSet[] = savedSets.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.denominations));
  let activeChipSetId = typeof parsed.activeChipSetId === 'string' ? parsed.activeChipSetId : null;
  if (!chipSets.length) {
    chipSets.push({ id: DEFAULT_SET_ID, name: 'My chips', denominations });
    activeChipSetId = DEFAULT_SET_ID;
  }
  if (!chipSets.some((c) => c.id === activeChipSetId)) activeChipSetId = chipSets[0].id;
  // the active set and `denominations` are two views of one thing — keep them equal
  const activeSet = chipSets.find((c) => c.id === activeChipSetId)!;
  activeSet.denominations = denominations;

  const people = Array.isArray(parsed.people) ? (parsed.people as Person[]) : [];
  const lastLineup = Array.isArray(parsed.lastLineup) ? (parsed.lastLineup as AppState['lastLineup']) : [];
  const timeline = Array.isArray(parsed.timeline) ? (parsed.timeline as TimelineEvent[]).slice(-TIMELINE_MAX) : [];
  const carry = Array.isArray(parsed.carry)
    ? (parsed.carry as CarryBalance[]).filter((c) => c && typeof c.name === 'string' && typeof c.amount === 'number')
    : [];

  // a counting round never survives a reload — it only means "someone is mid-round right now"
  return { denominations, chipSets, activeChipSetId, settings, session, presets, ledger, counting: null, league, moments, people, lastLineup, carry, timeline };
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** the save was too big for this browser and the TV photo had to be dropped */
  storageFull: boolean;
} | null>(null);

/** Browsers disagree on the name; all of them mean the same thing. */
function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.name === 'QUOTA_EXCEEDED_ERR'
  );
}

export function StoreProvider({ children }: { children: ReactNode }) {
  /* True once the browser refused to store the state and the photo had to be
     dropped to make it fit — surfaced in Settings rather than failing quietly. */
  const [storageFull, setStorageFull] = useState(false);
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      return migrate(localStorage.getItem(KEY));
    } catch {
      return initialState;
    }
  });

  /* Saving is debounced: this fires on EVERY dispatch, and serialising the whole
     night (ledger, chip history, a background photo as base64) on each keystroke of
     a player's name is real work on a phone. A quarter second of typing costs one
     write instead of ten, and the flush below covers the app being closed between
     two of them. */
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        setStorageFull(false);
      } catch (err) {
        /* Out of quota is the one failure worth reacting to: dropping the save in
           silence means the night's numbers are gone at the next launch. The TV
           photo is the only thing in here big enough to matter, so give that up and
           keep the game. */
        if (!isQuotaError(err)) return;
        setStorageFull(true);
        try {
          const trimmed = { ...state, settings: { ...state.settings, tvBackground: null } };
          localStorage.setItem(KEY, JSON.stringify(trimmed));
        } catch {
          /* nothing else worth giving up */
        }
      }
    };
    /* …and then handed to the browser's idle time rather than run on the spot.
       Serialising the night and writing it to localStorage is synchronous work of a
       few milliseconds — on the big screen it landed a quarter of a second after
       every incoming push from the phone, which is exactly when the chip stacks are
       mid-animation, and a dropped frame there is visible from across the room. An
       idle callback puts it between two frames instead. The timeout is what keeps it
       a debounce and not a maybe: the browser must run it within a second whether it
       ever goes idle or not. */
    let idle: number | null = null;
    const id = window.setTimeout(() => {
      const ric = window.requestIdleCallback;
      if (ric) idle = ric(save, { timeout: 1000 });
      else save();
    }, 250);
    const cancel = () => {
      window.clearTimeout(id);
      if (idle !== null) window.cancelIdleCallback?.(idle);
      idle = null;
    };
    // A phone closing the app never gets the timer; it does get this.
    const flush = () => {
      if (document.hidden) {
        cancel();
        save();
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      cancel();
      document.removeEventListener('visibilitychange', flush);
    };
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch, storageFull }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

/**
 * The store as one screen sees it.
 *
 * Every screen the user has opened stays mounted (App.tsx keeps them so a half-typed
 * name or a half-open panel survives a tab change), and every one of them reads the
 * whole state — so a single tap on the Table tab was re-rendering the Plan, Chips and
 * Cash screens too, before the tap could paint. Measured on the Table tab with ten
 * players, that was ~35 of the ~55 ms a rebuy button cost: work for screens nobody was
 * looking at.
 *
 * A screen that is not on top follows the state through `useDeferredValue` instead.
 * The urgent pass hands it the value it already had — same object, so React skips the
 * subtree outright — and it catches up in a low-priority pass after the paint, which
 * React is free to interrupt and to coalesce. A burst of edits (dragging the chip-mix
 * slider) therefore costs the background screens ONE render instead of one per step,
 * and it costs the tap nothing at all.
 *
 * Deliberately not `<Activity>`, which would also do this: hiding an Activity unmounts
 * the effects inside it, and the Table tab holds the wake lock and the level-end
 * notification precisely so they keep running while the phone is on another tab.
 */
export function ScreenStore({ live, children }: { live: boolean; children: ReactNode }) {
  const { state, dispatch, storageFull } = useStore();
  const deferred = useDeferredValue(state);
  const seen = live ? state : deferred;
  const value = useMemo(() => ({ state: seen, dispatch, storageFull }), [seen, dispatch, storageFull]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export { defaultBlinds };
