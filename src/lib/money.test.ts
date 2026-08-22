import { parseMoney } from './money.ts';

/**
 * Every amount in the app goes through `parseMoney`, and the case that matters is
 * the one that used to lose money silently: a German keyboard types a COMMA, and
 * `<input type="number">` answers a comma by handing the app an empty string. These
 * assert the separators people actually type, in both conventions.
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

const eq = (label: string, input: string, expected: number) =>
  check(`${label}: "${input}" -> ${expected}`, Math.abs(parseMoney(input) - expected) < 1e-9, `got ${parseMoney(input)}`);

console.log('\na typed amount, whichever separator the keyboard offers');
eq('German comma', '47,25', 47.25);
eq('English dot', '47.25', 47.25);
eq('whole number', '20', 20);
eq('trailing separator mid-typing', '12,', 12);
eq('leading separator', ',5', 0.5);

console.log('\ngrouping separators are tolerated, not misread as decimals');
eq('German grouped', '1.234,50', 1234.5);
eq('English grouped', '1,234.50', 1234.5);
eq('lone group, German', '1.234', 1234);
eq('lone group, English', '1,234', 1234);
eq('but a small chip value keeps its decimals', '0,001', 0.001);
eq('two decimals are decimals', '12,50', 12.5);
eq('one decimal is a decimal', '1,5', 1.5);
eq('spaces', ' 12 ', 12);

console.log('\nnothing usable is zero, never NaN');
eq('empty', '', 0);
eq('letters', 'abc', 0);
eq('symbol only', ',', 0);
check('never NaN', !Number.isNaN(parseMoney('€€')), `got ${parseMoney('€€')}`);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nALL PASS');
