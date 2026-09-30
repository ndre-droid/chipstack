/**
 * Saved big-screen backgrounds — photos, and videos from the gallery — in IndexedDB.
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

/**
 * A video chosen from the gallery, to play behind the big screen.
 *
 * The file is kept as a **Blob**, not as a data URL like the photos above. A photo
 * is ~200 kB and has to be a string anyway because it travels to a paired TV inside
 * the live session; a video is tens of megabytes, base64 would add a third on top,
 * and it is never going anywhere near a Firestore document — which caps at 1 MiB.
 * A Blob also plays straight from disk through `URL.createObjectURL`, so the whole
 * file is never held in memory at once.
 *
 * That is the same reason this one is DEVICE-LOCAL in the strongest sense: not just
 * "not in AppState" like a saved photo, but incapable of reaching another screen at
 * all. The video plays on whatever device is running big-screen mode. A paired
 * television keeps whatever picture `Settings.tvBackground` holds.
 */
export interface SavedVideo {
  id: string;
  blob: Blob;
  /** what the gallery called it, so the picker can name the one in use */
  name: string;
  /** mean luminance 0..1 of the FIRST FRAME — see tone on SavedPhoto */
  tone: number;
  /** salience focal point in percent, sampled from the first frame */
  focus: { x: number; y: number };
  at: number;
}

const DB = 'chipstack';
const STORE = 'photos';
const VIDEO_STORE = 'videos';
/** Plenty for a phone's worth of favourites, and a firm stop on unbounded growth. */
export const PHOTO_LIMIT = 24;
/**
 * Videos are kept ONE at a time. A photo is 200 kB and two dozen of them are a
 * pleasant library; a video is tens of megabytes and two dozen of them is a phone
 * with no space left, silently, for a background nobody chose twice.
 */
export const VIDEO_LIMIT = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    /* Version 2 adds the video store. `onupgradeneeded` runs for an existing
       version-1 database as well as a new one, and it creates only what is
       missing — so an install that already has photos keeps them. */
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(VIDEO_STORE)) req.result.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
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

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  store: string = STORE,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
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

/* ---- Videos ----
   Deliberately a small API: one video at a time, saved, fetched by id, deleted.
   There is no library to browse because there is no room for one. */

/**
 * What the picker will accept, and why, as one pure decision so it can be tested
 * without a file on disk.
 *
 * The cap is generous rather than tight — this never leaves the device, so the only
 * budget is the phone's own storage — but it is not absent: IndexedDB will happily
 * take a 2 GB holiday video and then the app is the reason the phone is full.
 * A minute of loopable background at a sane bitrate is a few MB; 200 is roughly
 * "somebody picked the wrong thing from the gallery".
 */
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export type VideoReject = 'type' | 'size' | null;

/** `null` means the file is fine. */
export function rejectVideo(file: { type: string; size: number }): VideoReject {
  /* Android's picker hands back an empty type for some files it is perfectly able
     to play, so an empty type is allowed through and the <video> element gets the
     final say — a file that will not decode fails visibly at that point anyway. */
  if (file.type && !file.type.startsWith('video/')) return 'type';
  if (file.size > VIDEO_MAX_BYTES) return 'size';
  return null;
}

/** The saved video, or null when there is none (or no storage at all). */
export async function getVideo(id: string): Promise<SavedVideo | null> {
  try {
    const v = await tx<SavedVideo | undefined>('readonly', (s) => s.get(id) as IDBRequest<SavedVideo | undefined>, VIDEO_STORE);
    return v ?? null;
  } catch {
    return null;
  }
}

async function listVideos(): Promise<SavedVideo[]> {
  try {
    const all = await tx<SavedVideo[]>('readonly', (s) => s.getAll() as IDBRequest<SavedVideo[]>, VIDEO_STORE);
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/**
 * Store a video and return its id, or null when it could not be stored.
 *
 * Saving a new one drops the old: see VIDEO_LIMIT. That happens AFTER the new one
 * is written, so a failed write leaves the previous background intact rather than
 * leaving the big screen with nothing.
 */
export async function addVideo(video: Omit<SavedVideo, 'id' | 'at'>): Promise<string | null> {
  const record: SavedVideo = { ...video, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
  try {
    const existing = await listVideos();
    await tx('readwrite', (s) => s.put(record), VIDEO_STORE);
    for (const old of existing.slice(VIDEO_LIMIT - 1)) await deleteVideo(old.id);
    return record.id;
  } catch {
    return null;
  }
}

export async function deleteVideo(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id), VIDEO_STORE);
  } catch {
    /* nothing we can do, and nothing depends on it */
  }
}
