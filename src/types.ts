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
  /** How the TV orders the players roster: seat order (as entered), biggest stack
   *  first, or biggest profit first. Busted / cashed-out players always sink to
   *  the bottom of a sorted list. */
  tvRosterSort: 'seat' | 'chips' | 'profit';
  tvShowPayouts: boolean;   // show the prize-pool payout split on the TV
  tvShowBustOrder: boolean; // show the knocked-out / finish order on the TV
  breakMinutes: number;     // length of a break, in minutes (default 5)
  breakEvery: number;       // auto-break every N levels (0 = off)
  tvBackground: string | null; // optional custom TV background image (data URL)
  tvBackgroundFocus: { x: number; y: number } | null; // salience focal point (0..100%) for smart placement
  tvBackgroundTone: number | null; // mean luminance 0..1 of the background, drives scrim strength
  appearance: Appearance;   // system / light / dark — applies to the minimal skin
  chipArt: ChipArt;         // chip face art style
  language: 'en' | 'de';
  /** Tournament: fixed prize pool, rising blinds, payout split + bust leaderboard.
   *  Cash: chips = money, blinds fixed (timer optional), players cash out anytime and
   *  that money leaves the table ("on the table" = buy-ins − cash-outs). */
  gameMode: 'tournament' | 'cash';
  /** Cash game only: whether the blind timer/ladder runs. Off = a single fixed level. */
  cashUseTimer: boolean;
  /** How a stack is entered mid-game. 'money' (the default) types the euro amount
   *  straight in — the fastest thing at a real table; 'colours' tallies the stack
   *  chip by chip. Per-device preference, remembered between rounds. */
  countMode: 'money' | 'colours';
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
  /** Big-screen zoom factor (1 = the TV-tuned default). A laptop used as the big
   *  screen needs everything larger; null means "work it out from the device".
   *  Per-device like `deviceIsTv` — never synced, so the phone can't shrink the
   *  laptop's display. */
  tvScale: number | null;
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
  /** chip ids the user took out of the stack on the Plan tab */
  excludedDenoms: string[];
  /** which blind level the starting stack is built for (index into blindLevels) */
  startLevelIdx: number;
  /**
   * Hand-tuned per-chip counts from the Plan tab's fine-tune editor, with a
   * signature of the inputs they were tuned against (see lib/startingStack.ts).
   * Lives in the session — and therefore in LiveData — so the TV shows the stack
   * the user actually picked, not a freshly recomputed one.
   */
  stackOverride: { key: string; counts: Record<string, number> } | null;
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
  /** one entry per counting round, oldest first, capped — drives the stack sparkline */
  chipHistory?: { at: number; chips: number }[];
  emoji?: string;  // optional avatar emoji shown next to the name
  knockouts?: number; // knockout bounties won (count) — earnings = knockouts × bountyAmount
}

/** A counting round in progress, so the big screen can show how far around the table it is. */
export interface CountingProgress {
  index: number;   // 1-based position of the player being counted
  total: number;
  name: string;
  emoji?: string;
  at: number;      // epoch ms — the TV ignores a stale progress (phone closed the sheet mid-round)
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
  /** live counting-round progress, mirrored to the TV; null when nobody is counting */
  counting: CountingProgress | null;
  league: LeagueGame[];
  moments: Moment[];
}
