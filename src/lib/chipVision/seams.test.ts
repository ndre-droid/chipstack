import { seamLines } from './seams.ts';

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`FAIL ${label}: got ${g}, want ${w}`); }
  else console.log(`ok   ${label}`);
}
function approx(label: string, got: number[], want: number[]) {
  const ok = got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) < 1e-9);
  if (!ok) { failures++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
}

eq('count 1 -> no interior lines', seamLines([0, 1], 1), []);
eq('count 0 -> no lines', seamLines([0, 1], 0), []);
approx('count 2 -> midpoint', seamLines([0, 1], 2), [0.5]);
approx('count 4 even', seamLines([0, 1], 4), [0.25, 0.5, 0.75]);
approx('offset span', seamLines([0.2, 0.6], 2), [0.4]);
approx('count 3 within [0.1,0.7]', seamLines([0.1, 0.7], 3), [0.3, 0.5]);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
if (failures) process.exit(1);
