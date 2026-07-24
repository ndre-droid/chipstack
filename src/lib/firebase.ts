import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, firebaseConfigured } from './firebaseConfig';

let db: Firestore | null = null;

/** Lazily creates the Firestore client. Returns null when unconfigured. */
export function getDb(): Firestore | null {
  if (!firebaseConfigured) return null;
  if (!db) {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return db;
}

export { firebaseConfigured };
