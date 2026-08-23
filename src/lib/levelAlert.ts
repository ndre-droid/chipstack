import { isNative } from './platform';

/**
 * A notification when the level ends, so the phone does not have to stay open.
 *
 * The app is deliberately silent — TV sound would hijack the room's speakers — and
 * the visual cue only works if somebody is looking at a screen. A notification is
 * the one channel that reaches the person holding the phone in their pocket, and it
 * is scheduled at the deadline rather than fired by a timer, so it survives the OS
 * freezing the tab (which Android does within minutes).
 *
 * Native only. Capacitor has no web implementation for this plugin, and a call
 * against the browser proxy throws `UNIMPLEMENTED` instead of doing nothing.
 *
 * Best-effort throughout: no permission, no plugin, no notification, no error.
 */
const ID = 4711;

interface Plugin {
  requestPermissions: () => Promise<{ display: string }>;
  checkPermissions: () => Promise<{ display: string }>;
  schedule: (opts: { notifications: unknown[] }) => Promise<unknown>;
  cancel: (opts: { notifications: { id: number }[] }) => Promise<unknown>;
}

/* Boxed on purpose. The Capacitor plugin proxy answers to EVERY property, `then`
   included, so returning it straight out of an async function makes the runtime
   treat it as a promise and "await" it — which is exactly the `LocalNotifications.
   then() is not implemented on web` error this used to throw on every render. */
let boxed: { impl: Plugin | null } | null = null;

async function get(): Promise<Plugin | null> {
  if (!isNative()) return null;
  if (boxed) return boxed.impl;
  try {
    const mod = await import('@capacitor/local-notifications');
    boxed = { impl: mod.LocalNotifications as unknown as Plugin };
  } catch {
    boxed = { impl: null };
  }
  return boxed.impl;
}

/** True when this device could show a level alert at all. */
export const levelAlertsAvailable = () => isNative();

/** Ask once, when the user turns the setting on. Returns whether it is allowed. */
export async function requestLevelAlerts(): Promise<boolean> {
  const p = await get();
  if (!p) return false;
  try {
    const current = await p.checkPermissions();
    if (current.display === 'granted') return true;
    const asked = await p.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Schedule the "level is over" notification for `endsAt`, replacing any previous
 * one. A deadline in the past, or no deadline at all, just cancels.
 */
export async function scheduleLevelAlert(endsAt: number | null, title: string, body: string): Promise<void> {
  const p = await get();
  if (!p) return;
  try {
    await p.cancel({ notifications: [{ id: ID }] });
    if (!endsAt || endsAt <= Date.now() + 1000) return;
    await p.schedule({ notifications: [{ id: ID, title, body, schedule: { at: new Date(endsAt) } }] });
  } catch {
    /* denied, unsupported, or the schedule window is too short */
  }
}

export async function cancelLevelAlert(): Promise<void> {
  const p = await get();
  if (!p) return;
  try {
    await p.cancel({ notifications: [{ id: ID }] });
  } catch {
    /* nothing scheduled */
  }
}
