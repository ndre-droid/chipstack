import {
  disableNetwork,
  doc,
  enableNetwork,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { ensureAuth, resetAuth, getDb, firebaseConfigured } from './firebase';
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
  /** when this document may be swept by the TTL policy; refreshed by every write */
  expiresAt?: FireTimestamp | null;
  /** null while the TV is advertising a code but no phone has connected yet. */
  data: LiveData | null;
  clock: ClockState;
  /** the TV heartbeat — bumped every few seconds while a TV is showing this
   *  session, so the host phone can tell a live TV from a dropped one. */
  tvSeenAt?: FireTimestamp | null;
  /** the mirror image: bumped by the host phone on every push, so the big screen
   *  can say "the phone is gone" instead of showing a frozen table as if it were
   *  current. Android discards backgrounded tabs without warning anybody. */
  hostSeenAt?: FireTimestamp | null;
  /** anonymous uid of the big screen that created this session, and of the phone
   *  that claimed it. The security rules let these two write and nobody else — the
   *  four-digit code alone is far too easy to guess for that. */
  tvUid?: string | null;
  hostUid?: string | null;
}

export { firebaseConfigured };

/**
 * Force the Firestore connection to be rebuilt.
 *
 * The failure this exists for: the SDK's write stream can get wedged — the phone
 * changes network, Android freezes the tab, a hotspot drops mid-write — and from
 * then on every `setDoc` is accepted locally and simply never acknowledged. The
 * app looked exactly like this: "not sent yet — retrying (attempt 9)", climbing
 * forever, with the Push button doing nothing, because retrying a write on a dead
 * stream produces another dead write. Only reloading the app fixed it, and inside
 * the installed APK there is no reload.
 *
 * Turning the network off and on again drops the stream and makes the SDK open a
 * fresh one, taking everything still queued with it. Cheap, local, and safe to
 * call while writes are pending — they are re-sent, not lost.
 */
export async function kickConnection(): Promise<void> {
  const db = getDb();
  if (!db) return;
  resetAuth(); // a stale token is the other thing a fresh connection should shed
  try {
    await disableNetwork(db);
  } catch {
    /* already down — the re-enable below is what matters */
  }
  await enableNetwork(db);
}

/** Short 4-digit pairing code — big on the TV, quick to type on the phone. */
export function genCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * How long a pairing document stays interesting. Every write pushes the stamp out
 * again, so a live session never expires under the players; an abandoned one is
 * swept up by the Firestore TTL policy on `expiresAt` (see `firestore.rules` and
 * README) instead of sitting in the database for good. Nothing in the app depends
 * on the sweep — it only keeps a public, code-addressed collection from growing
 * without bound.
 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** The two stamps every write carries: when it happened, and when it may be swept. */
function stamps() {
  return { updatedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + SESSION_TTL_MS) };
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
  const uid = await ensureAuth();
  const owned = uid ? { tvUid: uid } : {};
  if (existingCode) {
    const ref = sessionRef(existingCode);
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { data: null, clock, ...owned, ...stamps() });
    return existingCode;
  }
  /* Claim the code in a transaction. Reading first and writing after left a gap in
     which a second TV could pick the same four digits and take over a table that had
     already paired — rare, but the failure is somebody else's game appearing on your
     screen, so it is worth the extra round trip. */
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured');
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const claimed = await runTransaction(db, async (tx) => {
      const ref = sessionRef(code);
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, { data: null, clock, ...owned, ...stamps() });
      return true;
    });
    if (claimed) return code;
  }
  // 8 codes taken in a row: the collection is unusually busy, so take the last one
  // rather than leaving the screen without a code to show.
  const code = genCode();
  await setDoc(sessionRef(code), { data: null, clock, ...owned, ...stamps() });
  return code;
}

/**
 * Host (phone): push the latest players/rebuys/blinds/inventory — called on every
 * relevant change. Uses a merge write so it self-heals if the session document was
 * lost (e.g. the host reloaded after the doc expired) instead of failing forever.
 */
export async function hostPushData(code: string, state: AppState): Promise<void> {
  const uid = await ensureAuth();
  await setDoc(
    sessionRef(code),
    { data: dataOf(state), hostSeenAt: serverTimestamp(), ...(uid ? { hostUid: uid } : {}), ...stamps() },
    { merge: true },
  );
}

/**
 * Host (phone): say "still here" without re-sending the game. Called on a slow
 * interval while hosting, so a quiet table (nobody rebuying, nobody counting) does
 * not look to the big screen like a phone that died.
 */
export async function hostHeartbeat(code: string): Promise<void> {
  await ensureAuth();
  await setDoc(sessionRef(code), { hostSeenAt: serverTimestamp(), ...stamps() }, { merge: true });
}

