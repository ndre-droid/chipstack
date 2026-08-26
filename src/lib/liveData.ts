import type { AppState, Denomination, SessionConfig, LedgerPlayer, Skin, AccentId, ChipArt, Moment, CountingProgress, TvLayout, TvTextScale } from '../types';
import { DEFAULT_TV_TEXT_SCALE } from './tvLayout';

/**
 * The shape + selectors for the slice of app state the host phone pushes and the
 * TV mirrors. Kept in its OWN module — deliberately free of any `firebase/*`
 * import — so `useLiveHostSync` can import `liveSignature` statically without
 * pulling the Firebase SDK into the main bundle. The firestore read/write helpers
 * live in `liveSession.ts` (dynamically imported only when a session exists).
 */
export interface LiveData {
  denominations: Denomination[];
  session: SessionConfig;
  ledger: LedgerPlayer[];
  currency: string;
  unitValue: number;
  /** the background photo's smart-placement analysis. The image ITSELF is not in
   *  here — see `backgroundOf` and the `assets/background` document. */
  tvBackgroundFocus: { x: number; y: number } | null;
  tvBackgroundTone: number | null;
  /** TV look + behaviour the host controls remotely (design, timer length, toggles) */
  minutesPerLevel: number;
  skin: Skin;
  tvSkin: Skin | 'match';
  accents: Record<Skin, AccentId>;
  tvQuips: boolean;
  tvCustomQuips: string[];
  tvShowPlayers: boolean;
  /** roster order on the TV: seat order, biggest stack or biggest profit first */
  tvRosterSort: 'seat' | 'chips' | 'profit';
  tvShowPayouts: boolean;
  tvShowBustOrder: boolean;
  breakMinutes: number;
  breakEvery: number;
  /** app language — so the TV mirrors the phone's language (labels + number grouping) */
  language: 'en' | 'de';
  /** tournament vs cash game — reshapes the TV (pool label, payouts/bust visibility) */
  gameMode: 'tournament' | 'cash';
  cashUseTimer: boolean;
  /** show the starting-stack breakdown overlay on the big screen */
  tvShowStartStack: boolean;
  /** chip face art style — so the TV's chips match the phone's choice */
  chipArt: ChipArt;
  /** knockout bounty (tournament) — earnings shown on the TV roster */
  bountyMode: boolean;
  bountyAmount: number;
  /** the profit/loss trend line — the TV follows the phone's choice */
  showTrend: boolean;
  /** custom prize-pool split; null = the default for the field size */
  payoutSplit: number[] | null;
  /** last level you can still buy in during; 0 = no window */
  lateRegLevels: number;
  /** free custom accent colour (hex) — overrides the presets on the TV too */
  customAccent: string | null;
  /** custom penalty spinner entries + break house rules */
  tvPenalties: string[];
  tvHouseRules: string[];
  /** where the big screen's panels sit, and how big each piece of its text is. The
   *  TV has no pointer to arrange itself with, so both are dragged/dialled in on the
   *  phone and mirrored. Null layout = the stock three columns. */
  tvLayout: TvLayout | null;
  tvTextScale: TvTextScale;
  /** logged hand-of-the-night moments, rotated on the TV */
  moments: Moment[];
  /** a counting round in progress on the phone — the TV shows how far around the table it is */
  counting: CountingProgress | null;
}

export function dataOf(state: AppState): LiveData {
  return {
    denominations: state.denominations,
    session: state.session,
    ledger: state.ledger,
    currency: state.settings.currency,
    unitValue: state.settings.unitValue,
    tvBackgroundFocus: state.settings.tvBackgroundFocus ?? null,
    tvBackgroundTone: state.settings.tvBackgroundTone ?? null,
    minutesPerLevel: state.settings.minutesPerLevel,
    skin: state.settings.skin,
    tvSkin: state.settings.tvSkin,
    accents: state.settings.accents,
    tvQuips: state.settings.tvQuips,
    tvCustomQuips: state.settings.tvCustomQuips ?? [],
    tvShowPlayers: state.settings.tvShowPlayers ?? true,
    tvRosterSort: state.settings.tvRosterSort ?? 'seat',
    tvShowPayouts: state.settings.tvShowPayouts ?? false,
    tvShowBustOrder: state.settings.tvShowBustOrder ?? false,
    breakMinutes: state.settings.breakMinutes ?? 5,
    breakEvery: state.settings.breakEvery ?? 0,
    language: state.settings.language ?? 'en',
    gameMode: state.settings.gameMode ?? 'tournament',
    cashUseTimer: state.settings.cashUseTimer ?? false,
    tvShowStartStack: state.settings.tvShowStartStack ?? false,
    chipArt: state.settings.chipArt ?? 'deco',
    bountyMode: state.settings.bountyMode ?? false,
    bountyAmount: state.settings.bountyAmount ?? 5,
    showTrend: state.settings.showTrend ?? true,
    payoutSplit: state.settings.payoutSplit ?? null,
    lateRegLevels: state.settings.lateRegLevels ?? 0,
    customAccent: state.settings.customAccent ?? null,
    tvPenalties: state.settings.tvPenalties ?? [],
    tvHouseRules: state.settings.tvHouseRules ?? [],
    tvLayout: state.settings.tvLayout ?? null,
    tvTextScale: state.settings.tvTextScale ?? DEFAULT_TV_TEXT_SCALE,
    moments: state.moments ?? [],
    counting: state.counting ?? null,
  };
}

/**
 * The big-screen background image, as a data URL. It travels in its OWN document
 * rather than in `LiveData`: it is by far the biggest thing the TV mirrors (a
 * photo is a few hundred kB of base64 against a couple of kB for everything else),
 * a Firestore document caps at 1 MiB, and a merge write re-sends the whole map —
 * so leaving it in `data` meant every rename and every rebuy pushed the photo
 * across the phone's connection again.
 */
export function backgroundOf(state: AppState): string | null {
  return state.settings.tvBackground ?? null;
}

/**
 * A short string that changes iff something the TV mirrors changes. Used by the
 * host-sync hook to decide when to push, without maintaining a hand-written list
 * of dependencies (the source of the old "some changes never reached the TV" bug).
 */
export function liveSignature(state: AppState): string {
  return JSON.stringify(dataOf(state));
}

/**
 * The same idea for the background image, which is pushed separately. Sampling
 * start/middle/end keeps a long data URL cheap to compare while still telling two
 * different photos apart; the generated SVG presets share a prefix AND a length,
 * which is why the length alone is not enough (switching preset never reached the
 * TV back when this was a plain length check).
 */
export function backgroundSignature(state: AppState): string {
  const raw = backgroundOf(state);
  if (!raw) return '';
  if (raw.length < 50000) return raw;
  const mid = raw.length >> 1;
  return `${raw.length}:${raw.slice(0, 32)}:${raw.slice(mid, mid + 32)}:${raw.slice(-32)}`;
}
