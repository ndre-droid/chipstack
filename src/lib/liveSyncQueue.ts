import type { AppState } from '../types';
import type { ClockState } from './clockLogic';

/**
 * The single outbound path for everything this device writes to a live session.
 *
 * Why it exists: every push used to be a fire-and-forget `setDoc(...).catch(() => {})`
 * scattered across the host hook, the remote and the TV. A write that failed — a
 * flaky hotspot, a backgrounded phone, a Firestore write that never acknowledges —
 * was simply lost, and nothing on screen said so. The user only found out because
 * the TV stayed stale until the app was reloaded.
 *
 * This queue fixes both halves:
 *  - **Never lose a write.** A failure schedules a retry with exponential backoff,
 *    and retries also fire the moment the browser comes back online or the app is
 *    brought to the foreground.
 *  - **Always be honest about it.** The current state is observable, so the Table
 *    tab can show "sending" / "all sent" / "not sent — retrying (3)".
 *
 * Two design points worth keeping:
 *  - The data slot stores a **getter**, not a snapshot, so a retry always sends the
 *    CURRENT state rather than replaying a stale one. Repeated changes coalesce into
 *    a single write.
 *  - Every push races a timeout. The Firestore SDK queues writes locally when it
 *    believes it is offline, and the promise then never settles — an await that hangs
 *    forever looks exactly like the old lost-write bug. A timed-out write is retried;
 *    both writes are idempotent merges of the newest value, and writes from one client
 *    keep their order, so the newest value still wins if the original lands late.
 *
 * Deliberately free of any `firebase/*` import (like `liveData.ts`) — the SDK is
 * dynamically imported on the first actual push.
 */

export type LiveSyncStatus = 'idle' | 'syncing' | 'synced' | 'retrying';

export interface LiveSyncState {
  status: LiveSyncStatus;
  /** consecutive failures of the write that is currently stuck; 0 when healthy */
  attempts: number;
  /** epoch ms of the last write the server acknowledged */
  lastSyncedAt: number | null;
  /** what the browser thinks about the network — turns "retrying" into "offline" in the UI */
  online: boolean;
}

/** The two writes this device can make. Injectable so the retry logic is testable. */
export interface LiveTransport {
  pushData: (code: string, state: AppState) => Promise<void>;
  pushClock: (code: string, clock: ClockState) => Promise<void>;
  pushBackground: (code: string, image: string | null) => Promise<void>;
}

const DEFAULT_BACKOFF_MS = [800, 1600, 3200, 6400, 12000, 20000, 30000];
/** A write that has not been acknowledged by then is assumed lost and retried. */
const DEFAULT_TIMEOUT_MS = 8000;
/**
 * A clock command is a moment in time, not a fact: re-sending "pause at 4:12" a
 * minute later would rewind the TV. Past this age the pending clock is dropped and
 * the TV's own clock stays authoritative. Game data has no such problem — it is
 * re-read from the live state on every attempt.
 */
const DEFAULT_CLOCK_MAX_AGE_MS = 15000;

let backoffMs = DEFAULT_BACKOFF_MS;
let timeoutMs = DEFAULT_TIMEOUT_MS;
let clockMaxAgeMs = DEFAULT_CLOCK_MAX_AGE_MS;

let transport: LiveTransport | null = null;

async function getTransport(): Promise<LiveTransport> {
  if (!transport) {
    const { hostPushData, pushClock, pushBackground } = await import('./liveSession');
    transport = { pushData: hostPushData, pushClock, pushBackground };
  }
  return transport;
}

// --- pending work -----------------------------------------------------------

interface PendingData {
  code: string;
  getState: () => AppState;
}

interface PendingClock {
  code: string;
  clock: ClockState;
  /** when the command was issued — used to drop it once it is too old to be true */
  at: number;
}

/** The background photo, pushed only when it actually changed (see liveData). */
interface PendingBackground {
  code: string;
  getImage: () => string | null;
}

let pendingData: PendingData | null = null;
let pendingClock: PendingClock | null = null;
let pendingBackground: PendingBackground | null = null;
let inFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let lastSyncedAt: number | null = null;
/**
 * Bumped by `cancelLiveSync`. A write already in flight when the user disconnects
 * must not report back into the new (empty) session — neither as a success nor as
 * a failure that schedules a retry against a session we already left.
 */
let generation = 0;

// --- observable state -------------------------------------------------------

const listeners = new Set<() => void>();
let snapshot: LiveSyncState = { status: 'idle', attempts: 0, lastSyncedAt: null, online: true };

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function currentStatus(): LiveSyncStatus {
  if (inFlight) return 'syncing';
  if (attempts > 0) return 'retrying';
  if (pendingData || pendingClock || pendingBackground) return 'syncing';
  return lastSyncedAt ? 'synced' : 'idle';
}

