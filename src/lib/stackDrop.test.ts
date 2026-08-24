import { dropDelay, idleDiscs, DROP_STAGGER_MS } from './stackDrop.ts';
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
