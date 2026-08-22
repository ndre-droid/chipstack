import assert from 'node:assert/strict';
import {
  __configureLiveSync,
  cancelLiveSync,
  flushLiveSync,
  getLiveSyncState,
  queueBackground,
  queueClock,
  queueData,
} from './liveSyncQueue.ts';
import type { AppState } from '../types.ts';
import type { ClockState } from './clockLogic.ts';

/**
 * The retry queue is the piece that used to lose writes silently, so it is worth a
 * real test. Timings are shrunk via the test seam; everything else is production code.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clockAt = (levelIdx: number): ClockState => ({
  levelIdx,
  onBreak: false,
  running: false,
  periodEndsAt: null,
  remaining: 600,
  minutesPerLevel: 10,
});

/** A stand-in for the app state — only identity matters to the queue. */
const stateWith = (tag: string) => ({ tag } as unknown as AppState);

interface Recorder {
  data: { code: string; tag: string }[];
  clocks: { code: string; levelIdx: number }[];
  backgrounds: { code: string; image: string | null }[];
  fails: number;
  hangs: number;
}

function transportThat(rec: Recorder) {
  return {
    pushData: async (code: string, state: AppState) => {
      if (rec.hangs > 0) {
        rec.hangs--;
        // Never settles — exactly what the Firestore SDK does with a write it has
        // queued locally because it believes it is offline.
        await new Promise<never>(() => {});
      }
      if (rec.fails > 0) {
        rec.fails--;
        throw new Error('network');
      }
      rec.data.push({ code, tag: (state as unknown as { tag: string }).tag });
    },
    pushClock: async (code: string, clock: ClockState) => {
      if (rec.fails > 0) {
        rec.fails--;
        throw new Error('network');
      }
      rec.clocks.push({ code, levelIdx: clock.levelIdx });
    },
    pushBackground: async (code: string, image: string | null) => {
      if (rec.fails > 0) {
        rec.fails--;
        throw new Error('network');
      }
      rec.backgrounds.push({ code, image });
    },
  };
}

function setup(rec: Recorder, opts: { timeout?: number; clockMaxAge?: number; backoff?: number[] } = {}) {
  cancelLiveSync();
  __configureLiveSync({
    transport: transportThat(rec),
    backoff: opts.backoff ?? [5, 5, 5, 5],
    timeout: opts.timeout ?? 1000,
    clockMaxAge: opts.clockMaxAge ?? 15000,
  });
}

const fresh = (): Recorder => ({ data: [], clocks: [], backgrounds: [], fails: 0, hangs: 0 });

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function testHappyPath() {
  console.log('\nhappy path');
  const rec = fresh();
  setup(rec);
  queueData('1234', () => stateWith('a'));
  await sleep(40);
  check('one write reached the transport', rec.data.length === 1, `got ${rec.data.length}`);
  check('status is synced', getLiveSyncState().status === 'synced', getLiveSyncState().status);
  check('attempts back to 0', getLiveSyncState().attempts === 0);
}

async function testRetriesUntilItLands() {
  console.log('\nfailed write is retried, not lost');
  const rec = fresh();
  setup(rec);
  rec.fails = 3;
  queueData('1234', () => stateWith('a'));
  await sleep(15);
  check('reports retrying while stuck', getLiveSyncState().status === 'retrying', getLiveSyncState().status);
  check('attempt count is visible', getLiveSyncState().attempts >= 1, String(getLiveSyncState().attempts));
  await sleep(120);
  check('write eventually landed', rec.data.length === 1, `got ${rec.data.length}`);
  check('back to synced', getLiveSyncState().status === 'synced', getLiveSyncState().status);
}

async function testRetrySendsCurrentState() {
  console.log('\na retry sends the CURRENT state, not a replay');
  const rec = fresh();
  setup(rec);
  rec.fails = 2;
  let tag = 'old';
  queueData('1234', () => stateWith(tag));
  await sleep(8);
  tag = 'new'; // the user kept editing while the first attempts were failing
  await sleep(120);
  check('exactly one write', rec.data.length === 1, `got ${rec.data.length}`);
  check('it carried the newest state', rec.data[0]?.tag === 'new', rec.data[0]?.tag);
}

async function testCoalescing() {
  console.log('\nrapid changes coalesce');
  const rec = fresh();
  setup(rec);
  for (let i = 0; i < 5; i++) queueData('1234', () => stateWith(`v${i}`));
  await sleep(60);
  check('far fewer writes than changes', rec.data.length <= 2, `got ${rec.data.length}`);
  check('last write is the newest value', rec.data[rec.data.length - 1]?.tag === 'v4', rec.data[rec.data.length - 1]?.tag);
}

