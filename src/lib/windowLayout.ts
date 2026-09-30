import { useEffect, useState } from 'react';

/**
 * Which shape the window is: a phone, or something with room to spare.
 *
 * The whole wide layout is CSS hanging off ONE attribute on <html>, so switching
 * shape costs no React render at all — which matters because the switch happens
 * while a Fold is being opened, with a clock ticking behind it.
 *
 * The threshold is width AND height, and it is the Material window-size-class
 * boundary between compact and medium (600dp). Height is what keeps phones out:
 * an S22 in landscape is ~800x360 and wants the tuned landscape rules, and a
 * Fold's COVER screen is ~412x960 — wider than an S22 but no taller, so it is
 * still a phone. Opened out, the same Fold reports ~832x750 and crosses over.
 *
 * Crossing this line buys the rail and a wider column, and nothing else: 832dp
 * standing up is the MEDIUM class, where the guidance is a navigation rail and
 * ONE pane. Whether a side column comes off it is a separate question with a
 * separate threshold — see `SideColumn` below.
 */
export type WindowLayout = 'compact' | 'wide';

/**
 * ...and, separately, whether the page gets a SIDE COLUMN, and how wide.
 *
 * A second attribute rather than a third value of the first one, deliberately.
 * Every wide rule in the stylesheet — the rail, the header, the grids that open
 * out — is true of every wide shape, and a third value would mean rewriting all
 * of them. `data-side` is written by the same `apply()` inside the same view
 * transition, so the two never disagree and the fold still animates as one
 * movement.
 *
 * - `narrow`: a Fold standing up (~757x840). ~208px comes off the side for the
 *   one thing you keep looking at, and the page drops back to a phone's width.
 * - `wide`: a panel lying LANDSCAPE — a Fold 7 on its side, and a Fold 8 held
 *   normally, whose 4:3 inner screen is ~932x700dp. The column grows to ~300px
 *   and takes more of the screen's answer (the Table's starting stack joins the
 *   clock), and the page is still ONE column of about a phone's width.
 *
 * There used to be a two-equal-columns shape here. The user tried it on the
 * Fold and turned it down (2026-09-30): the night reads as one list with the
 * clock beside it, not as two halves of a form.
 *
 * The landscape test is ORIENTATION first and width second: landscape, at least
 * 800dp of width, at least 520dp of height. Its height floor sits BELOW `WIDE`'s
 * 600 on purpose — a Fold 8 with Screen zoom or three-button navigation lands at
 * ~816x580, and that is still a big landscape panel, not a phone on its side
 * (an S22 is ~800x360, a Fold's cover screen ~960x412; both stay under it).
 */
export type SideColumn = 'none' | 'narrow' | 'wide';

export interface WindowShape {
  layout: WindowLayout;
  side: SideColumn;
}

const WIDE = '(min-width: 600px) and (min-height: 600px)';
const LANDSCAPE = '(min-aspect-ratio: 1 / 1) and (min-width: 800px) and (min-height: 520px)';
/**
 * Wide enough to take 208px off the side and still leave a page.
 *
 * Its own threshold rather than `WIDE`, because the two answer different
 * questions. `WIDE` asks whether the tabs can leave the bottom edge, which they
 * can at 600dp; this asks whether there is a PAGE left after the rail (80), the
 * screen's padding (48), the column (208) and the gutter (20) — 356dp of
 * furniture. At 600dp that leaves 244dp of page, narrower than the phone the
 * cards were drawn for, which is the mistake this whole section exists to undo.
 * At 720 it leaves 364, and a Fold standing up (757 by the second-hand numbers)
 * leaves about 400 — a phone's width, which is the target.
 */
const SIDE = '(min-width: 720px) and (min-height: 600px)';
const CALM = '(prefers-reduced-motion: reduce)';

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;

function sideColumn(): SideColumn {
  if (matches(LANDSCAPE)) return 'wide';
  return matches(SIDE) ? 'narrow' : 'none';
}

/** What the window is now. */
function measure(): WindowShape {
  const side = sideColumn();
  /* A side column IMPLIES the wide chrome. LANDSCAPE's height floor (520) sits
     under WIDE's (600), and without this a Fold 8 at ~816x580 drew the page with
     the phone's bottom tab bar floating across it. */
  return { layout: side !== 'none' || matches(WIDE) ? 'wide' : 'compact', side };
}

/** What the page is currently drawn as. Read back from the DOM rather than kept
 *  in a variable beside it: the two can only disagree if one of them lies, and
 *  the attribute is the one the stylesheet actually obeys. */
function drawn(): WindowShape {
  const d = document.documentElement.dataset;
  return {
    layout: d.layout === 'wide' ? 'wide' : 'compact',
    side: d.side === 'wide' || d.side === 'narrow' ? d.side : 'none',
  };
}

const same = (a: WindowShape, b: WindowShape) => a.layout === b.layout && a.side === b.side;

