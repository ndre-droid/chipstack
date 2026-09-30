import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSideColumn } from '../lib/windowLayout';

/**
 * The one thing on a screen you keep looking at while you work the rest of it.
 *
 * On a phone this is nothing at all: the children render exactly where they are
 * written, in the order they have always been in. On an unfolded Fold — standing
 * up or lying landscape — the same children move into a column pinned beside
 * the page, and the page keeps scrolling
 * underneath them.
 *
 * MOVED, never copied. The alternative was a second condensed summary rendered
 * only when there is room for it, and then the answer to "how many chips does
 * everyone start with" has two sources that drift. What goes in here is the
 * element the screen already had; it just stops travelling with the scroll.
 *
 * That also fixes the thing this was built for. A 630px column with a phone's
 * cards poured into it stretches every control to twice the width its content
 * needs — four buy-in pills 190px wide for three characters, a label and its
 * stepper 450px apart. Taking ~210px out for the side column puts the page back
 * at about the width the cards were drawn for, so the stretching goes away as a
 * consequence of the layout rather than as forty tuned rules.
 *
 * More than one per screen is fine: each block is its own card in the column,
 * and the column orders them with CSS (`.support-<name> { order }`), because
 * portals append in MOUNT order — a block that mounts later, like the clock once
 * a timer is switched on, would otherwise land at the bottom.
 */

/**
 * The element this screen's side column lives in, or null on a screen that is not
 * mounted into one.
 *
 * Per screen, not per app: App.tsx keeps every visited screen mounted, so a single
 * shared slot would be written by four screens at once — the three in the
 * background included. Each `<main class="screen">` owns its own slot and only the
 * one on top is visible, which needs no liveness signal at all.
 */
export const SupportSlot = createContext<HTMLElement | null>(null);

/**
 * `name` is appended to the card's class in the side column (`support-card
 * support-plan`) and used nowhere else, so a screen can style the moved block for
 * its new home without a rule that also hits it on the phone.
 */
export default function Support({
  name,
  wideOnly = false,
  columnOnly = false,
  children,
}: {
  name?: string;
  /** Only the ~300px landscape column has room for this; the 208px one leaves it
   *  on the page. */
  wideOnly?: boolean;
  /** Exists ONLY in the column — nothing at all on the page when there is none.
   *  For aids that the column's room makes possible (the Settings index), not for
   *  content the screen has anyway. */
  columnOnly?: boolean;
  children: ReactNode;
}) {
  const slot = useContext(SupportSlot);
  const column = useSideColumn();
  const side = column === 'wide' || (column === 'narrow' && !wideOnly);

  /* A wrapper either way, and `display: contents` when it is not in the column —
     so the phone's box tree is the one it always was, while the side column has a
     single element to make a card out of. Without it the moved block would arrive
     as a bare run of divs and every screen would need its own wrapper anyway. */
  const block = (
    <div className={side && slot ? `support-card${name ? ` support-${name}` : ''}` : 'support-inline'}>
      {children}
    </div>
  );

  if (side && slot) return createPortal(block, slot);
  return columnOnly ? null : block;
}