async function testHangingWriteIsRetried() {
  console.log('\na write that never acknowledges is retried');
  const rec = fresh();
  setup(rec, { timeout: 20 });
  rec.hangs = 1;
  queueData('1234', () => stateWith('a'));
  await sleep(150);
  check('the timeout freed the queue and the retry landed', rec.data.length === 1, `got ${rec.data.length}`);
  check('status recovered', getLiveSyncState().status === 'synced', getLiveSyncState().status);
}

async function testStaleClockDropped() {
  console.log('\na clock command too old to be true is dropped, not replayed');
  const rec = fresh();
  // The retry lands well after the command's shelf life, so it must be discarded
  // rather than rewinding the TV to a level it already left.
  setup(rec, { clockMaxAge: 20, backoff: [80] });
  rec.fails = 1;
  queueClock('1234', clockAt(4));
  await sleep(200);
  check('the stale command was never sent', rec.clocks.length === 0, `got ${rec.clocks.length}`);
  check('queue is not stuck', getLiveSyncState().status !== 'retrying', getLiveSyncState().status);
}

async function testFreshClockRetried() {
  console.log('\na clock command still in its window IS retried');
  const rec = fresh();
  setup(rec, { clockMaxAge: 15000 });
  rec.fails = 2;
  queueClock('1234', clockAt(7));
  await sleep(150);
  check('command landed', rec.clocks.length === 1, `got ${rec.clocks.length}`);
  check('with the right level', rec.clocks[0]?.levelIdx === 7, String(rec.clocks[0]?.levelIdx));
}

async function testFlushSkipsBackoff() {
  console.log('\nflush jumps the backoff');
  const rec = fresh();
  setup(rec, { backoff: [5000] }); // long enough that only a flush can save us
  rec.fails = 1;
  queueData('1234', () => stateWith('a'));
  await sleep(20);
  check('stuck in backoff', rec.data.length === 0, `got ${rec.data.length}`);
  flushLiveSync();
  await sleep(40);
  check('flush pushed it through', rec.data.length === 1, `got ${rec.data.length}`);
}

async function testCancelDropsPending() {
  console.log('\nleaving the session drops pending work');
  const rec = fresh();
  setup(rec);
  rec.fails = 5;
  queueData('1234', () => stateWith('a'));
  await sleep(15);
  cancelLiveSync();
  rec.fails = 0;
  await sleep(120);
  check('nothing landed on the session we left', rec.data.length === 0, `got ${rec.data.length}`);
  check('status reset to idle', getLiveSyncState().status === 'idle', getLiveSyncState().status);
}

async function testBackgroundIsItsOwnWrite() {
  console.log('\nthe background photo is queued separately and retried');
  const rec = fresh();
  setup(rec);
  queueData('1234', () => stateWith('a'));
  queueBackground('1234', () => 'data:image/jpeg;base64,AAAA');
  await sleep(60);
  check('game data went out once', rec.data.length === 1, `got ${rec.data.length}`);
  check('photo went out once', rec.backgrounds.length === 1, `got ${rec.backgrounds.length}`);

  // a second data push must NOT drag the photo along again
  queueData('1234', () => stateWith('b'));
  await sleep(60);
  check('photo not re-sent with the next data push', rec.backgrounds.length === 1, `got ${rec.backgrounds.length}`);

  // and a failed photo upload is retried like everything else
  rec.fails = 2;
  queueBackground('1234', () => 'data:image/jpeg;base64,BBBB');
  await sleep(120);
  check('photo retried until it landed', rec.backgrounds.length === 2, `got ${rec.backgrounds.length}`);
  check(
    'the retry sent the current photo',
    rec.backgrounds[1]?.image === 'data:image/jpeg;base64,BBBB',
    String(rec.backgrounds[1]?.image),
  );
}

async function testClearingTheBackgroundSyncs() {
  console.log('\nremoving the photo reaches the TV as null');
  const rec = fresh();
  setup(rec);
  queueBackground('1234', () => null);
  await sleep(60);
  check('a null image is pushed, not skipped', rec.backgrounds.length === 1, `got ${rec.backgrounds.length}`);
  check('and it is null', rec.backgrounds[0]?.image === null, String(rec.backgrounds[0]?.image));
}

async function main() {
  await testHappyPath();
  await testRetriesUntilItLands();
  await testRetrySendsCurrentState();
  await testCoalescing();
  await testHangingWriteIsRetried();
  await testStaleClockDropped();
  await testFreshClockRetried();
  await testFlushSkipsBackoff();
  await testCancelDropsPending();
  await testBackgroundIsItsOwnWrite();
  await testClearingTheBackgroundSyncs();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  assert.equal(failures, 0, `${failures} live-sync queue check(s) failed`);
}

await main();
