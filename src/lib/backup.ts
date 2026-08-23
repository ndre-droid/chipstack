import type { AppState } from '../types.ts';
import { listPhotos, addPhoto, type SavedPhoto } from './photoStore.ts';

/**
 * Export / import the whole app.
 *
 * Everything lives in this phone's `localStorage` (plus IndexedDB for the TV
 * photos), which means a new phone, a cleared browser or an uninstall used to take
 * the chip inventory, the regulars and the whole season league with it. This is the
 * way out: one JSON file the user can put anywhere.
 */
const MAGIC = 'chipstack.backup';
const VERSION = 1;

export interface Backup {
  magic: typeof MAGIC;
  version: number;
  exportedAt: number;
  state: AppState;
  /** big-screen photos, which live outside the app state (see lib/photoStore.ts) */
  photos: SavedPhoto[];
}

export async function buildBackup(state: AppState): Promise<Backup> {
  return { magic: MAGIC, version: VERSION, exportedAt: Date.now(), state, photos: await listPhotos() };
}

export function backupFilename(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `chipstack-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}.json`;
}

/** Hand the file to the browser. Returns false if the browser refused to save it. */
export function downloadBackup(backup: Backup): boolean {
  try {
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename(new Date(backup.exportedAt));
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke late: some WebViews start the write asynchronously
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

export interface ParsedBackup {
  state: AppState;
  photos: SavedPhoto[];
  /** what the user is about to overwrite themselves with, for the confirmation */
  summary: { chips: number; sets: number; people: number; nights: number; presets: number; exportedAt: number };
}

/**
 * Validate a file the user picked. Deliberately strict about the shape and silent
 * about everything else: the file is data, and a half-valid one must not be allowed
 * to half-replace a working install.
 */
export function parseBackup(text: string): ParsedBackup | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<Backup>;
  if (b.magic !== MAGIC || typeof b.version !== 'number' || b.version > VERSION) return null;
  const state = b.state as AppState | undefined;
  if (!state || !Array.isArray(state.denominations) || !state.settings || !state.session) return null;
  const photos = Array.isArray(b.photos)
    ? b.photos.filter((p): p is SavedPhoto => !!p && typeof p.url === 'string' && p.url.startsWith('data:image/'))
    : [];
  return {
    state,
    photos,
    summary: {
      chips: state.denominations.length,
      sets: Array.isArray(state.chipSets) ? state.chipSets.length : 1,
      people: Array.isArray(state.people) ? state.people.length : 0,
      nights: Array.isArray(state.league) ? state.league.length : 0,
      presets: Array.isArray(state.presets) ? state.presets.length : 0,
      exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0,
    },
  };
}

/** Put the backup's TV photos back into IndexedDB. Best-effort — never fatal. */
export async function restorePhotos(photos: SavedPhoto[]): Promise<void> {
  for (const p of photos) await addPhoto({ url: p.url, tone: p.tone, focus: p.focus });
}
