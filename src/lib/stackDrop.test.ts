import { readFileSync } from 'node:fs';
import {
  chipTilt,
  discMotions,
  dropDelay,
  idleDiscs,
  impactStrength,
  DROP_STAGGER_MS,
  IMPACT_AT,
  IMPACT_MS,
  RESTITUTION,
  type Disc,
} from './stackDrop.ts';
import { animatedHere } from './chipAnim.ts';

/**
 * Chips that fall onto the pile: the ordering and the pacing.
 *
 * Two things have to hold however wildly the chip-mix slider is dragged. Chips that
 * land go bottom-up (a pile builds from the bottom) and chips that are taken away go
 * top-down (you lift the top chip off, not the one underneath). And a run of chips
 * must never take so long that the stack is still assembling itself after the number
 * under it has changed twice more.
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

console.log('\nchips added: the lowest new chip lands first');
{
  // stack grew from 4 to 7: chips 4, 5, 6 are the ones moving
  eq('the first new chip does not wait', dropDelay(4, 4, 7, false), 0);
  eq('the next one follows a stagger later', dropDelay(5, 4, 7, false), DROP_STAGGER_MS);
  eq('and the top one last', dropDelay(6, 4, 7, false), DROP_STAGGER_MS * 2);
}

console.log('\nchips removed: the top chip leaves first');
{
  eq('the topmost goes immediately', dropDelay(6, 4, 7, true), 0);
  eq('then the one below it', dropDelay(5, 4, 7, true), DROP_STAGGER_MS);
  eq('the lowest of them last', dropDelay(4, 4, 7, true), DROP_STAGGER_MS * 2);
}

console.log('\na tall run tightens up instead of dragging on');
{
  const last = dropDelay(19, 0, 20, false);
  check('twenty chips still start within ~0.6s', last <= 620, `last chip waits ${last}ms`);
  check('and they are still staggered', last > 0);
  eq('a single chip never waits', dropDelay(0, 0, 1, false), 0);
}

console.log('\na stack that is not moving is simply there');
{
  eq('one entry per chip', idleDiscs(5).length, 5);
  check('all of them at rest', idleDiscs(5).every((d) => d.state === 'idle'));
  eq('bottom chip is index 0', idleDiscs(5)[0].i, 0);
  eq('no chips, no entries', idleDiscs(0).length, 0);
}

console.log('\na chip that lands is felt by the chips under it');
{
  // a pile of six that just grew to eight
  const discs: Disc[] = [
    ...idleDiscs(6),
    { i: 6, state: 'in' },
    { i: 7, state: 'in' },
  ];
  const m = discMotions(discs);
  const at = (i: number) => m.find((x) => x.i === i)!;

  eq('the first new chip touches down after its fall', at(6).impactAt, IMPACT_MS);
  eq('the second lands a stagger later', at(7).impactAt, IMPACT_MS + DROP_STAGGER_MS);
  eq('a landing chip is its own impact', at(6).depth, 0);

  check('the chip directly below is struck', at(5).impactAt !== null);
  eq('one chip down', at(5).depth, 1);
  check('later than the chip that hit it', (at(5).impactAt as number) > IMPACT_MS);
  eq('three down still feels it', at(3).depth, 3);
  eq('four down does not', at(2).impactAt, null);
  check('and the knock travels downward in time', (at(3).impactAt as number) > (at(4).impactAt as number));
}

console.log('\nchips being taken off take no knock');
{
  const discs: Disc[] = [...idleDiscs(4), { i: 4, state: 'out' }, { i: 5, state: 'out' }];
  const m = discMotions(discs);
  const at = (i: number) => m.find((x) => x.i === i)!;
  eq('the top chip leaves first', at(5).delay, 0);
  eq('the one below follows', at(4).delay, DROP_STAGGER_MS);
  eq('nothing lands, so nothing is struck', at(5).impactAt, null);
  eq('and the pile below is left alone', at(3).impactAt, null);
}

console.log('\nno two chips in a pile sit at the same angle');
{
  const a = chipTilt(4);
  const b = chipTilt(5);
  check('neighbours lean opposite ways', Math.sign(a.deg) !== Math.sign(b.deg));
  check('and shift opposite ways with them', Math.sign(a.shift) !== Math.sign(b.shift));
  check('the lean stays small', Math.abs(a.deg) >= 1.3 && Math.abs(a.deg) <= 2.4, `${a.deg}deg`);
  eq('a chip keeps its angle when the pile changes', chipTilt(4).deg, a.deg);
}

console.log('\na knock fades as it travels down the pile');
{
  const hit = impactStrength(0, 58);
  const one = impactStrength(1, 58);
  const three = impactStrength(3, 58);
  check('the chip that landed takes the most', hit.jolt > one.jolt && one.jolt > three.jolt);
  check('and squashes the most', hit.squash < one.squash && one.squash < three.squash);
  check('nothing squashes visibly far', three.squash > 0.985, `${three.squash}`);
  check('a small chip takes a smaller shove', impactStrength(0, 24).jolt < hit.jolt);
}

console.log('\nthe stylesheet still lands the chip where the code says it does');
{
  // The fall lives in CSS keyframes and the knock is scheduled in TS. If the touchdown
  // frame is moved without moving IMPACT_AT, the pile reacts before or after the chip
  // arrives — which is exactly the kind of drift nobody notices for weeks.
  // the working copy is CRLF on Windows; compare against one shape of newline
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const drop = css.slice(css.indexOf('@keyframes chip-drop-in'));
  const body = drop.slice(0, drop.indexOf('}\n}') + 3);
  const touchdown = body.match(/(\d+)% \{ transform: translate3d\(0, 0, 0\); \}/);

  check('the drop keyframes are there', body.includes('chip-drop-in'));
  eq('and it touches down at IMPACT_AT', Number(touchdown?.[1]), Math.round(IMPACT_AT * 100));

  const start = body.match(/0% \{ transform: translate3d\(0, calc\(var\(--drop[^)]*\) \* (-?[\d.]+)\)/);
  eq('starting a whole drop above the pile', Number(start?.[1]), -1);

  // the first bounce should be about the restitution squared, not a hand-picked number
  const peak = Number(body.match(/73% \{ transform: translate3d\(0, calc\(var\(--drop[^)]*\) \* (-?[\d.]+)\)/)?.[1]);
  const want = -(RESTITUTION * RESTITUTION);
  check('the first bounce is e^2 of the drop', Math.abs(peak - want) < 0.004, `${peak} vs ${want.toFixed(4)}`);
}

console.log('\nwhere the animation is allowed to play');
{
  eq('default: the Plan screen, where the slider moves stacks', animatedHere(undefined, 'plan'), true);
  eq('default: the Table reference picture holds still', animatedHere(undefined, 'table'), false);
  eq('off means off on Plan', animatedHere('off', 'plan'), false);
  eq('off means off on the Table', animatedHere('off', 'table'), false);
  eq('everywhere covers the Table too', animatedHere('all', 'table'), true);
  eq('everywhere still covers Plan', animatedHere('all', 'plan'), true);
}

console.log(`\n${failures === 0 ? 'stackDrop: all checks passed' : `stackDrop: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
