import { houseRulesFor, penaltiesFor, quipsFor } from './quips.ts';

/**
 * The bug this locks down: the big screen's sayings, penalties and house rules were
 * three English arrays inside TvMode, so a German table read English jokes under a
 * German clock. Every list must now exist in BOTH languages — a missing one is a
 * screen that silently goes quiet or goes English.
 */

let failures = 0;
function check(name: string, ok: boolean) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}`);
  if (!ok) failures++;
}

const lists = { quips: quipsFor, penalties: penaltiesFor, houseRules: houseRulesFor };

console.log('\nevery list, in both languages');
for (const [name, fn] of Object.entries(lists)) {
  for (const lang of ['en', 'de'] as const) {
    const list = fn(lang);
    check(`${name} (${lang}) is not empty`, list.length > 0);
    check(`${name} (${lang}) has nothing blank in it`, list.every((s) => s.trim().length > 0));
    check(`${name} (${lang}) repeats nothing`, new Set(list).size === list.length);
  }
  check(`${name}: the two languages are actually different text`, fn('de')[0] !== fn('en')[0]);
}

console.log('\nan unset language falls back rather than showing nothing');
check('no language is English', quipsFor(undefined).length === quipsFor('en').length);

console.log(`\n${failures === 0 ? 'quips: all checks passed' : `quips: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
