import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, firebaseConfigured } from './firebaseConfig';

let db: Firestore | null = null;

function getApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

/** Lazily creates the Firestore client. Returns null when unconfigured. */
export function getDb(): Firestore | null {
  if (!firebaseConfigured) return null;
  if (!db) db = getFirestore(getApp());
  return db;
}

let authPromise: Promise<string | null> | null = null;

/**
 * Sign this device in anonymously and return its uid.
 *
 * There are no accounts in ChipStack and there shouldn't be — you pair a TV by
 * typing four digits, not by logging in. But those four digits were also the only
 * thing standing between a session and the whole internet: 9000 codes is minutes of
 * guessing, and the old rules let any guess overwrite or DELETE a live table.
 *
 * An anonymous uid costs the user nothing (no prompt, no data, granted silently)
 * and gives the rules something real to check: the screen that created a session
 * and the phone that first claimed it are the only two devices that may write to
 * it. See `firestore.rules`.
 *
 * Degrades on purpose: if anonymous sign-in is unavailable — the provider is not
 * enabled in the Firebase console yet, or the device is offline — this resolves to
 * null and the write is attempted anyway, which still works against the older,
 * looser rules. Live sync failing closed would be a worse outcome than it failing
 * open during the changeover.
 */
export async function ensureAuth(): Promise<string | null> {
  if (!firebaseConfigured) return null;
  if (!authPromise) {
    authPromise = (async () => {
      try {
        const { getAuth, signInAnonymously } = await import('firebase/auth');
        const auth = getAuth(getApp());
        if (auth.currentUser) return auth.currentUser.uid;
        const cred = await signInAnonymously(auth);
        return cred.user.uid;
      } catch {
        return null;
      }
    })();
  }
  return authPromise;
}

export { firebaseConfigured };
