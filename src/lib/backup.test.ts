import assert from 'node:assert/strict';
import { parseBackup } from './backup.ts';

/**
 * A backup is the only copy of a season league that exists anywhere, and restoring
 * one replaces everything on the device. So the parser has to be exact about what it
 * accepts: a half-valid file must be rejected outright rather than allowed to
 * half-overwrite a working install.
 */
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const goodState = {
  denominations: [{ id: 'a', value: 25, color: '#fff', accent: '#000', count: 100, enabled: true }],
  chipSets: [{ id: 's', name: 'My chips', denominations: [] }],
  activeChipSetId: 's',
  people: [{ id: 'p', name: 'Mika' }],
  lastLineup: [],
  settings: { currency: '€', unitValue: 0.01 },
  session: { playerCount: 4, buyIn: 20 },
  presets: [],
  ledger: [],
  counting: null,
  league: [{ id: 'g', date: 1, mode: 'cash', currency: '€', players: [] }],
  moments: [],
};

const wrap = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ magic: 'chipstack.backup', version: 1, exportedAt: 42, state: goodState, photos: [], ...over });

console.log('\na real backup');
const ok = parseBackup(wrap());
check('is accepted', ok !== null);
check('counts what it holds', ok?.summary.chips === 1 && ok?.summary.sets === 1 && ok?.summary.people === 1);
check('counts the saved nights', ok?.summary.nights === 1);
check('keeps the export date for the confirmation', ok?.summary.exportedAt === 42);

console.log('\nfiles that must be refused');
check('not JSON at all', parseBackup('this is a photo, not a backup') === null);
check('JSON, but not ours', parseBackup('{"hello":"world"}') === null);
check('right shape, wrong magic', parseBackup(wrap({ magic: 'something.else' })) === null);
check('from a newer version of the app', parseBackup(wrap({ version: 99 })) === null);
check('no state at all', parseBackup(wrap({ state: undefined })) === null);
check('state without chips', parseBackup(wrap({ state: { ...goodState, denominations: undefined } })) === null);
check('state without settings', parseBackup(wrap({ state: { ...goodState, settings: undefined } })) === null);

console.log('\nphotos ride along, but only real ones');
const photos = parseBackup(
  wrap({
    photos: [
      { id: '1', url: 'data:image/jpeg;base64,AAAA', tone: 0.2, focus: { x: 50, y: 50 }, at: 1 },
      { id: '2', url: 'https://example.com/evil.png', tone: 0.2, focus: { x: 50, y: 50 }, at: 2 },
      { id: '3', url: 'javascript:alert(1)', tone: 0.2, focus: { x: 50, y: 50 }, at: 3 },
    ],
  }),
);
check('a data-URL photo is kept', photos?.photos.length === 1, `${photos?.photos.length} kept`);
check('a remote URL is dropped', !photos?.photos.some((p) => p.url.startsWith('http')));
check('a script URL is dropped', !photos?.photos.some((p) => p.url.startsWith('javascript:')));

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
assert.equal(failures, 0, `${failures} backup check(s) failed`);
