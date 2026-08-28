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
/** How chips are drawn everywhere in the app. See `Settings.chipStyle`. */
export type ChipStyle = 'vector' | 'render3d';
/** Where a stack is allowed to grow and shrink by dropping chips. See `Settings.chipAnim`. */
export type ChipAnim = 'off' | 'plan' | 'all';

/* --- the big screen's arrangement (helpers + defaults live in lib/tvLayout) --- */

/** The movable pieces of the big screen. */
export type TvPanelId = 'stats' | 'roster' | 'bust' | 'clock' | 'legend' | 'payouts';
/** One panel's place on the TV grid: 1-based top-left cell plus how many it spans. */
export interface TvSlot {
  col: number;
  row: number;
  w: number;
  h: number;
}
export type TvLayout = Record<TvPanelId, TvSlot>;
/** The pieces of TV text that can be sized by hand, on top of the layout's own sizing. */
export type TvTextRole = 'clock' | 'blinds' | 'level' | 'players' | 'legend' | 'stats' | 'quips';
export type TvTextScale = Record<TvTextRole, number>;

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
  /** How the PHONE roster is ordered. Deliberately separate from `tvRosterSort`:
   *  sorting your own list to find somebody should not reshuffle the big screen
   *  in front of the whole table. Per-device, never synced. */
  rosterSort: 'seat' | 'chips' | 'profit';
  tvShowPayouts: boolean;   // show the prize-pool payout split on the TV
  tvShowBustOrder: boolean; // show the knocked-out / finish order on the TV
  breakMinutes: number;     // length of a break, in minutes (default 5)
  /** Wall-clock time to break at, "HH:MM", or null. Level-based breaks answer
   *  "every N levels"; this answers "the pizza gets here at ten", which is the
   *  version a home game actually plans around. Fires once, then clears itself. */
  breakAt: string | null;
  /** Fire a notification when the level runs out. Off by default — it needs a
   *  permission, and asking for one before the user wants the feature is rude. */
  levelAlerts: boolean;
  breakEvery: number;       // auto-break every N levels (0 = off)
  tvBackground: string | null; // optional custom TV background image (data URL)
  tvBackgroundFocus: { x: number; y: number } | null; // salience focal point (0..100%) for smart placement
  tvBackgroundTone: number | null; // mean luminance 0..1 of the background, drives scrim strength
  appearance: Appearance;   // system / light / dark — applies to the minimal skin
  chipArt: ChipArt;         // chip face art style
  /** How a chip is drawn: 'vector' is the hand-built SVG chip; 'render3d' renders
   *  the real 3D model (public/models/chip.glb) once per colour and reuses the
   *  bitmap. Per-device — whether a device can afford WebGL is not part of a setup,
   *  and a phone must not be able to switch the TV's renderer. */
  chipStyle: ChipStyle;
  /** Where chips drop into the pile when a stack changes: nowhere, the Plan screen
   *  only (default — that is where the chip-mix slider moves stacks while you watch),
   *  or every chip spread. Per-device: it is a matter of taste and of what the phone
   *  can afford, not part of a setup. */
  chipAnim: ChipAnim;
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
  /** Show the little profit/loss trend line next to a player, on the phone roster
   *  and on the TV. One counting round is one point; off hides it everywhere. */
  showTrend: boolean;
  /** Tournament: the last blind level during which somebody can still buy in.
   *  0 = no late registration window (the default). Shown on the phone and the TV
   *  so nobody has to remember whether the door is still open. */
  lateRegLevels: number;
  /** How the prize pool is split, as shares of 1 (e.g. [0.5, 0.3, 0.2]). Null uses
   *  the default for the field size — see lib/payouts.ts. Synced to the TV. */
  payoutSplit: number[] | null;
  /** Optional free custom accent colour (hex). Overrides the 8 presets when set. */
  customAccent: string | null;
  /** Custom entries added to the "who drinks?" penalty spinner + break house rules. */
  tvPenalties: string[];
  tvHouseRules: string[];
  /** Where the big screen's panels sit on its grid (see lib/tvLayout). `null` means
   *  it has never been arranged, and the default three columns apply. Part of the
   *  SETUP, not of the device: the arrangement is dragged into place on the phone
   *  (or on a laptop previewing the big screen) and mirrored to the TV, which has no
   *  pointer to drag with. */
  tvLayout: TvLayout | null;
  /** Per-role text size on the big screen, as a multiplier on the size the layout
   *  already worked out. `tvScale` zooms everything at once; this is for "the clock
   *  is fine, the names are too small". Synced, for the same reason as `tvLayout`. */
  tvTextScale: TvTextScale;
  /** This screen was arranged ON this screen, so what the phone pushes is ignored.
   *  Arranging used to be hidden the moment a phone connected — the button was there
   *  on a standalone TV and gone on a paired one, which is exactly as confusing as it
   *  sounds — because the host's next push would have overwritten the edit. It can
   *  always be arranged now: a TV that arranges itself sets this and keeps its own
   *  layout, and "Reset arrangement" clears it and hands the screen back to the
   *  phone. Per-device (never synced or shared). */
  tvLayoutOwn: boolean;
  /** This screen was told to put the cast starting-stack away, and it stays away.
   *  `tvShowStartStack` is the PHONE's request and travels in LiveData, so a TV that
   *  simply cleared it had it pushed straight back on the host's next write — the
   *  overlay reappeared on its own, which is exactly what it looked like. The TV
   *  keeps its own answer here instead, and only a fresh request from the phone
   *  (off, then on again) clears it. Per-device: a TV telling the phone what to stop
   *  casting is the phone's business, not the setup's. */
  tvStartStackHidden: boolean;
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
   *  the code, pushing data + sending clock commands; 'guest' = somebody at the
   *  table watching on their own phone, who can put their name in but changes
   *  nothing. Null when not in a session. */
  liveSessionCode: string | null;
  liveSessionRole: 'host' | 'tv' | 'guest' | null;
  /** A guest's own name and avatar, so the join screen remembers them next week. */
  guestName: string | null;
  guestEmoji: string | null;
  /** When the first-run setup was finished or skipped. `null` means it has never
   *  run, which is the only thing that shows it — an install that predates the
   *  wizard is treated as done, not asked three questions about its own table. */
  onboardedAt: number | null;
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
   * The amount the Table tab's stack card is currently showing chips for.
   *
   * Null (the default) means the buy-in — the starting stack, which is what the card
   * is for before anybody has rebought. Set to anything else it becomes a HANDOUT:
   * the chips to push across for a €40 top-up at the blinds being played now,
   * without touching the buy-in the whole plan is built on. It lives in the session
   * — and so in LiveData — because the big screen mirrors whatever the card is
   * showing (see lib/startingStack.ts, `handoutStack`).
   */
  handoutAmount?: number | null;
  /**
   * Which blind level that stack is built for (index into `blindLevels`), or null
   * for "the one being played" — the starting level on the Plan tab, the clock's
   * level on the Table tab. Only ever pins the card FURTHER ahead: see
   * `handoutLevelOf`. Lives in the session so the card, the Table tab and the big
   * screen all show one stack instead of three.
   */
  handoutLevelIdx?: number | null;
  /**
   * Hand-tuned per-chip counts from the Plan tab's fine-tune editor, with a
   * signature of the inputs they were tuned against (see lib/startingStack.ts).
   * Lives in the session — and therefore in LiveData — so the TV shows the stack
   * the user actually picked, not a freshly recomputed one.
   */
  stackOverride: { key: string; counts: Record<string, number> } | null;
}

