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
}

export interface LiveDoc {
  data: LiveData;
  clock: ClockState;
}

export { firebaseConfigured };

export function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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
  };
}

/** Host (phone): create the shared session document. */
export async function hostCreate(code: string, state: AppState, clock: ClockState): Promise<void> {
  await setDoc(sessionRef(code), { data: dataOf(state), clock, updatedAt: serverTimestamp() });
}

/**
 * Host (phone): make sure the session document actually exists on the server.
 * Self-heals the case where a `host` code was persisted in localStorage from an
 * earlier run but its server document is gone — without which the TV's join reads
 * "code not found". Creates the doc (with a fresh clock) only if it's missing; an
 * existing doc's clock is left untouched.
 */
export async function hostEnsureExists(code: string, state: AppState, clock: ClockState): Promise<void> {
  const ref = sessionRef(code);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { data: dataOf(state), clock, updatedAt: serverTimestamp() });
  }
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
