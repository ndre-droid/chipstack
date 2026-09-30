import { rejectVideo, VIDEO_MAX_BYTES } from './photoStore.ts';

/**
 * Which file the big screen will take as a background video.
 *
 * The only part of that feature a test can reach: everything else is IndexedDB, an
 * object URL and a `<video>` element decoding a frame. This is the guard that runs
 * before any of it, and the one that decides whether a phone quietly fills up.
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

const MB = 1024 * 1024;

console.log('a video off the gallery');
{
  eq('an ordinary mp4', rejectVideo({ type: 'video/mp4', size: 12 * MB }), null);
  eq('the webm a screen recorder makes', rejectVideo({ type: 'video/webm', size: 40 * MB }), null);
  /* Android's picker hands back an empty type for files it is perfectly able to
     play. Rejecting those would refuse real videos, so the <video> element gets the
     final say instead — a file that cannot decode fails visibly a moment later. */
  eq('a file the picker would not name', rejectVideo({ type: '', size: 8 * MB }), null);
}

console.log('\nand what it will not take');
{
  eq('a photo chosen by mistake', rejectVideo({ type: 'image/jpeg', size: 2 * MB }), 'type');
  eq('a PDF chosen by mistake', rejectVideo({ type: 'application/pdf', size: 1 * MB }), 'type');
  eq('the holiday footage', rejectVideo({ type: 'video/mp4', size: 400 * MB }), 'size');
}

console.log('\nthe size limit is a limit, not a suggestion');
{
  eq('exactly at the cap is allowed', rejectVideo({ type: 'video/mp4', size: VIDEO_MAX_BYTES }), null);
  eq('one byte over is not', rejectVideo({ type: 'video/mp4', size: VIDEO_MAX_BYTES + 1 }), 'size');
  /* Type is checked BEFORE size: told "that file isn't a video", nobody goes
     looking for a shorter one. */
  eq('a huge photo is reported as the wrong type', rejectVideo({ type: 'image/png', size: 900 * MB }), 'type');
}

console.log(`\n${failures === 0 ? 'videoPick: all checks passed' : `videoPick: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
