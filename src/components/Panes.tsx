import type { ReactNode } from 'react';

/**
 * Two columns of cards on a screen wide enough to hold them — one column
 * everywhere else.
 *
 * The split is CONTIGUOUS, and that is the whole trick. `left` is the run of
 * sections a screen already showed first and `right` is the rest, so on a phone
 * the two panes collapse to `display: contents` and the sections flow in exactly
 * the order they always did. Nothing is reordered, nothing is duplicated, and
 * there is no second render path to keep in step with the first — the phone
 * layout and the two-column layout are the same JSX seen through one CSS rule.
 *
 * That constraint is also why this takes two nodes instead of an array of
 * sections with column numbers on them: a non-contiguous split would silently
 * shuffle the phone's running order, which is the layout that gets used every
 * week.
 *
 * Which screens are wide enough — and when the attribute flips — belongs to
 * lib/windowLayout.ts (`data-panes` on <html>). See `.panes` in styles.css.
 */
export default function Panes({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="panes">
      <div className="pane">{left}</div>
      <div className="pane">{right}</div>
    </div>
  );
}
