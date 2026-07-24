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
  tvBackground: string | null; // optional custom TV background image (data URL)
  appearance: Appearance;   // system / light / dark — applies to the minimal skin
  chipArt: ChipArt;         // chip face art style
  language: 'en' | 'de';
  /** Live Session (cloud sync): 'host' = this phone pushes data + sends clock commands;
   *  'tv' = this device owns the clock and mirrors incoming data. Set by whichever
   *  flow (Settings "Start" vs TvMode "Join") created the connection. */
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
}

export interface AppState {
  denominations: Denomination[];
  settings: Settings;
  session: SessionConfig;
  presets: Preset[];
  ledger: LedgerPlayer[];
}
