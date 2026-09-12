import { levelAlertPayload } from './levelAlert.ts';

/**
 * The level-end notification, reduced to the one decision a device cannot be asked
 * about in CI: what gets handed to Android's AlarmManager.
 *
 * `allowWhileIdle` is the whole test. Without it Capacitor schedules through
 * `alarmManager.set(AlarmManager.RTC, …)` on every phone that has not been granted
 * `SCHEDULE_EXACT_ALARM` — which is every phone by default since Android 13 — and
 * `RTC` without `_WAKEUP` does not wake a sleeping device. The alert would then
 * arrive whenever the phone next happened to wake up, which for a feature whose
 * entire premise is "the phone can go back in your pocket" means never.
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

/** a fixed "now" — the clock is stubbed rather than waited on */
const NOW = 1_700_000_000_000;

console.log('the alarm is asked to wake the phone');
{
  const p = levelAlertPayload(NOW + 600_000, 'Level 3 is over', 'Blinds are now 50/100', NOW);
  check('a deadline ten minutes out schedules something', p !== null);
  eq('and asks to fire in doze', p?.schedule.allowWhileIdle, true);
  eq('at the deadline itself', p?.schedule.at.getTime(), NOW + 600_000);
  eq('carrying the title', p?.title, 'Level 3 is over');
  eq('and the body', p?.body, 'Blinds are now 50/100');
}

console.log('\nthere is nothing to schedule');
{
  eq('no deadline at all', levelAlertPayload(null, 't', 'b', NOW), null);
  eq('a deadline already past', levelAlertPayload(NOW - 1, 't', 'b', NOW), null);
  /* The second is not slack, it is the floor: a notification posted for "now" races
     the code that would immediately cancel it on the next level, and Android has
     been known to drop an alarm whose trigger has already gone by. */
  eq('a deadline inside the next second', levelAlertPayload(NOW + 500, 't', 'b', NOW), null);
  eq('exactly one second out is still too close', levelAlertPayload(NOW + 1000, 't', 'b', NOW), null);
  check('a second and a millisecond is not', levelAlertPayload(NOW + 1001, 't', 'b', NOW) !== null);
}

console.log('\nthe id is stable, so a new level replaces the old alert');
{
  const a = levelAlertPayload(NOW + 60_000, 'a', 'a', NOW);
  const b = levelAlertPayload(NOW + 120_000, 'b', 'b', NOW);
  eq('same notification id', a?.id, b?.id);
}

console.log(`\n${failures === 0 ? 'levelAlert: all checks passed' : `levelAlert: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