function apply(shape: WindowShape) {
  const d = document.documentElement.dataset;
  d.layout = shape.layout;
  d.side = shape.side;
}

/* Written at import time, before React renders anything: the first paint is
   already the right shape, so an unfolded phone never flashes the phone layout
   on the way to the wide one. */
if (typeof document !== 'undefined') apply(measure());

/**
 * Crosses over, with the fold animated.
 *
 * A view transition is the only way to animate this: the tab bar does not move
 * to the left edge, it stops existing and a rail starts existing, and no CSS
 * transition can cross that. `startViewTransition` snapshots the screen as it
 * is, lets the callback swap the attribute, and cross-fades the two.
 *
 * Unsupported browser, or someone who has asked for less motion: the attribute
 * just changes and the layout snaps, exactly as it did before.
 *
 * The shape is compared against what is DRAWN, never against a variable updated
 * on the way into the transition. A transition can be skipped — a hidden
 * document is enough — and then the attribute is never written; a variable that
 * already claims the new shape makes every later change look like no change at
 * all, and the layout stays wrong until a reload.
 *
 * There is deliberately no "one at a time" lock either. A transition takes a
 * few hundred ms, a hinge can be half-opened and shut again inside that, and a
 * lock held by an animation that never reports finishing swallows the change
 * that matters. Starting a second transition is already defined: the browser
 * skips the first. The `drawn()` check above, plus the debounce on the way in,
 * is what keeps that from happening for no reason.
 */
function sync() {
  const next = measure();
  if (same(next, drawn())) return;

  const start = document.startViewTransition?.bind(document);
  if (!start || window.matchMedia(CALM).matches) {
    apply(next);
    return;
  }

  /* An aborted or skipped transition is a normal outcome here, not an error to
     report — the hinge moved again, or the app went to the background mid-fade.
     BOTH promises have to be answered: an unhandled rejection on `ready` shows
     up in the console just as loudly as one on `finished`. */
  const transition = start(() => apply(next));
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});

  /* And a belt: if the transition was skipped in a way that never ran the
     callback, the page is left in the shape the window no longer has. Nothing
     about the animation is worth that, so check once it should be over and set
     the attribute the blunt way. */
  setTimeout(() => {
    const now = measure();
    if (!same(now, drawn())) apply(now);
  }, 500);
}

/**
 * Which side column this window has, if any — `components/Support.tsx` moves a
 * screen's answer into it.
 *
 * Read from the media queries the attribute is written from rather than from the
 * attribute itself — a component that re-renders on a media query cannot be a
 * frame behind the stylesheet, and the answer decides where a subtree is
 * MOUNTED, which CSS cannot do for it.
 */
export function useSideColumn(): SideColumn {
  const [side, setSide] = useState(sideColumn);

  useEffect(() => {
    const queries = [window.matchMedia(SIDE), window.matchMedia(LANDSCAPE)];
    const read = () => setSide(sideColumn());
    for (const mq of queries) {
      if (mq.addEventListener) mq.addEventListener('change', read);
      else mq.addListener(read);
    }
    /* Same backstop as `useWindowLayout`: a webview resized from outside can
       reflow without ever firing the media query. Undebounced on purpose — this
       one only calls `setState` with a value that is usually unchanged, which
       React drops, and being late here means the side column is empty for a
       frame. */
    window.addEventListener('resize', read);
    read();
    return () => {
      for (const mq of queries) {
        if (mq.removeEventListener) mq.removeEventListener('change', read);
        else mq.removeListener(read);
      }
      window.removeEventListener('resize', read);
    };
  }, []);

  return side;
}

/** Call once, high in the tree. */
export function useWindowLayout() {
  useEffect(() => {
    const queries = [window.matchMedia(WIDE), window.matchMedia(SIDE), window.matchMedia(LANDSCAPE)];
    const onChange = () => sync();

    /* Two ways in, because neither one is enough on its own.
       The media query is the precise signal — it wakes only when the answer
       actually changes — but it is not guaranteed to arrive: a webview resized
       from outside (and Chrome under device emulation, which is how this gets
       tested) can reflow the page without ever dispatching it. A plain resize
       always arrives, so it is the backstop; `sync` reads the window itself and
       returns immediately when the shape has not changed, so the extra calls
       cost a media-query read and nothing else.
       Debounced because a fold is a burst of resizes, not one, and starting an
       animation per frame of that burst would fight itself. */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 150);
    };

    for (const mq of queries) {
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else mq.addListener(onChange);
    }
    window.addEventListener('resize', onResize);
    // The window can have changed shape between module load and this effect.
    sync();

    return () => {
      clearTimeout(timer);
      for (const mq of queries) {
        if (mq.removeEventListener) mq.removeEventListener('change', onChange);
        else mq.removeListener(onChange);
      }
      window.removeEventListener('resize', onResize);
    };
  }, []);
}
