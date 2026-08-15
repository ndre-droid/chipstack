import type { AppState, Denomination, SessionConfig, LedgerPlayer, Skin, AccentId, ChipArt, Moment, CountingProgress } from '../types';

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
  /** big-screen background photo + its smart-placement analysis, so a phone upload shows on the TV */
  tvBackground: string | null;
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
  /** free custom accent colour (hex) — overrides the presets on the TV too */
  customAccent: string | null;
  /** custom penalty spinner entries + break house rules */
  tvPenalties: string[];
  tvHouseRules: string[];
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
    tvBackground: state.settings.tvBackground ?? null,
    tvBackgroundFocus: state.settings.tvBackgroundFocus ?? null,
    tvBackgroundTone: state.settings.tvBackgroundTone ?? null,
    minutesPerLevel: state.settings.minutesPerLevel,
    skin: state.settings.skin,
    tvSkin: state.settings.tvSkin,
    accents: state.settings.accents,
    tvQuips: state.settings.tvQuips,
    tvCustomQuips: state.settings.tvCustomQuips ?? [],
    tvShowPlayers: state.settings.tvShowPlayers ?? true,
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
    customAccent: state.settings.customAccent ?? null,
    tvPenalties: state.settings.tvPenalties ?? [],
    tvHouseRules: state.settings.tvHouseRules ?? [],
    moments: state.moments ?? [],
    counting: state.counting ?? null,
  };
}

/**
 * A short string that changes iff something the TV mirrors changes. Used by the
 * host-sync hook to decide when to push, without maintaining a hand-written list
 * of dependencies (the source of the old "some changes never reached the TV" bug).
 * The background photo can be a large data URL, so it's proxied by length rather
 * than stringified in full on every render.
 */
export function liveSignature(state: AppState): string {
  const d = dataOf(state);
  const raw = d.tvBackground;
  // The generated SVG presets differ only by a few colour values, so a
  // length + first-24-chars proxy collides between them (they share a prefix and
  // an identical length) — that was why switching presets never reached the TV.
  // Include small backgrounds (the presets) in FULL; only large photo uploads are
  // proxied, and then by sampling start+middle+end so different photos still differ.
  const bg = !raw
    ? ''
    : raw.length < 50000
      ? raw
      : `${raw.length}:${raw.slice(0, 32)}:${raw.slice(raw.length >> 1, (raw.length >> 1) + 32)}:${raw.slice(-32)}`;
  return JSON.stringify({ ...d, tvBackground: bg });
}
