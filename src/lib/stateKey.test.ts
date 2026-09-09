import { CRASH_KEY_PREFIX, STATE_KEY, parkState, readRawState } from './stateKey.ts';

/**
 * The recovery path's one irreversible step.
 *
 * "Start fresh" is offered at the worst possible moment — the app will not draw, the
 * night has started, and the person tapping it has no way to check afterwards whether
 * their season survived. So the promise the crash screen makes ("nothing is deleted")
 * has to be a tested promise: the state moves ASIDE, under a key that is still there
 * on the next boot, and the app's own key is what gets cleared.
 *
 * The other half is that none of this may ever throw. It runs inside a component that
 * is already rendering an error, and a private-mode browser that denies localStorage
 * would otherwise turn the recovery screen into a second crash.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A localStorage that behaves, and one that refuses everything. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
const hostileStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

function withStorage(s: unknown, body: () => void) {
  (globalThis as { localStorage?: unknown }).localStorage = s;
  try {
    body();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

console.log('\nthe address of the data does not drift');
check('the key is the one the app has always used', STATE_KEY === 'chipstack.state.v1', STATE_KEY);

console.log('\nstarting fresh moves the state aside, it does not delete it');
withStorage(fakeStorage({ [STATE_KEY]: '{"broken":true}' }), () => {
  const key = parkState(1234);
  check('a crash key is returned', key === `${CRASH_KEY_PREFIX}1234`, String(key));
  const s = (globalThis as { localStorage?: ReturnType<typeof fakeStorage> }).localStorage!;
  check('the old state is still on the device', s.store.get(`${CRASH_KEY_PREFIX}1234`) === '{"broken":true}');
  check('and the app boots from defaults next time', s.store.has(STATE_KEY) === false);
});

console.log('\nnothing to park is not a failure');
withStorage(fakeStorage({}), () => {
  check('parking an empty install says so', parkState(1) === null);
  check('and reading it gives null, not a throw', readRawState() === null);
});

console.log('\na browser that denies storage must not crash the crash screen');
withStorage(hostileStorage, () => {
  let threw = false;
  try {
    check('reading returns null', readRawState() === null);
    check('parking returns null', parkState(1) === null);
  } catch {
    threw = true;
  }
  check('neither call threw', threw === false);
});

console.log('\nand neither must a browser with no storage at all');
withStorage(undefined, () => {
  let threw = false;
  try {
    check('reading returns null', readRawState() === null);
    check('parking returns null', parkState(1) === null);
  } catch {
    threw = true;
  }
  check('neither call threw', threw === false);
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
