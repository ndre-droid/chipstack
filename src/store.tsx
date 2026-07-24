import { createContext, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { AppState, Denomination, BlindLevel, Preset, Settings, SessionConfig, LedgerPlayer, AccentId, Skin } from './types';

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
  accents: { minimal: 'amber', casino: 'gold', playful: 'coral', scifi: 'cyan' },
  tvSkin: 'match',
  tvQuips: true,
  tvCustomQuips: [],
  tvShowPlayers: true,
  tvShowPayouts: false,
  tvShowBustOrder: false,
  breakMinutes: 5,
  breakEvery: 0,
  tvBackground: null,
  tvBackgroundFocus: null,
  tvBackgroundTone: null,
  appearance: 'dark',
  chipArt: 'deco',
  language: 'en',
  liveSessionCode: null,
  liveSessionRole: null,
};

const SKINS = ['minimal', 'casino', 'playful', 'scifi'];
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
};

const initialState: AppState = {
  denominations: defaultDenoms(),
  settings: defaultSettings,
  session: defaultSession,
  presets: [],
  ledger: [],
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
  | { type: 'IMPORT_SETUP'; denominations: Denomination[]; session: SessionConfig; settings: Settings }
  | {
      type: 'LIVE_APPLY_REMOTE';
      denominations: Denomination[];
      session: SessionConfig;
      ledger: LedgerPlayer[];
      currency: string;
      unitValue: number;
      tvBackground?: string | null;
      tvBackgroundFocus?: { x: number; y: number } | null;
      tvBackgroundTone?: number | null;
      minutesPerLevel?: number;
      skin?: Skin;
      tvSkin?: Skin | 'match';
      accents?: Record<Skin, AccentId>;
      tvQuips?: boolean;
      tvCustomQuips?: string[];
      tvShowPlayers?: boolean;
      tvShowPayouts?: boolean;
      tvShowBustOrder?: boolean;
      breakMinutes?: number;
      breakEvery?: number;
    }
  | { type: 'LEDGER_ADD'; name?: string }
  | { type: 'LEDGER_ADD_MANY'; n: number }
  | { type: 'LEDGER_UPDATE'; id: string; patch: Partial<LedgerPlayer> }
  | { type: 'LEDGER_REMOVE'; id: string }
  | { type: 'LEDGER_CLEAR' }
  | { type: 'RESET' };

function reducer(state: AppState, action: Action): AppState {
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
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
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
        settings: JSON.parse(JSON.stringify(state.settings)),
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
        settings: JSON.parse(JSON.stringify(p.settings)),
      };
    }
    case 'DELETE_PRESET':
      return { ...state, presets: state.presets.filter((p) => p.id !== action.id) };
    case 'IMPORT_SETUP':
      return {
        ...state,
        denominations: action.denominations,
        session: { ...defaultSession, ...action.session },
        settings: { ...defaultSettings, ...action.settings },
      };
    case 'LIVE_APPLY_REMOTE':
      return {
        ...state,
        denominations: action.denominations,
        session: action.session,
        ledger: action.ledger,
        settings: {
          ...state.settings,
          currency: action.currency,
          unitValue: action.unitValue,
          // The host owns the big-screen photo so a phone upload shows on the TV.
          ...(action.tvBackground !== undefined ? { tvBackground: action.tvBackground } : {}),
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
          ...(action.tvShowPayouts !== undefined ? { tvShowPayouts: action.tvShowPayouts } : {}),
          ...(action.tvShowBustOrder !== undefined ? { tvShowBustOrder: action.tvShowBustOrder } : {}),
          ...(action.breakMinutes !== undefined ? { breakMinutes: action.breakMinutes } : {}),
          ...(action.breakEvery !== undefined ? { breakEvery: action.breakEvery } : {}),
        },
      };
    case 'LEDGER_ADD':
      return {
        ...state,
        ledger: [
          ...state.ledger,
          { id: uid(), name: action.name || `Player ${state.ledger.length + 1}`, buyIn: state.session.buyIn, cashOut: 0 },
        ],
      };
    case 'LEDGER_ADD_MANY': {
      const add: LedgerPlayer[] = [];
      for (let i = 0; i < action.n; i++)
        add.push({ id: uid(), name: `Player ${state.ledger.length + add.length + 1}`, buyIn: state.session.buyIn, cashOut: 0 });
      return { ...state, ledger: [...state.ledger, ...add] };
    }
    case 'LEDGER_UPDATE':
      return { ...state, ledger: state.ledger.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) };
    case 'LEDGER_REMOVE':
      return { ...state, ledger: state.ledger.filter((p) => p.id !== action.id) };
    case 'LEDGER_CLEAR':
      return { ...state, ledger: [] };
    case 'RESET':
      return {
        denominations: defaultDenoms(),
        settings: { ...defaultSettings },
        session: { ...defaultSession, blindLevels: defaultBlinds(10, 20) },
        presets: state.presets,
        ledger: state.ledger,
      };
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
function migrate(raw: string | null): AppState {
  if (!raw) return initialState;
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
  if (typeof settings.liveSessionCode !== 'string') settings.liveSessionCode = null;
  if (settings.liveSessionRole !== 'host' && settings.liveSessionRole !== 'tv') settings.liveSessionRole = null;
  const validAppear = ['system', 'light', 'dark'];
  if (!validAppear.includes(settings.appearance)) settings.appearance = 'dark';
  const validArt = ['deco', 'classic', 'diamond', 'sunburst'];
  if (!validArt.includes(settings.chipArt)) settings.chipArt = 'deco';

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
  if (!Array.isArray(session.blindLevels) || session.blindLevels.length === 0)
    session.blindLevels = defaultBlinds(settings.defaultSmallBlind, settings.defaultBigBlind);

  const presets = Array.isArray(parsed.presets) ? (parsed.presets as Preset[]) : [];
  const ledger = Array.isArray(parsed.ledger) ? (parsed.ledger as LedgerPlayer[]) : [];

  return { denominations, settings, session, presets, ledger };
}

const StoreContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      return migrate(localStorage.getItem(KEY));
    } catch {
      return initialState;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export { defaultBlinds };
