import { doc, setDoc, updateDoc, onSnapshot, getDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { getDb, firebaseConfigured } from './firebase';
import type { AppState, Denomination, SessionConfig, LedgerPlayer } from '../types';
import type { ClockState } from './clockLogic';

/** The portion of app state the host phone pushes and the TV mirrors. */
export interface LiveData {
  denominations: Denomination[];
  session: SessionConfig;
  ledger: LedgerPlayer[];
  currency: string;
  unitValue: number;
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
  };
}

/** Host (phone): create the shared session document. */
export async function hostCreate(code: string, state: AppState, clock: ClockState): Promise<void> {
  await setDoc(sessionRef(code), { data: dataOf(state), clock, updatedAt: serverTimestamp() });
}

/** Host (phone): push the latest players/rebuys/blinds/inventory — called on every relevant change. */
export async function hostPushData(code: string, state: AppState): Promise<void> {
  await updateDoc(sessionRef(code), { data: dataOf(state), updatedAt: serverTimestamp() });
}

/** Either side: push a new clock state (play/pause/next/prev/break/auto-advance). */
export async function pushClock(code: string, clock: ClockState): Promise<void> {
  await updateDoc(sessionRef(code), { clock, updatedAt: serverTimestamp() });
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
