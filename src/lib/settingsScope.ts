import type { Settings } from '../types';

/**
 * Which settings belong to THIS DEVICE and this moment, and must therefore never
 * travel inside a preset, a share code or a backup restored onto another phone.
 *
 * The bug this exists to stop: `Settings` is one flat object, and both the preset
 * ("save this setup") and the CS1 share code copied ALL of it. So the code you sent
 * a friend carried your live pairing code, your guest name, and — if you had ever
 * picked a big-screen photo — a few hundred kB of base64, which is what made the
 * share QR impossible to scan. Worse in the other direction: importing such a code
 * could set `deviceIsTv` on a phone (booting it straight into the big screen) or
 * drop it into a session it has no business hosting, and loading a preset saved
 * before a session started would silently disconnect a running one.
 *
 * The rule is the same in every direction: a setup is chips, blinds, money and
 * looks. Who this device is, and what it is currently connected to, is not part of
 * the setup.
 */
export const DEVICE_LOCAL_SETTINGS = [
  // identity + live session
  'deviceIsTv',
  'liveSessionCode',
  'liveSessionRole',
  'guestName',
  'guestEmoji',
  'onboardedAt',
  // per-device display / input preferences (the big screen's zoom, list order,
  // how a stack is typed, whether this device may raise a notification)
  'tvScale',
  // a big screen that was arranged on itself keeps its own arrangement, and one
  // that was told to put the cast stack away keeps THAT too
  'tvLayoutOwn',
  'tvStartStackHidden',
  'rosterSort',
  'countMode',
  'levelAlerts',
  // how chips are drawn: a weak phone and a TV stick want different answers, and
  // the 3D renderer needs WebGL this device may not have
  'chipStyle',
  // whether chips are allowed to move: taste, and what this phone can afford
  'chipAnim',
  // a break armed for tonight at 21:30 means nothing to anyone else
  'breakAt',
  // the big-screen photo is per-device by design (see lib/photoStore) and is by
  // far the largest thing in here
  'tvBackground',
  'tvBackgroundFocus',
  'tvBackgroundTone',
] as const satisfies readonly (keyof Settings)[];

type DeviceLocalKey = (typeof DEVICE_LOCAL_SETTINGS)[number];

/** The part of a settings object that is safe to save, share and hand to another device. */
export function shareableSettings(s: Settings): Omit<Settings, DeviceLocalKey> {
  const out = { ...s } as Partial<Settings>;
  for (const k of DEVICE_LOCAL_SETTINGS) delete out[k];
  return out as Omit<Settings, DeviceLocalKey>;
}

/**
 * Apply settings that arrived from somewhere else (a preset, a scanned setup code)
 * on top of what this device already holds — keeping every device-local field as it
 * is, whether or not the incoming object happens to carry one.
 */
export function applySharedSettings(current: Settings, incoming: Partial<Settings>): Settings {
  const merged = { ...current, ...incoming } as Settings;
  // one assignment per key, typed: a loop over the list would need a cast that
  // hides exactly the mismatch this is meant to prevent
  return { ...merged, ...pinned(current) };
}

/** The device-local half of a settings object, ready to be spread back over a merge. */
function pinned(s: Settings): Pick<Settings, DeviceLocalKey> {
  return {
    deviceIsTv: s.deviceIsTv,
    liveSessionCode: s.liveSessionCode,
    liveSessionRole: s.liveSessionRole,
    guestName: s.guestName,
    guestEmoji: s.guestEmoji,
    onboardedAt: s.onboardedAt,
    tvScale: s.tvScale,
    tvLayoutOwn: s.tvLayoutOwn,
    tvStartStackHidden: s.tvStartStackHidden,
    rosterSort: s.rosterSort,
    countMode: s.countMode,
    levelAlerts: s.levelAlerts,
    chipStyle: s.chipStyle,
    chipAnim: s.chipAnim,
    breakAt: s.breakAt,
    tvBackground: s.tvBackground,
    tvBackgroundFocus: s.tvBackgroundFocus,
    tvBackgroundTone: s.tvBackgroundTone,
  };
}