/**
 * A named box of chips. `AppState.denominations` is always the ACTIVE set's chips —
 * everything in the app reads that one field, so adding sets stayed a small change:
 * switching writes the current chips back into their set and loads the other one.
 */
export interface ChipSet {
  id: string;
  name: string;
  denominations: Denomination[];
}

export interface Preset {
  id: string;
  name: string;
  denominations: Denomination[];
  session: SessionConfig;
  /** Deliberately partial: a saved setup carries the shareable settings only —
   *  never this device's identity or its live session (see lib/settingsScope). */
  settings: Partial<Settings>;
}

/**
 * Somebody who plays at this table — saved once, seated in one tap every week.
 *
 * Kept apart from `LedgerPlayer` on purpose: the ledger row is what happened on ONE
 * night (buy-ins, stack, cash-out) and gets cleared with the night, while the person
 * outlives it. Before this, every regular was retyped from scratch every time.
 */
export interface Person {
  id: string;
  name: string;
  emoji?: string;
  /** Where they want to be paid: a payment link, a handle, or an IBAN. Free text —
   *  the app only ever shows or copies it, it never sends money anywhere. */
  payment?: string;
  /** epoch ms of the last night they were seated for, newest first in the picker */
  lastPlayedAt?: number;
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
  /** The stack (in chip-units) they held the moment their LAST buy-in landed — the
   *  baseline for "how are they doing with the money they put in most recently".
   *  `buyIn` is cumulative, so a player who rebought after busting reads as deeply
   *  down even while winning with the new stack; this is the other half of that
   *  story. Undefined on rows from before this was tracked. */
  stakeChips?: number;
  emoji?: string;  // optional avatar emoji shown next to the name
  knockouts?: number; // knockout bounties won (count) — earnings = knockouts × bountyAmount
  /** links this night's row back to the saved Person it was seated from */
  personId?: string;
}