/**
 * Either side: push a new clock state (play/pause/next/prev/break/auto-advance).
 * Merge write so a missing document is re-created rather than throwing — keeps the
 * phone remote working even after a reload.
 */
export async function pushClock(code: string, clock: ClockState): Promise<void> {
  await ensureAuth();
  await setDoc(sessionRef(code), { clock, ...stamps() }, { merge: true });
}

/**
 * The background photo's own document — a sibling of the session, `NNNN-bg`, NOT a
 * subcollection under it. Both would be equally tidy, but a subcollection needs its
 * own `match` block in the security rules, so the split would only start working
 * once new rules were deployed. A sibling document is covered by the same rule the
 * session already lives under and works the moment the app updates.
 */
function backgroundRef(code: string) {
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured');
  return doc(db, 'sessions', `${code}-bg`);
}

/**
 * Host (phone): publish the big-screen background photo. Its own document on
 * purpose — it is a few hundred kB of base64 next to a couple of kB of game data,
 * and a merge write re-sends every field it is given. Kept here, a rebuy costs a
 * rebuy's worth of traffic instead of a photo's.
 */
export async function pushBackground(code: string, image: string | null): Promise<void> {
  await ensureAuth();
  await setDoc(backgroundRef(code), { image, ...stamps() });
}

/** TV: watch the background document. Same self-healing listener as the session. */
export function subscribeBackground(code: string, onUpdate: (image: string | null) => void): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  void ensureAuth();
  return onSnapshot(
    doc(db, 'sessions', `${code}-bg`),
    (snap) => onUpdate(snap.exists() ? ((snap.data() as { image?: string | null }).image ?? null) : null),
    () => {
      /* the session listener already tells the screen it lost the connection */
    },
  );
}

/* -------------------------------------------------------------- guest joins -- */

/** Somebody at the table asking to be put in the roster from their own phone. */
export interface JoinRequest {
  id: string;
  name: string;
  emoji?: string;
  at: number;
}

const joinsRef = (code: string) => {
  const db = getDb();
  if (!db) throw new Error('firebase not configured');
  // its own document, like the background: guests write here constantly while the
  // session document is the host's to own
  return doc(db, 'sessions', `${code}-joins`);
};

/**
 * Guest: ask to be seated.
 *
 * The point is that the host stops typing six names into a phone while six people
 * watch — everyone scans the code on the TV and puts their own name in. A
 * transaction because several people will do this at the same moment, and a plain
 * merge write would have the last one overwrite the rest.
 */
export async function requestSeat(code: string, name: string, emoji?: string): Promise<string> {
  await ensureAuth();
  const id = Math.random().toString(36).slice(2, 10);
  const ref = joinsRef(code);
  await runTransaction(getDb()!, async (tx) => {
    const snap = await tx.get(ref);
    const existing = (snap.exists() ? (snap.data() as { requests?: JoinRequest[] }).requests : []) ?? [];
    // one seat per person: asking twice updates the name rather than queueing again
    const mine = existing.filter((r) => r.name.trim().toLowerCase() !== name.trim().toLowerCase());
    const next = [...mine, { id, name: name.trim().slice(0, 24), emoji, at: Date.now() }].slice(-16);
    tx.set(ref, { requests: next, ...stamps() });
  });
  return id;
}

/** Host: watch for people asking to be seated. */
export function subscribeJoins(code: string, onUpdate: (requests: JoinRequest[]) => void): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  void ensureAuth();
  return onSnapshot(
    doc(db, 'sessions', `${code}-joins`),
    (snap) => onUpdate(snap.exists() ? ((snap.data() as { requests?: JoinRequest[] }).requests ?? []) : []),
    () => {
      /* the session listener already reports a lost connection */
    },
  );
}

/** Host: a request has been dealt with (seated or dismissed). */
export async function clearJoin(code: string, id: string): Promise<void> {
  await ensureAuth();
  const ref = joinsRef(code);
  await runTransaction(getDb()!, async (tx) => {
    const snap = await tx.get(ref);
    const existing = (snap.exists() ? (snap.data() as { requests?: JoinRequest[] }).requests : []) ?? [];
    tx.set(ref, { requests: existing.filter((r) => r.id !== id), ...stamps() });
  });
}

/* --------------------------------------------------- hand-of-the-night vote -- */

/** Votes for the best hand of the night, keyed by moment id. */
export type MomentVotes = Record<string, string[]>;

const votesRef = (code: string) => {
  const db = getDb();
  if (!db) throw new Error('firebase not configured');
  return doc(db, 'sessions', `${code}-votes`);
};

