import { useEffect } from 'react';

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
 * Note what is deliberately NOT here: a second, two-pane layout. 832dp is the
 * MEDIUM class, where the guidance is a navigation rail and a single pane —
 * two panes start at 840dp, and forcing them onto a Fold gives two columns
 * narrower than the phone the app was designed for.
 */
export type WindowLayout = 'compact' | 'wide';

const WIDE = '(min-width: 600px) and (min-height: 600px)';
const CALM = '(prefers-reduced-motion: reduce)';

/** What the window is now. */
function measure(): WindowLayout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'compact';
  return window.matchMedia(WIDE).matches ? 'wide' : 'compact';
}

/** What the page is currently drawn as. Read back from the DOM rather than kept
 *  in a variable beside it: the two can only disagree if one of them lies, and
 *  the attribute is the one the stylesheet actually obeys. */
function drawn(): WindowLayout {
  return document.documentElement.dataset.layout === 'wide' ? 'wide' : 'compact';
}

function apply(layout: WindowLayout) {
  document.documentElement.dataset.layout = layout;
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
  if (next === drawn()) return;

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
    if (now !== drawn()) apply(now);
  }, 500);
}

/** Call once, high in the tree. */
export function useWindowLayout() {
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
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

    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    window.addEventListener('resize', onResize);
    // The window can have changed shape between module load and this effect.
    sync();

    return () => {
      clearTimeout(timer);
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);
}
