import { contentScore } from './frame.ts';

let failures = 0;
function assert(label: string, cond: boolean) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); } else console.log(`ok   ${label}`);
}

const flat = new Array(100).fill(120);
assert('flat frame ~ 0', contentScore(flat) < 0.02);

const busy: number[] = [];
for (let i = 0; i < 100; i++) busy.push(i % 2 ? 20 : 220);
assert('busy frame high', contentScore(busy) > 0.2);

assert('empty -> 0', contentScore([]) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