/**
 * Guest: vote for the hand of the night from your own phone.
 *
 * One vote per person, changeable — the name is the identity, which is exactly as
 * strong as it needs to be for six friends around a table. A transaction because
 * everyone votes in the same ten seconds.
 */
export async function castVote(code: string, momentId: string, voter: string): Promise<void> {
  await ensureAuth();
  const ref = votesRef(code);
  const who = voter.trim().toLowerCase();
  if (!who) return;
  await runTransaction(getDb()!, async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists() ? (snap.data() as { votes?: MomentVotes }).votes : {}) ?? {};
    const next: MomentVotes = {};
    // clear this voter out of every moment first: voting again moves the vote
    for (const [id, voters] of Object.entries(current)) {
      const kept = voters.filter((v) => v.trim().toLowerCase() !== who);
      if (kept.length) next[id] = kept;
    }
    next[momentId] = [...(next[momentId] ?? []), voter.trim().slice(0, 24)];
    tx.set(ref, { votes: next, ...stamps() });
  });
}

/** TV / host: watch the vote count. */
export function subscribeVotes(code: string, onUpdate: (votes: MomentVotes) => void): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  void ensureAuth();
  return onSnapshot(
    doc(db, 'sessions', `${code}-votes`),
    (snap) => onUpdate(snap.exists() ? ((snap.data() as { votes?: MomentVotes }).votes ?? {}) : {}),
    () => {
      /* the session listener already reports a lost connection */
    },
  );
}

/**
 * TV: bump the heartbeat so the host phone can tell this TV is alive. Called on a
 * short interval while a device is showing the big screen. Merge write, tiny.
 */
export async function tvHeartbeat(code: string): Promise<void> {
  await ensureAuth();
  await setDoc(sessionRef(code), { tvSeenAt: serverTimestamp(), ...stamps() }, { merge: true });
}

/**
 * TV: the big screen is being switched off — take the pairing document with it.
 * The code is public and guessable, so leaving a finished session lying around is
 * both clutter and a way for a stranger to watch the table. Failure is ignored:
 * the TTL sweep is the backstop.
 */
export async function endSession(code: string): Promise<void> {
  try {
    await ensureAuth(); // only the screen that created the session may delete it
    // the photo first: deleting a parent document does not remove its subcollection
    await deleteDoc(backgroundRef(code)).catch(() => {});
    await deleteDoc(joinsRef(code)).catch(() => {});
    await deleteDoc(votesRef(code)).catch(() => {});
    await deleteDoc(sessionRef(code));
  } catch {
    /* offline or already gone — the TTL policy cleans up either way */
  }
}

/** TV: verify a code exists before joining, so a mistyped code fails fast with a clear message. */
export async function checkCodeExists(code: string): Promise<boolean> {
  await ensureAuth();
  const snap = await getDoc(sessionRef(code));
  return snap.exists();
}

/** Backoff between attempts to re-open a listener that the server dropped. */
const RESUBSCRIBE_BACKOFF_MS = [2000, 4000, 8000, 15000, 30000];

/**
 * Subscribe to live updates for a session code. Returns an unsubscribe function.
 *
 * A listener can die — the network drops, the tab sleeps for an hour, the rules
 * reject the read. Firestore reports that once through the error callback and then
 * stays silent forever: without this the big screen simply froze on whatever it
 * last received, with nothing on screen to say so. So an error re-opens the
 * listener on a backoff, and `onConnected` lets the caller show the truth in the
 * meantime.
 */
export function subscribeSession(
  code: string,
  onUpdate: (doc: LiveDoc) => void,
  onConnected?: (connected: boolean) => void,
): Unsubscribe {
  const db = getDb();
  if (!db) return () => {};
  const ref = doc(db, 'sessions', code);
  let stopped = false;
  /* Signed in before the first read: the rules only serve sessions to a signed-in
     device. It resolves in the background — a listener that opens a moment too
     early fails, and the retry below picks it up. */
  void ensureAuth();
  let inner: Unsubscribe | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const open = () => {
    if (stopped) return;
    inner = onSnapshot(
      ref,
      (snap) => {
        attempts = 0;
        onConnected?.(true);
        if (snap.exists()) onUpdate(snap.data() as LiveDoc);
      },
      () => {
        onConnected?.(false);
        inner = null;
        if (stopped) return;
        const wait = RESUBSCRIBE_BACKOFF_MS[Math.min(attempts, RESUBSCRIBE_BACKOFF_MS.length - 1)];
        attempts++;
        retry = setTimeout(open, wait);
      },
    );
  };
  open();

  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    inner?.();
  };
}