/**
 * Recompute the snapshot and notify, but only when something actually changed —
 * `useSyncExternalStore` needs a stable object between real changes.
 */
function emit(): void {
  const next: LiveSyncState = {
    status: currentStatus(),
    attempts,
    lastSyncedAt,
    online: isOnline(),
  };
  if (
    next.status === snapshot.status &&
    next.attempts === snapshot.attempts &&
    next.lastSyncedAt === snapshot.lastSyncedAt &&
    next.online === snapshot.online
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
}

export function getLiveSyncState(): LiveSyncState {
  return snapshot;
}

export function subscribeLiveSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- the worker -------------------------------------------------------------

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('live-sync: write not acknowledged in time')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function scheduleRetry(): void {
  if (retryTimer) return;
  const wait = backoffMs[Math.min(attempts - 1, backoffMs.length - 1)];
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void run();
  }, wait);
}

async function run(): Promise<void> {
  if (inFlight || retryTimer) return; // already working, or waiting out a backoff
  if (!pendingData && !pendingClock && !pendingBackground) return;

  const gen = generation;
  inFlight = true;
  emit();
  try {
    const tr = await getTransport();

    // Clock first — it is the time-sensitive one.
    const clock = pendingClock;
    if (clock) {
      if (Date.now() - clock.at > clockMaxAgeMs) {
        pendingClock = null;
      } else {
        await withTimeout(tr.pushClock(clock.code, clock.clock), timeoutMs);
        if (pendingClock === clock) pendingClock = null;
      }
    }

    const data = pendingData;
    if (data) {
      await withTimeout(tr.pushData(data.code, data.getState()), timeoutMs);
      // A change queued mid-flight replaces the slot; leave it pending so it goes out again.
      if (pendingData === data) pendingData = null;
    }

    // The photo goes last: it is the big, slow one, and the table cares about the
    // ledger and the clock long before it cares about the wallpaper.
    const bg = pendingBackground;
    if (bg) {
      await withTimeout(tr.pushBackground(bg.code, bg.getImage()), timeoutMs);
      if (pendingBackground === bg) pendingBackground = null;
    }

    inFlight = false;
    if (gen !== generation) {
      emit(); // the session was left mid-write — that result belongs to nobody
      return;
    }
    attempts = 0;
    lastSyncedAt = Date.now();
    emit();
    if (pendingData || pendingClock || pendingBackground) void run();
  } catch {
    inFlight = false;
    if (gen !== generation) {
      emit();
      return;
    }
    attempts++;
    emit();
    scheduleRetry();
  }
}

// --- public API -------------------------------------------------------------

/**
 * Host: send the shared game data. Pass a getter, not a snapshot — retries re-read
 * it so the TV always receives the newest state, never a replay of an old one.
 */
export function queueData(code: string, getState: () => AppState): void {
  pendingData = { code, getState };
  emit();
  void run();
}

/**
 * Host: publish the background photo. Queued exactly like the rest so a failed
 * upload is retried rather than leaving the TV on yesterday's wallpaper, and
 * passed as a getter so a retry sends the current image.
 */
export function queueBackground(code: string, getImage: () => string | null): void {
  pendingBackground = { code, getImage };
  emit();
  void run();
}

/** Either side: send a clock command (play/pause/level/break). Latest command wins. */
export function queueClock(code: string, clock: ClockState): void {
  pendingClock = { code, clock, at: Date.now() };
  emit();
  void run();
}

/**
 * Retry now instead of waiting out the backoff — the "Push to TV" button, the
 * network coming back, the app returning to the foreground.
 */
export function flushLiveSync(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  attempts = 0;
  emit();
  void run();
}

/** Leaving the session: drop everything pending so nothing lands on a session we left. */
export function cancelLiveSync(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  pendingData = null;
  pendingClock = null;
  pendingBackground = null;
  attempts = 0;
  lastSyncedAt = null;
  generation++;
  emit();
}

// A dropped write usually recovers the moment the network or the app comes back,
// so don't make the user wait out a 30s backoff for it.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    emit();
    flushLiveSync();
  });
  window.addEventListener('offline', emit);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) flushLiveSync();
  });
}

/** Test seam: swap the transport and shorten the timings. Not used by the app. */
export function __configureLiveSync(opts: {
  transport?: LiveTransport | null;
  backoff?: number[];
  timeout?: number;
  clockMaxAge?: number;
}): void {
  if (opts.transport !== undefined) transport = opts.transport;
  if (opts.backoff) backoffMs = opts.backoff;
  if (opts.timeout !== undefined) timeoutMs = opts.timeout;
  if (opts.clockMaxAge !== undefined) clockMaxAgeMs = opts.clockMaxAge;
}
