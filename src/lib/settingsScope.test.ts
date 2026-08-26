import type { Settings } from '../types.ts';
import { DEVICE_LOCAL_SETTINGS, applySharedSettings, shareableSettings } from './settingsScope.ts';

/**
 * The rule these lock down: a setup travels (preset, CS1 share code, backup file),
 * but who a device IS and what it is connected to right now never does.
 *
 * Each of these is a bug that actually shipped: a share code that carried the
 * sender's live pairing code and their big-screen photo as base64 (the QR became
 * unscannable), a preset that disconnected a running session when it was loaded,
 * and a backup taken on the big screen that booted the phone restoring it straight
 * into TV mode.
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

/** A phone in the middle of a night: hosting a session, TV photo picked, onboarded. */
const phone: Settings = {
  unitValue: 0.01,
  currency: '€',
  defaultSmallBlind: 10,
  defaultBigBlind: 20,
  minutesPerLevel: 20,
  skin: 'casino',
  accents: { minimal: 'amber', casino: 'gold', playful: 'coral', scifi: 'cyan' },
  tvSkin: 'match',
  tvQuips: true,
  tvCustomQuips: ['ours'],
  tvShowPlayers: true,
  tvRosterSort: 'seat',
  rosterSort: 'chips',
  tvShowPayouts: false,
  tvShowBustOrder: false,
  breakMinutes: 5,
  breakAt: '22:30',
  levelAlerts: true,
  breakEvery: 0,
  tvBackground: 'data:image/png;base64,AAAA',
  tvBackgroundFocus: { x: 30, y: 70 },
  tvBackgroundTone: 0.4,
  appearance: 'dark',
  chipArt: 'deco',
  language: 'de',
  gameMode: 'tournament',
  cashUseTimer: false,
  countMode: 'colours',
  tvShowStartStack: false,
  bountyMode: false,
  bountyAmount: 5,
  showTrend: true,
  lateRegLevels: 0,
  payoutSplit: null,
  customAccent: null,
  tvPenalties: [],
  tvHouseRules: [],
  tvLayoutOwn: false,
  deviceIsTv: false,
  tvScale: 1.4,
  liveSessionCode: '4711',
  liveSessionRole: 'host',
  guestName: 'Nahuel',
  guestEmoji: '🦊',
  onboardedAt: 1_700_000_000_000,
};

/** The other device: the big screen, in TV mode, in its own session. */
const tv: Settings = {
  ...phone,
  skin: 'scifi',
  language: 'en',
  countMode: 'money',
  rosterSort: 'seat',
  levelAlerts: false,
  breakAt: null,
  tvBackground: null,
  tvBackgroundFocus: null,
  tvBackgroundTone: null,
  deviceIsTv: true,
  tvScale: 1,
  // this big screen was arranged on itself, so it keeps its own arrangement
  tvLayoutOwn: true,
  liveSessionCode: '2200',
  liveSessionRole: 'tv',
  guestName: null,
  guestEmoji: null,
  onboardedAt: 0,
};

console.log('\nwhat leaves the phone in a preset / share code');
const shared = shareableSettings(phone) as Partial<Settings>;
for (const key of DEVICE_LOCAL_SETTINGS) {
  check(`${key} is not in the payload`, !(key in shared));
}
check('but the setup itself is', shared.skin === 'casino' && shared.currency === '€' && shared.minutesPerLevel === 20);
check(
  'and the big-screen photo is gone, so the QR stays scannable',
  !JSON.stringify(shared).includes('data:image/'),
);

console.log('\nloading somebody else’s setup onto this device');
const applied = applySharedSettings(tv, shared);
check('the look comes across', applied.skin === 'casino');
check('so does the language', applied.language === 'de');
for (const key of DEVICE_LOCAL_SETTINGS) {
  check(`${key} stays this device’s own`, JSON.stringify(applied[key]) === JSON.stringify(tv[key]));
}

console.log('\nan OLD payload that still carries everything is stripped on the way in');
// what a pre-fix share code / preset / backup looks like: the whole Settings object
const legacy = applySharedSettings(tv, { ...phone });
check('this device is still the TV', legacy.deviceIsTv === true);
check('and still in its own session', legacy.liveSessionCode === '2200' && legacy.liveSessionRole === 'tv');
check('its zoom survives', legacy.tvScale === 1);
check('its own background is not replaced', legacy.tvBackground === null);
check('the shareable half did come through', legacy.skin === 'casino' && legacy.language === 'de');
check('but not the device-local half beside it', legacy.countMode === 'money');

console.log('\nthe reverse direction: the phone loading a TV backup');
const ontoPhone = applySharedSettings(phone, { ...tv });
check('the phone is not turned into a TV', ontoPhone.deviceIsTv === false);
check('and keeps hosting its session', ontoPhone.liveSessionCode === '4711' && ontoPhone.liveSessionRole === 'host');
check('while the look does change', ontoPhone.skin === 'scifi');

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
