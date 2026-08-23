import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, firebaseConfigured } from './firebaseConfig';

let db: Firestore | null = null;

function getApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

/**
 * Lazily creates the Firestore client. Returns null when unconfigured.
 *
 * `ignoreUndefinedProperties` is NOT a nicety — it is a bug fix. The app models
 * "this player has no stack / never busted" as an absent field (`chips: undefined`,
 * `outAt: undefined`, `chipHistory: undefined`), which is exactly what resetting the
 * table writes into every row. `setDoc` REJECTS an undefined value outright, so a
 * single reset made every following push throw before it left the phone — the TV
 * stayed on the old table and the Table tab counted "not sent — retrying (9)"
 * forever, because the retry hit the same invalid payload every time. Telling the
 * SDK to drop undefined fields makes an absent value mean what it means everywhere
 * else in the app: not there.
 */
export function getDb(): Firestore | null {
  if (!firebaseConfigured) return null;
  if (!db) db = initializeFirestore(getApp(), { ignoreUndefinedProperties: true });
  return db;
}

let authPromise: Promise<string | null> | null = null;
/** when a failed sign-in may be attempted again (see `ensureAuth`) */
let authRetryAt = 0;
/** how long a failed sign-in is remembered before trying once more */
const AUTH_RETRY_MS = 5 * 60 * 1000;

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
 *
 * A FAILURE is only remembered for a few minutes, never for the life of the app: a
 * device that happened to be offline on its first push, or one running while the
 * provider is switched on in the console, would otherwise stay signed out until it
 * was force-quit — and once the strict rules are deployed, signed out means every
 * write is rejected forever.
 */
export async function ensureAuth(): Promise<string | null> {
  if (!firebaseConfigured) return null;
  if (!authPromise) {
    if (Date.now() < authRetryAt) return null;
    authPromise = (async () => {
      try {
        const { getAuth, signInAnonymously } = await import('firebase/auth');
        const auth = getAuth(getApp());
        if (auth.currentUser) return auth.currentUser.uid;
        const cred = await signInAnonymously(auth);
        return cred.user.uid;
      } catch {
        // don't hammer a provider that is switched off — but do try again later
        authRetryAt = Date.now() + AUTH_RETRY_MS;
        authPromise = null;
        return null;
      }
    })();
  }
  return authPromise;
}

/**
 * Forget the cached sign-in and allow an immediate retry. Called when a write comes
 * back `unauthenticated` / `permission-denied`: the token may simply have gone
 * stale, and retrying the same write with the same dead session would loop forever.
 */
export function resetAuth(): void {
  authPromise = null;
  authRetryAt = 0;
}

export { firebaseConfigured };
