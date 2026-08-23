/**
 * Saved big-screen photos, kept in IndexedDB.
 *
 * Why not `localStorage` like everything else: one downscaled photo is ~200 kB of
 * base64 and the WHOLE app state shares a quota of a few MB, so half a dozen
 * favourites would push the game data out of storage — the store already has a
 * "storage full, background dropped" path for exactly that. IndexedDB has room.
 *
 * These are deliberately per-device and NOT part of `AppState`: a photo from this
 * phone's gallery is only on this phone, and the live session only ever needs the
 * ONE background currently in use (`Settings.tvBackground`), which is unchanged.
 */
export interface SavedPhoto {
  id: string;
  /** downscaled JPEG data URL — the same thing `Settings.tvBackground` holds */
  url: string;
  /** mean luminance 0..1, drives the TV's readability scrim */
  tone: number;
  /** salience focal point in percent, so the TV can lay text out around the subject */
  focus: { x: number; y: number };
  at: number;
}

const DB = 'chipstack';
const STORE = 'photos';
/** Plenty for a phone's worth of favourites, and a firm stop on unbounded growth. */
export const PHOTO_LIMIT = 24;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB unavailable'));
  });
  // a failed open must not be cached forever — private mode can recover on reload
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
      }),
  );
}

/** Newest first. Resolves to an empty list when storage is unavailable. */
export async function listPhotos(): Promise<SavedPhoto[]> {
  try {
    const all = await tx<SavedPhoto[]>('readonly', (s) => s.getAll() as IDBRequest<SavedPhoto[]>);
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** Save a photo as a favourite. Returns the stored record, or null if it couldn't be. */
export async function addPhoto(photo: Omit<SavedPhoto, 'id' | 'at'>): Promise<SavedPhoto | null> {
  const record: SavedPhoto = { ...photo, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
  try {
    const existing = await listPhotos();
    // the same picture chosen twice is one favourite, not two
    const dupe = existing.find((p) => p.url === photo.url);
    if (dupe) return dupe;
    await tx('readwrite', (s) => s.put(record));
    // drop the oldest once we are over the cap
    for (const old of existing.slice(PHOTO_LIMIT - 1)) await deletePhoto(old.id);
    return record;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* nothing we can do, and nothing depends on it */
  }
}
