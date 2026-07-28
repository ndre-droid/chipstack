import { doc, setDoc, onSnapshot, getDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { getDb, firebaseConfigured } from './firebase';
import type { AppState, Denomination, SessionConfig, LedgerPlayer, Skin, AccentId } from '../types';
import type { ClockState } from './clockLogic';

/** The portion of app state the host phone pushes and the TV mirrors. */
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
}

export interface LiveDoc {
  /** null while the TV is advertising a code but no phone has connected yet. */
  data: LiveData | null;
  clock: ClockState;
}

export { firebaseConfigured };

/** Short 4-digit pairing code — big on the TV, quick to type on the phone. */
export function genCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function sessionRef(code: string) {
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured');
  return doc(db, 'sessions', code);
}

function dataOf(state: AppState): LiveData {
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
  };
}

/**
 * TV: make sure a pairing document exists and return the code to show on screen.
 * Reuses the TV's persisted code across reloads (recreating the doc if it expired)
 * so the code stays stable; otherwise picks an unused 4-digit code. The doc starts
 * with `data: null` — the TV shows its own local game until a phone connects and
 * fills `data` in.
 */
export async function tvEnsurePairing(existingCode: string | null, clock: ClockState): Promise<string> {
  if (existingCode) {
    const ref = sessionRef(existingCode);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { data: null, clock, updatedAt: serverTimestamp() });
    return existingCode;
  }
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const snap = await getDoc(sessionRef(code));
    if (!snap.exists()) {
      await setDoc(sessionRef(code), { data: null, clock, updatedAt: serverTimestamp() });
      return code;
    }
  }
  // extremely unlikely fallback: 8 codes all taken — accept a last one
  const code = genCode();
  await setDoc(sessionRef(code), { data: null, clock, updatedAt: serverTimestamp() });
  return code;
}

/**
 * Host (phone): push the latest players/rebuys/blinds/inventory — called on every
 * relevant change. Uses a merge write so it self-heals if the session document was
 * lost (e.g. the host reloaded after the doc expired) instead of failing forever.
 */
export async function hostPushData(code: string, state: AppState): Promise<void> {
  await setDoc(sessionRef(code), { data: dataOf(state), updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Either side: push a new clock state (play/pause/next/prev/break/auto-advance).
 * Merge write so a missing document is re-created rather than throwing — keeps the
 * phone remote working even after a reload.
 */
export async function pushClock(code: string, clock: ClockState): Promise<void> {
  await setDoc(sessionRef(code), { clock, updatedAt: serverTimestamp() }, { merge: true });
}

/** TV: verify a code exists before joining, so a mistyped code fails fast with a clear message. */
export async function checkCodeExists(code: string): Promise<boolean> {
  const snap = await getDoc(sessionRef(code));
  return snap.exists();
}

/** Subscribe to live updates for a session code. Returns an unsubscribe function. */
export function subscribeSession(code: string, onUpdate: (doc: LiveDoc) => void): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(doc(db, 'sessions', code), (snap) => {
    if (snap.exists()) onUpdate(snap.data() as LiveDoc);
  });
}
