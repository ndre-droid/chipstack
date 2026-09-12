import { isNative } from './platform.ts';

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

/** The exact shape handed to the plugin. Named, because `schedule.allowWhileIdle`
 *  is load-bearing and a silent default of `false` is the difference between an
 *  alert at the deadline and one the next time the screen happens to come on. */
export interface LevelAlert {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle: true };
}

/**
 * What to schedule for `endsAt`, or `null` when there is nothing to schedule.
 *
 * Pure and exported so the one decision that decides whether the phone actually
 * wakes up can be asserted without a device. Read Capacitor's
 * `LocalNotificationManager.setExactIfPossible` to see why it matters — the ladder
 * it walks is:
 *
 *   exact alarms permitted + allowWhileIdle  -> setExactAndAllowWhileIdle(RTC_WAKEUP)
 *   exact alarms permitted                   -> setExact(RTC)
 *   not permitted          + allowWhileIdle  -> setAndAllowWhileIdle(RTC_WAKEUP)
 *   not permitted                            -> set(RTC)           <- where we were
 *
 * `SCHEDULE_EXACT_ALARM` is denied by default to anything targeting Android 13 or
 * later, so the bottom rung was the live one: `RTC` without `_WAKEUP` does not wake
 * a sleeping device at all, and a plain `set` is inexact on top of that. A blind
 * level that ends while the phone is face-down in a pocket — which is the entire
 * point of the feature — would be announced whenever the phone next woke up for its
 * own reasons. `allowWhileIdle: true` moves it to `RTC_WAKEUP` and out of the doze
 * bucket even when the user never grants the exact-alarm permission; granting it
 * (see `askForExactAlerts`) moves it to the top rung and makes it precise as well.
 */
export function levelAlertPayload(
  endsAt: number | null,
  title: string,
  body: string,
  now: number = Date.now(),
): LevelAlert | null {
  if (!endsAt || endsAt <= now + 1000) return null;
  return { id: ID, title, body, schedule: { at: new Date(endsAt), allowWhileIdle: true } };
}

interface Plugin {
  requestPermissions: () => Promise<{ display: string }>;
  checkPermissions: () => Promise<{ display: string }>;
  schedule: (opts: { notifications: unknown[] }) => Promise<unknown>;
  cancel: (opts: { notifications: { id: number }[] }) => Promise<unknown>;
  /* Android 12+ only, and added to the plugin in 6.0 — optional so an older
     install, or iOS, simply reports "nothing to ask for" instead of throwing. */
  checkExactNotificationSetting?: () => Promise<{ exact_alarm: string }>;
  changeExactNotificationSetting?: () => Promise<{ exact_alarm: string }>;
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
 * Whether this device will fire the alert at the deadline rather than near it.
 *
 * `true` also when the question does not apply — iOS, an Android below 12, a
 * plugin without the call. The caller uses it to decide whether to OFFER the
 * system setting, and offering a switch that does not exist is worse than
 * assuming the platform is already doing its best.
 */
export async function exactAlertsAllowed(): Promise<boolean> {
  const p = await get();
  if (!p?.checkExactNotificationSetting) return true;
  try {
    const s = await p.checkExactNotificationSetting();
    return s.exact_alarm === 'granted';
  } catch {
    return true;
  }
}

/**
 * Send the user to the system's "alarms & reminders" screen for this app.
 *
 * Android will not grant `SCHEDULE_EXACT_ALARM` from a dialog — the only route is
 * the settings page, which means leaving the app and coming back. Resolves with
 * what the setting says on the way out, which on most devices is still the old
 * value; the toggle re-reads it when the app resumes.
 */
export async function askForExactAlerts(): Promise<boolean> {
  const p = await get();
  if (!p?.changeExactNotificationSetting) return true;
  try {
    const s = await p.changeExactNotificationSetting();
    return s.exact_alarm === 'granted';
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
    const next = levelAlertPayload(endsAt, title, body);
    if (!next) return;
    await p.schedule({ notifications: [next] });
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
