import { offersTvRole, hasOwnTable } from './tvRole.ts';

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const base = { deviceIsTv: false, synced: false, players: 0, tableFromMirror: false };

console.log('\nwho gets offered the TV role');
check('a spare screen with nothing on it', offersTvRole(base));
check(
  'not the phone the night is run on',
  !offersTvRole({ ...base, players: 6 }),
);
check(
  'not a device that is already the TV',
  !offersTvRole({ ...base, deviceIsTv: true }),
);
check(
  'not one already in a live session',
  !offersTvRole({ ...base, synced: true }),
);

/* The regression this file was written for: a television that has been paired
   before is holding the HOST's roster, not its own. Judging it by row count alone
   left it showing last night's table with no way back to a pairing code. */
console.log('\na television that was paired before, and lost the role');
check(
  'the mirrored roster does not count as its own table',
  offersTvRole({ ...base, players: 7, tableFromMirror: true }),
);
check('and it is not treated as running a game', !hasOwnTable({ players: 7, tableFromMirror: true }));

console.log('\n…while a table typed on this device still is one');
check('own rows', hasOwnTable({ players: 6, tableFromMirror: false }));
check('no rows at all', !hasOwnTable({ players: 0, tableFromMirror: false }));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