/** A counting round in progress, so the big screen can show how far around the table it is. */
export interface CountingProgress {
  index: number;   // 1-based position of the player being counted
  total: number;
  name: string;
  emoji?: string;
  at: number;      // epoch ms — the TV ignores a stale progress (phone closed the sheet mid-round)
}

/**
 * Money still owed from an earlier night.
 *
 * Home games rarely settle to the cent on the night — somebody has no cash, somebody
 * leaves early. Carrying the result forward means next week's "who pays whom" nets
 * the whole thing out instead of everyone keeping a private tally.
 */
export interface CarryBalance {
  id: string;
  name: string;
  personId?: string;
  /** positive = they are owed this much, negative = they owe it */
  amount: number;
  since: number;
}

/** One finished game night, snapshotted into the season league. */
export interface LeagueGame {
  id: string;
  date: number;    // epoch ms the night was saved
  mode: 'tournament' | 'cash';
  currency: string;
  players: { name: string; buyIn: number; cashOut: number }[];
}

/**
 * One thing that happened tonight, in order.
 *
 * Settles the two arguments a home game always has — "did I rebuy twice or three
 * times?" and "when did she actually go out?" — and doubles as the raw material for
 * the end-of-night recap. Recorded in the reducer so every path that changes the
 * money is covered, including the ones that go through the player sheet.
 */
export interface TimelineEvent {
  id: string;
  at: number;
  kind: 'join' | 'buyin' | 'cashout' | 'bust' | 'count' | 'level';
  name?: string;
  emoji?: string;
  /** money for buyin/cashout, chip-units for count, level number for level */
  amount?: number;
}

/** A memorable hand / moment logged during the night, rotated on the TV. */
export interface Moment {
  id: string;
  text: string;
  at: number;      // epoch ms
}

export interface AppState {
  /** the ACTIVE chip set's denominations — see ChipSet */
  denominations: Denomination[];
  chipSets: ChipSet[];
  activeChipSetId: string | null;
  /** the regulars — see Person */
  people: Person[];
  /** who sat down last time, so a new night is one tap. Names are kept alongside the
   *  ids so a line-up still reads correctly after a person has been deleted. */
  lastLineup: { personId?: string; name: string; emoji?: string }[];
  settings: Settings;
  session: SessionConfig;
  presets: Preset[];
  ledger: LedgerPlayer[];
  /** live counting-round progress, mirrored to the TV; null when nobody is counting */
  counting: CountingProgress | null;
  league: LeagueGame[];
  moments: Moment[];
  /** unsettled results carried over from earlier nights — see CarryBalance */
  carry: CarryBalance[];
  /** what happened tonight, oldest first — see TimelineEvent */
  timeline: TimelineEvent[];
}
