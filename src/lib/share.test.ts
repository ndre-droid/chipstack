import type { Denomination, SessionConfig, Settings } from '../types.ts';
import { decodeSetup, encodeSetup } from './share.ts';
import { DEVICE_LOCAL_SETTINGS } from './settingsScope.ts';

/**
 * The CS1 setup code — the thing that goes in a QR and gets sent to a friend.
 *
 * Two contracts. It must survive the round trip (a code that quietly drops the
 * plaques or the per-chip minimums is worse than no code at all), and it must carry
 * the SETUP and nothing else: it used to contain the sender's live pairing code and,
 * once they had picked a big-screen photo, a few hundred kB of base64 — which is
 * exactly why the QR could not be scanned. See lib/settingsScope.
 *
 * Only the encode/decode half is exercised here: the PNG renderers in the same
 * module need a canvas, and there isn't one in Node.
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
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, Object.is(got, want), `got ${String(got)}, want ${String(want)}`);

const denominations: Denomination[] = [
  { id: 'a', value: 1, color: '#ECE4D0', accent: '#B49A54', count: 100, enabled: true, shape: 'chip', minPerPlayer: 4 },
  { id: 'b', value: 25, color: '#2E9E52', accent: '#F2E7A8', count: 80, enabled: false, shape: 'chip', minPerPlayer: 0 },
  { id: 'c', value: 5000, color: '#9A5228', accent: '#F3D6B4', count: 10, enabled: true, shape: 'plaque', minPerPlayer: 0 },
];

const session: SessionConfig = {
  playerCount: 7,
  buyIn: 25,
  earlyRebuys: 3,
  lateRebuyAmount: 40,
  blindLevels: [{ id: 'l1', smallBlind: 10, bigBlind: 20, ante: 0 }, { id: 'l2', smallBlind: 25, bigBlind: 50, ante: 5 }],
  smallBias: 0.7,
  maxDenoms: 5,
  useAllChips: true,
  excludedDenoms: ['b'],
  startLevelIdx: 1,
  stackOverride: { key: 'k', counts: { a: 20, c: 1 } },
};

/** A phone mid-night: hosting, photo picked, guest name saved. */
const settings = {
  unitValue: 0.05,
  currency: '€',
  defaultSmallBlind: 10,
  defaultBigBlind: 20,
  minutesPerLevel: 25,
  skin: 'casino',
  accents: { minimal: 'amber', casino: 'gold', playful: 'coral', scifi: 'cyan', pokernacht: 'gold' },
  tvSkin: 'match',
  tvQuips: true,
  tvCustomQuips: ["don't slow-roll"],
  tvShowPlayers: true,
  tvRosterSort: 'seat',
  rosterSort: 'chips',
  tvShowPayouts: true,
  tvShowBustOrder: false,
  breakMinutes: 7,
  breakAt: '22:30',
  levelAlerts: true,
  breakEvery: 4,
  tvBackground: `data:image/png;base64,${'A'.repeat(4000)}`,
  tvBackgroundFocus: { x: 30, y: 70 },
  tvBackgroundTone: 0.4,
  appearance: 'dark',
  chipArt: 'deco',
  language: 'de',
  gameMode: 'tournament',
  cashUseTimer: false,
  countMode: 'colours',
  tvShowStartStack: false,
  bountyMode: true,
  bountyAmount: 5,
  showTrend: true,
  lateRegLevels: 3,
  payoutSplit: [0.6, 0.4],
  customAccent: '#ff8800',
  tvPenalties: ['deals the next orbit'],
  tvHouseRules: [],
  deviceIsTv: false,
  tvScale: 1.4,
  liveSessionCode: '4711',
  liveSessionRole: 'host',
  guestName: 'Nahuel',
  guestEmoji: '🦊',
  onboardedAt: 1_700_000_000_000,
} as Settings;

const code = encodeSetup({ denominations, session, settings });
const back = decodeSetup(code);

console.log('\nthe code round-trips');
{
  check('it decodes at all', back !== null);
  eq('prefixed CS1:', code.slice(0, 4), 'CS1:');
  if (back) {
    eq('every chip comes back', back.denominations.length, 3);
    eq('face values', back.denominations.map((d) => d.value).join(','), '1,25,5000');
    eq('counts', back.denominations.map((d) => d.count).join(','), '100,80,10');
    eq('colours', back.denominations[0].color, '#ECE4D0');
    eq('accents', back.denominations[2].accent, '#F3D6B4');
    eq('a disabled chip stays disabled', back.denominations[1].enabled, false);
    eq('a plaque stays a plaque', back.denominations[2].shape, 'plaque');
    eq('and the round ones stay round', back.denominations[0].shape, 'chip');
    eq('per-chip minimums survive', back.denominations[0].minPerPlayer, 4);
    check('ids are re-issued, not shared', back.denominations.every((d) => !['a', 'b', 'c'].includes(d.id)));

    eq('the buy-in', back.session.buyIn, 25);
    eq('the table size', back.session.playerCount, 7);
    eq('the blind ladder', back.session.blindLevels.length, 2);
    eq('including antes', back.session.blindLevels[1].ante, 5);
    eq('the small-chip bias', back.session.smallBias, 0.7);
    eq('the hand-tuned stack', back.session.stackOverride?.counts.a, 20);

    eq('the chip unit value', back.settings.unitValue, 0.05);
    eq('the style', back.settings.skin, 'casino');
    eq('the custom accent', back.settings.customAccent, '#ff8800');
    eq('the language', back.settings.language, 'de');
    eq('the late-reg window', back.settings.lateRegLevels, 3);
    eq('a custom prize split', back.settings.payoutSplit?.join(','), '0.6,0.4');
    eq('and the quips the user wrote', back.settings.tvCustomQuips?.[0], "don't slow-roll");
  }
}

console.log('\nand carries the setup ONLY');
{
  for (const key of DEVICE_LOCAL_SETTINGS) {
    check(`${key} is not in the code`, back ? !(key in back.settings) : false);
  }
  check('so the 4 kB photo is not in it either', !code.includes('AAAAAAAA'));
  check('and the code stays small enough for a QR', code.length < 2500, `${code.length} chars`);
}

console.log('\nnon-ASCII survives the base64 round trip');
{
  const euro = decodeSetup(encodeSetup({ denominations, session, settings: { ...settings, currency: '€' } }));
  eq('the euro sign', euro?.settings.currency, '€');
  const kr = decodeSetup(encodeSetup({ denominations, session, settings: { ...settings, currency: 'kr' } }));
  eq('and a plain one', kr?.settings.currency, 'kr');
}

console.log('\nrubbish in, null out — never a half-applied setup');
{
  eq('empty', decodeSetup(''), null);
  eq('not base64', decodeSetup('CS1:not base64 at all!!'), null);
  eq('valid base64, wrong contents', decodeSetup(`CS1:${btoa('{"hello":1}')}`), null);
  eq('a future version is refused', decodeSetup(`CS1:${btoa('{"v":2,"d":[],"s":{},"g":{}}')}`), null);
  eq('a payload with no chips array', decodeSetup(`CS1:${btoa('{"v":1,"s":{},"g":{}}')}`), null);
  check('a bare code without the prefix still decodes', decodeSetup(code.slice(4)) !== null);
  check('and whitespace around it is tolerated', decodeSetup(`  ${code}\n`) !== null);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
