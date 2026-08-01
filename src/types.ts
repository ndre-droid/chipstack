// Domain model for ChipStack

export type ChipShape = 'chip' | 'plaque';

export interface Denomination {
  id: string;
  value: number;        // face value in chip-units (e.g. 1, 5, 25, 100)
  color: string;        // primary body colour (hex)
  accent: string;       // art-deco line / edge accent colour (hex)
  count: number;        // total number of these you own
  enabled: boolean;     // included by default when building stacks
  shape?: ChipShape;    // 'chip' (round, default) or 'plaque' (rectangular)
  minPerPlayer?: number; // force at least this many per player's stack (0 = no min)
  maxPerPlayer?: number; // cap per player's stack (0 = never use; undefined = unlimited)
}

export interface BlindLevel {
  id: string;
  smallBlind: number;   // in chip-units
  bigBlind: number;     // in chip-units
  ante: number;         // in chip-units (0 = none)
}

export type Appearance = 'system' | 'light' | 'dark';
export type AccentId = 'amber' | 'gold' | 'emerald' | 'cyan' | 'cobalt' | 'violet' | 'crimson' | 'coral';
export type Skin = 'minimal' | 'casino' | 'playful' | 'scifi';
export type ChipArt = 'deco' | 'classic' | 'diamond' | 'sunburst';

export type { ChipCalibration } from './lib/chipVision/types';

export interface Settings {
  unitValue: number;        // real money value of 1 chip-unit (default 0.01)
  currency: string;         // symbol, e.g. "€"
  defaultSmallBlind: number; // small blind used for new sessions / suggested ladders
  defaultBigBlind: number;
  minutesPerLevel: number;  // blind-timer length per level
  skin: Skin;               // overall visual style (minimal / casino / playful / scifi)
  accents: Record<Skin, AccentId>; // accent colour per style
  tvSkin: Skin | 'match';   // TV-broadcast style; 'match' follows the phone skin
  tvQuips: boolean;         // show the rotating cheeky sayings on the TV
  tvCustomQuips: string[];  // the user's own sayings, added to the rotation
  tvShowPlayers: boolean;   // show the live players roster on the TV
  tvShowPayouts: boolean;   // show the prize-pool payout split on the TV
  tvShowBustOrder: boolean; // show the knocked-out / finish order on the TV
  breakMinutes: number;     // length of a break, in minutes (default 5)
  breakEvery: number;       // auto-break every N levels (0 = off)
  tvBackground: string | null; // optional custom TV background image (data URL)
  tvBackgroundFocus: { x: number; y: number } | null; // salience focal point (0..100%) for smart placement
  tvBackgroundTone: number | null; // mean luminance 0..1 of the background, drives scrim strength
  appearance: Appearance;   // system / light / dark — applies to the minimal skin
  chipArt: ChipArt;         // chip face art style
  chipCalibration?: import('./lib/chipVision/types').ChipCalibration; // per-device, NOT synced
  chipCountMode?: 'device' | 'ai'; // photo chip-count engine; 'ai' = cloud vision. Per-device, NOT synced
  aiVisionKey?: string;            // Google Gemini API key — on-device only, NEVER synced
  language: 'en' | 'de';
  /** Tournament: fixed prize pool, rising blinds, payout split + bust leaderboard.
   *  Cash: chips = money, blinds fixed (timer optional), players cash out anytime and
   *  that money leaves the table ("on the table" = buy-ins − cash-outs). */
  gameMode: 'tournament' | 'cash';
  /** Cash game only: whether the blind timer/ladder runs. Off = a single fixed level. */
  cashUseTimer: boolean;
  /** Show the computed starting-stack breakdown as an overlay on the big screen. */
  tvShowStartStack: boolean;
  /** Knockout bounty (tournament): every player pays `bountyAmount` on top of the
   *  buy-in; whoever eliminates them collects it. */
  bountyMode: boolean;
  bountyAmount: number;
  /** Optional free custom accent colour (hex). Overrides the 8 presets when set. */
  customAccent: string | null;
  /** Custom entries added to the "who drinks?" penalty spinner + break house rules. */
  tvPenalties: string[];
  tvHouseRules: string[];
  /** This device is designated the big screen: it boots straight into TV mode,
   *  advertises a pairing code, and a phone connects to it. Per-device (never
   *  synced or shared), so only the actual TV carries it. */
  deviceIsTv: boolean;
  /** Live Session (cloud sync): 'tv' = this device shows a pairing code, owns the
   *  clock and mirrors the phone's data once paired; 'host' = the phone that typed
   *  the code, pushing data + sending clock commands. Null when not in a session. */
  liveSessionCode: string | null;
  liveSessionRole: 'host' | 'tv' | null;
}

export interface SessionConfig {
  playerCount: number;    // how many players at the table
  buyIn: number;          // money
  earlyRebuys: number;    // rebuys at the buy-in amount & starting blinds (need small chips too)
  lateRebuyAmount: number; // later, larger rebuy amount (at higher blinds)
  blindLevels: BlindLevel[];
  smallBias: number;      // 0..1 slider — higher = maximise chip use
  maxDenoms: number;      // limit distinct chip values used (0 = use all)
  useAllChips: boolean;   // include every owned chip type, even ones that don't fit the blind neatly
}

export interface Preset {
  id: string;
  name: string;
  denominations: Denomination[];
  session: SessionConfig;
  settings: Settings;
}

/** A player in the cash/settle ledger, tracked through the night. */
export interface LedgerPlayer {
  id: string;
  name: string;
  buyIn: number;   // total money bought in (sum of buy-ins + rebuys)
  cashOut: number; // final chip value cashed out
  out?: boolean;   // busted / eliminated this game (drives "players left" + struck-through on the TV)
  outAt?: number;  // epoch ms of elimination — orders the bust-out / finish leaderboard
  chips?: number;  // current live chip count (in chip-units) — optional, drives the TV chip-leader crown
  emoji?: string;  // optional avatar emoji shown next to the name
  knockouts?: number; // knockout bounties won (count) — earnings = knockouts × bountyAmount
}

/** One finished game night, snapshotted into the season league. */
export interface LeagueGame {
  id: string;
  date: number;    // epoch ms the night was saved
  mode: 'tournament' | 'cash';
  currency: string;
  players: { name: string; buyIn: number; cashOut: number }[];
}

/** A memorable hand / moment logged during the night, rotated on the TV. */
export interface Moment {
  id: string;
  text: string;
  at: number;      // epoch ms
}

export interface AppState {
  denominations: Denomination[];
  settings: Settings;
  session: SessionConfig;
  presets: Preset[];
  ledger: LedgerPlayer[];
  league: LeagueGame[];
  moments: Moment[];
}
