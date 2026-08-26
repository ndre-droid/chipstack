import {
  DEFAULT_TV_LAYOUT,
  DEFAULT_TV_TEXT_SCALE,
  TV_COLS,
  TV_MIN_W,
  TV_PANEL_IDS,
  TV_ROWS,
  TV_TEXT_MAX,
  TV_TEXT_MIN,
  clampSlot,
  clampTvText,
  gridAreaOf,
  isDefaultTvLayout,
  isDefaultTvTextScale,
  normalizeTvLayout,
  normalizeTvTextScale,
  tvTextVars,
  type TvSlot,
} from './tvLayout.ts';

/**
 * The big screen's arrangement is data now, and it arrives from three places that
 * can all be wrong: an old install, a restored backup, and the phone over the wire.
 * Nothing it can carry may be allowed to put a panel off the grid — a TV has no
 * scrollbar anybody can reach, so a panel placed outside it is simply gone.
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

const onGrid = (s: TvSlot) =>
  s.col >= 1 && s.row >= 1 && s.w >= TV_MIN_W && s.col + s.w - 1 <= TV_COLS && s.row + s.h - 1 <= TV_ROWS;

const base: TvSlot = { col: 1, row: 1, w: 3, h: 3 };

console.log('\nthe default arrangement fits on the grid');
{
  for (const id of TV_PANEL_IDS) check(`${id} is on the grid`, onGrid(DEFAULT_TV_LAYOUT[id]), JSON.stringify(DEFAULT_TV_LAYOUT[id]));
  check('it counts as the default', isDefaultTvLayout({ ...DEFAULT_TV_LAYOUT }));
}

console.log('\nnothing can be placed off the screen');
{
  eq('a column past the right edge is pulled back', clampSlot({ col: 40, row: 1, w: 3, h: 2 }, base).col, TV_COLS - 3 + 1);
  eq('a row past the bottom is pulled back', clampSlot({ col: 1, row: 99, w: 3, h: 2 }, base).row, TV_ROWS - 2 + 1);
  eq('a zero column becomes the first', clampSlot({ col: 0, row: 1, w: 3, h: 2 }, base).col, 1);
  eq('an oversized span is capped', clampSlot({ col: 1, row: 1, w: 99, h: 99 }, base).w, TV_COLS);
  eq('a panel can never be narrower than it reads', clampSlot({ col: 1, row: 1, w: 0, h: 1 }, base).w, TV_MIN_W);
  check('a full-width panel still starts at column 1', clampSlot({ col: 9, row: 1, w: TV_COLS, h: 2 }, base).col === 1);
}

console.log('\nrubbish in, a usable screen out');
{
  eq('null gives the default', isDefaultTvLayout(normalizeTvLayout(null)), true);
  eq('a string gives the default', isDefaultTvLayout(normalizeTvLayout('nope')), true);
  const partial = normalizeTvLayout({ clock: { col: 1, row: 1, w: 12, h: 6 } });
  eq('a panel that was left out keeps its default', partial.legend.col, DEFAULT_TV_LAYOUT.legend.col);
  eq('and the one that was set is honoured', partial.clock.w, 12);
  const junk = normalizeTvLayout({ roster: { col: 'x', row: null, w: NaN, h: -4 } });
  check('junk falls back rather than escaping the grid', onGrid(junk.roster), JSON.stringify(junk.roster));
  for (const id of TV_PANEL_IDS) check(`${id} survives junk`, onGrid(junk[id]));
}

console.log('\ngrid-area is end-exclusive');
{
  eq('a 3x2 at 1/1', gridAreaOf({ col: 1, row: 1, w: 3, h: 2 }), '1 / 1 / 3 / 4');
  eq('a full-height clock', gridAreaOf({ col: 4, row: 1, w: 6, h: TV_ROWS }), `1 / 4 / ${TV_ROWS + 1} / 10`);
}

console.log('\ntext size: a multiplier, kept sane');
{
  eq('the default is untouched', isDefaultTvTextScale(DEFAULT_TV_TEXT_SCALE), true);
  eq('too small is floored', clampTvText(0.1), TV_TEXT_MIN);
  eq('too big is capped', clampTvText(9), TV_TEXT_MAX);
  eq('NaN is 1, not a blank screen', clampTvText(Number.NaN), 1);
  eq('rounded to whole percents', clampTvText(1.234), 1.23);
  const s = normalizeTvTextScale({ clock: 1.5, nonsense: 4 });
  eq('a set role is kept', s.clock, 1.5);
  eq('an unset role is 1', s.players, 1);
  eq('and it is the custom properties the CSS reads', tvTextVars(s)['--tv-fs-clock'], '1.5');
  eq('null gives every role back at 1', isDefaultTvTextScale(normalizeTvTextScale(null)), true);
}

console.log(`\n${failures === 0 ? 'tvLayout: all checks passed' : `tvLayout: ${failures} FAILED`}`);
if (failures) throw new Error(`${failures} check(s) failed`);
