import { doc, setDoc, onSnapshot, getDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { getDb, firebaseConfigured } from './firebase';
import type { AppState } from '../types';
import type { ClockState } from './clockLogic';
import { dataOf, type LiveData } from './liveData';

export type { LiveData };

/** A Firestore server timestamp, once resolved. Null in the local echo before the
 *  server fills it in. Read via `.toMillis()` for freshness checks. */
interface FireTimestamp {
  toMillis: () => number;
}

export interface LiveDoc {
  /** null while the TV is advertising a code but no phone has connected yet. */
  data: LiveData | null;
  clock: ClockState;
  /** the TV heartbeat — bumped every few seconds while a TV is showing this
   *  session, so the host phone can tell a live TV from a dropped one. */
  tvSeenAt?: FireTimestamp | null;
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

/**
 * TV: bump the heartbeat so the host phone can tell this TV is alive. Called on a
 * short interval while a device is showing the big screen. Merge write, tiny.
 */
export async function tvHeartbeat(code: string): Promise<void> {
  await setDoc(sessionRef(code), { tvSeenAt: serverTimestamp() }, { merge: true });
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
