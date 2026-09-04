import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { haptic } from '../lib/platform';
import {
  CALIBRATION_STEPS,
  calibrate,
  calibrationFor,
  chipsAt,
  hiddenChips,
  isCalibrated,
  minMeasurable,
  readScreenShape,
  rulerCapacity,
  screenKeyOf,
  spanFor,
  stacksTotal,
  teach,
  withCalibration,
} from '../lib/chipRuler';
import type { Denomination } from '../types';

/** the smallest and largest one-tap rows offered for a pile too short to measure */
const TINY_MIN = 5;
const TINY_MAX = 8;
/** a felt landmark every full column */
const COLUMN_CHIPS = 20;
/** don't buzz faster than this, or a quick drag turns into one long blur */
const HAPTIC_GAP_MS = 28;
/* Buzz lengths in ms. Anything under about 10 ms is below the threshold of a phone's
   vibrator — it is issued, it is even honoured, and nobody feels a thing. */
const BUZZ_CHIP = 11;
const BUZZ_COLUMN = 28;

/**
 * Measure a colour instead of counting it.
 *
 * The phone stands on the table next to a pile, you drag the bar to the top of it,
 * and the length becomes a count. The maths and the two-point calibration live in
 * lib/chipRuler.ts; what this file adds is the staging, and none of it is decoration:
 *
 * A player's chips of one colour are rarely one neat pile, so the sheet logs a LIST
 * of stacks rather than asking for a single number. Measure, add, move the phone,
 * measure again. Most piles at a table are the same height, so "same again" repeats
 * the last one in a tap — three columns of twenty is one drag and two taps.
 *
 * The first few chips of every pile are below the screen (the table is a case bottom
 * and a bezel underneath the lowest pixel), so a two-chip pile is not something the
 * ruler can be persuaded to see. Those get tapped in, and that row sits above the
 * ladder rather than hidden behind a mode.
 *
 * NOTHING is put below the ladder, or over it. The scale itself is safe either way
 * now — `belowPx` is measured and added back, so chrome under the sheet costs range
 * and not accuracy — but pixels that cannot be dragged to are chips that cannot be
 * measured, and a button bar's worth of them is four or five chips of typing under
 * every single stack. Chrome that merely FLOATS over the foot is no better: the
 * pixels it covers are just as unreachable. So the sheet has no bottom bar at all:
 * close and confirm live in the header, and the ladder owns every pixel from the last
 * line of text down to the glass, at every window size. Above the ladder anything may
 * come and go — it only shortens the top.
 *
 * The bar's grip sits on the RIGHT. The phone is held in the left hand against the
 * pile and dragged with the right thumb by most people, and a grip on the left is
 * a hand across the very chips being measured.
 *
 * The bar buzzes once per chip as it moves. That is the difference between reading a
 * number and feeling one: you can watch the chips instead of the screen while you
 * drag, and a stack that ticks twenty times on the way up has confirmed the
 * calibration without anybody checking it.
 *
 * TWO screens, and the ruler knows which one it is on. A folding phone's panels are
 * in different density buckets — a few percent, a whole chip on a tall stack — and
 * shut it stands on a different edge than it does open, which is the entire offset.
 * So the calibration is looked up by `screenKeyOf` and folding the phone while the
 * sheet is open switches to that screen's own, or asks for it. The stacks already
 * logged survive the fold: they are counts of chips, and no screen changes those.
 *
 * And every height handed to the maths is measured from the bottom of the GLASS, not
 * from the bottom of the ladder — `belowPx` is added back before asking. On a phone
 * they are the same pixel. They stop being the same pixel the moment any layout puts
 * anything under the sheet, and the difference is silently four or five chips under
 * every stack, so it is added rather than assumed away.
 */
export default function ChipRuler({
  denom,
  onResult,
  onClose,
  calibrateOnly = false,
}: {
  /** the colour being counted — absent when the sheet was opened only to calibrate */
  denom?: Denomination;
  /** the counted chips for this colour, handed back to the row that opened us */
  onResult?: (chips: number) => void;
  onClose: () => void;
  /**
   * Opened from Settings to measure this screen and nothing else.
   *
   * Calibration used to be something you met for the first time at the table,
   * mid-count, with four people waiting — and again on the other panel, and again
   * lying down. This is the same two drags done on a Tuesday: it always starts on
   * step one, there is no colour and no running total, and solving it closes the
   * sheet rather than dropping into a count nobody asked for.
   */
  calibrateOnly?: boolean;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { unitValue, currency } = state.settings;
  const cals = state.settings.chipRulerCals;
  const legacy = state.settings.chipRuler;
  const buzz = state.settings.countHaptics ?? true;

  useBackHandler(true, onClose);

  /* Which piece of glass this is. Watched rather than read once: the phone can be
     folded open with the sheet on screen, and that is a different screen with a
     different scale under the same React tree. The layout class is part of the key
     and lib/windowLayout writes it on its own debounce — sometimes inside a view
     transition, after a resize listener would already have run — so the attribute
     itself is watched instead of being raced for. */
  const [screen, setScreen] = useState(() => screenKeyOf(readScreenShape()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => setScreen(screenKeyOf(readScreenShape()));
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 200);
    };
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
    window.addEventListener('resize', later);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', later);
      obs.disconnect();
    };
  }, []);

  const cal = calibrationFor(cals, screen);
  /** other screens this device has been calibrated on — why it is asking again */
  const otherScreens = Object.keys(cals ?? {}).filter((k) => k !== screen).length;

  /* One calibration existed before a device could have two screens. Adopt it for the
     screen the ruler is opened on next and retire the field: that is the only screen
     it can honestly be claimed to have been measured on, and if the guess is wrong
     the very first stack says so out loud. */
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !isCalibrated(legacy) || Object.keys(cals ?? {}).length > 0) return;
    adopted.current = true;
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: { chipRulerCals: withCalibration(cals, screen, legacy), chipRuler: null },
    });
  }, [legacy, cals, screen, dispatch]);

  /** how tall the measuring track is, in CSS px — read from the DOM, never guessed */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackPx, setTrackPx] = useState(0);
  /* Where the ladder's bottom edge is, relative to the bottom of the WINDOW.
     Positive: something sits under the ladder, and that gap is part of the offset —
     measured rather than assumed to be zero, which is what a centred sheet on a wide
     window would otherwise have added to every count in silence. Negative: the
     ladder hangs past the bottom of the window (a stale visual-viewport height does
     this), and the pixels it claims down there cannot be dragged to.
     SIGNED on purpose. Clamping it at zero would leave the second case reading every
     stack too tall by whatever the overhang was, which is the one failure mode a
     ruler must not have. */
  const [belowPx, setBelowPx] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setTrackPx(r.height);
      setBelowPx(Math.round(window.innerHeight - r.bottom));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // the ladder can keep its size while the window under it changes shape
    window.addEventListener('resize', read);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);

  /** how far the bar sits above the bottom edge of the screen */
  const [dragPx, setDragPx] = useState(0);
  /* Whether the bar means anything yet. It cannot be inferred from `dragPx`: the bar
     parked at the bottom still reads three or four chips, because the table is below
     the glass. Without this every fresh stack would start pre-loaded with the
     horizon's worth of chips. */
  const [touched, setTouched] = useState(false);
  /** the stacks logged for this colour so far */
  const [stacks, setStacks] = useState<number[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  /** calibration: null when measuring, otherwise which of CALIBRATION_STEPS we are on */
  const [calStep, setCalStep] = useState<number | null>(calibrateOnly || !isCalibrated(cal) ? 0 : null);
  const [calFirst, setCalFirst] = useState<{ y: number; chips: number } | null>(null);
  const [calError, setCalError] = useState(false);
  /** the stack that was too tall for the ladder to have measured honestly */
  const [calTooTall, setCalTooTall] = useState(false);
  const calibrating = calStep !== null;
  /** what the last correction did to the calibration, shown once and then forgotten */
  const [learn, setLearn] = useState<{ n: number; ok: boolean } | null>(null);

  /* The drag, as a height above the bottom of the GLASS. `dragPx` on its own is a
     height above the LADDER, and a calibration is not in those units. */
  const dragAbs = dragPx + belowPx;
  const measured = !calibrating && touched ? chipsAt(dragAbs, cal) : 0;
  const capacity = calibrating ? 0 : rulerCapacity(trackPx + belowPx, cal);
  /** what has to be tapped rather than measured: the chips no drag can reach */
  const horizon = hiddenChips(cal, belowPx);
  /* ...so the one-tap row stretches to cover them. Past TINY_MAX it stops growing —
     a row of twelve buttons wraps, and a row that wraps grows downwards into the
     ladder, which is the one thing nothing here is allowed to do. Deeper piles than
     that are what the keypad beside it is for. */
  const tiny: number[] = [];
  for (let n = 1; n <= Math.min(TINY_MAX, Math.max(TINY_MIN, horizon)); n++) tiny.push(n);
  const total = stacksTotal(stacks, measured, denom?.count ?? 0);
  /** a measurement is on the bar, so a typed number can mean "no, it was this many" */
  const canCorrect = !calibrating && touched && measured > 0;

  /** one buzz per chip crossed, a firmer one on a full column */
  const lastBuzz = useRef({ chips: -1, at: 0 });
  const buzzFor = (chips: number) => {
    if (!buzz) return;
    const now = Date.now();
    if (chips === lastBuzz.current.chips || now - lastBuzz.current.at < HAPTIC_GAP_MS) return;
    lastBuzz.current = { chips, at: now };
    haptic(chips > 0 && chips % COLUMN_CHIPS === 0 ? BUZZ_COLUMN : BUZZ_CHIP);
  };

  const moveTo = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, rect.bottom - clientY));
    setDragPx(y);
    setTouched(true);
    setCalError(false);
    setCalTooTall(false);
    setLearn(null);
    if (!calibrating) buzzFor(chipsAt(y + belowPx, cal));
  };

  /* One gesture for the whole track: press anywhere to put the bar there, keep the
     finger down to slide it. Pointer capture matters — with a pile of chips under the
     other hand a finger easily wanders off the track, and without capture the bar
     would stop dead where it left instead of following. */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer was already released, or this is not a real one. Capture is a
         nicety — the drag still works without it, and losing the sheet over it
         would not be. */
    }
    // calibrating there is no scale yet, so nothing buzzes per chip: one tick on
    // grabbing the bar is what tells the hand the drag has started
    if (calibrating && buzz) haptic(BUZZ_CHIP);
    moveTo(e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackRef.current?.hasPointerCapture(e.pointerId)) return;
    moveTo(e.clientY);
  };

  /** ± a single chip, for when the drag lands a hair off */
  const nudge = (by: number) => {
    if (!isCalibrated(cal) || !touched) return;
    const next = Math.max(0, chipsAt(dragAbs, cal) + by);
    setDragPx(Math.max(0, Math.min(trackPx, spanFor(next, cal) - belowPx)));
    buzzFor(next);
  };

  /** open the number pad on the measurement that is already on the bar */
  const openCorrect = () => {
    setTyped(String(measured));
    setTyping(true);
  };

  /**
   * A typed number, which means one of two things.
   *
   * With nothing on the bar it is a pile too small to measure, logged as typed. With a
   * measurement on the bar it is a CORRECTION — "the bar says 13, it was 18" — and the
   * ruler learns from it: the drag was honest, only the line through it was wrong, so
   * that (position, true count) pair goes back into the fit. Getting told the truth
   * about the stacks actually on the table is the only calibration data that arrives
   * in the range the counting really happens in.
   */
  const submitTyped = (n: number) => {
    if (n <= 0) return;
    if (canCorrect && n !== measured) {
      const next = teach(cal, { y: dragAbs, chips: n });
      if (next) {
        dispatch({ type: 'UPDATE_SETTINGS', patch: { chipRulerCals: withCalibration(cals, screen, next) } });
      }
      setLearn({ n, ok: !!next });
    }
    log(n);
    setTyped('');
    setTyping(false);
  };

  const log = (chips: number) => {
    if (chips <= 0) return;
    setStacks((s) => [...s, chips]);
    setDragPx(0);
    setTouched(false);
    if (buzz) haptic(16);
  };

  const nextCalStep = () => {
    const chips = CALIBRATION_STEPS[calStep ?? 0];
    /* A stack taller than the ladder pins the bar at the ceiling, and the drag then
       says "this stack is exactly as tall as the screen" — a lie the fit cannot see
       through, and the fastest way to a calibration that reads 18 chips as 13. */
    if (trackPx > 0 && dragPx >= trackPx - 2) {
      setCalTooTall(true);
      return;
    }
    if (calStep === 0) {
      setCalFirst({ y: dragAbs, chips });
      setCalStep(1);
      setDragPx(0);
      setTouched(false);
      haptic(12);
      return;
    }
    const solved = calFirst && calibrate(calFirst, { y: dragAbs, chips });
    if (!solved) {
      // start over rather than keep half a calibration nobody can see
      setCalError(true);
      setCalFirst(null);
      setCalStep(0);
      setDragPx(0);
      setTouched(false);
      return;
    }
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: { chipRulerCals: withCalibration(cals, screen, solved), chipRuler: null },
    });
    setCalStep(null);
    setDragPx(0);
    setTouched(false);
    haptic([12, 60, 12]);
    if (calibrateOnly) onClose();
  };

  /* The phone was folded open (or shut) with the sheet on screen. That is a
     different piece of glass with a different scale — and possibly no calibration at
     all — so the bar stops meaning anything until it is dragged again, and the sheet
     goes back to asking if this screen has never been measured. What is NOT thrown
     away is the list of stacks: those are counts of chips, they were true when they
     were taken, and no amount of folding changes how many chips were in a pile. */
  const knownScreen = useRef(screen);
  useEffect(() => {
    if (knownScreen.current === screen) return;
    knownScreen.current = screen;
    setDragPx(0);
    setTouched(false);
    setCalFirst(null);
    setCalError(false);
    setCalTooTall(false);
    setLearn(null);
    setCalStep(calibrateOnly || !isCalibrated(calibrationFor(cals, screen)) ? 0 : null);
  }, [screen, cals, calibrateOnly]);

  const restartCalibration = () => {
    setCalStep(0);
    setCalFirst(null);
    setCalError(false);
    setCalTooTall(false);
    setDragPx(0);
    setTouched(false);
  };

  /** ticks: one per chip, bolder every five, priced every full column */
  /* every chip the ladder has a pixel for, floating bar or not: a scale that skipped
     the chips behind the buttons would read as a scale that starts at six */
  const ticks: number[] = [];
  for (let n = Math.max(1, minMeasurable(cal, belowPx)); n <= capacity; n++) ticks.push(n);

  const priceOf = (chips: number) =>
    denom ? money(chips * denom.value * unitValue, currency) : '';

  /* Where an untouched bar waits. Not zero: the ladder now ends ON the glass edge, so
     a bar parked at zero has half its grip off the screen and nothing obvious to
     grab. It means nothing until it is dragged — `touched` is what makes it a
     measurement — so it may sit wherever it is easiest to find. */
  const restPx = Math.round(trackPx * 0.35);

  return (
    <div className="cr-sheet ruler-sheet" role="dialog" aria-modal="true">
      <div className="cr-head ruler-head">
        <div className="ruler-head-txt">
          <div className="cr-title">
            {denom ? (
              <>
                <span className="cr-swatch" style={{ background: denom.color, borderColor: denom.accent }} />
                {num(denom.value)}
              </>
            ) : (
              t('ruler.calibrateTitle')
            )}
          </div>
          <div className="cr-prev">
            {calibrating
              ? t('ruler.calibrateStep', { i: (calStep ?? 0) + 1, n: CALIBRATION_STEPS.length })
              : t('ruler.title')}
          </div>
        </div>
        <div className="ruler-head-actions">
          {!calibrating && (
            <button className="icon-btn" onClick={restartCalibration} aria-label={t('ruler.recalibrate')}>
              ⋯
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
          {calibrating ? (
            <button className="btn btn-primary ruler-go" disabled={!touched} onClick={nextCalStep}>
              {t(calStep === 0 ? 'ruler.calibrateNext' : 'ruler.calibrateSaveShort')}
            </button>
          ) : (
            <button
              className="btn btn-primary ruler-go"
              disabled={total <= 0}
              onClick={() => { onResult?.(total); onClose(); }}
              aria-label={t('ruler.use', { n: total })}
            >
              ✓ {total}
            </button>
          )}
        </div>
      </div>

      {calibrating ? (
        <p className="ruler-hint">
          {t(calStep === 0 ? 'ruler.calibrateTall' : 'ruler.calibrateShort', {
            n: CALIBRATION_STEPS[calStep ?? 0],
          })}
        </p>
      ) : (
        <>
          <div className="ruler-strip">
            <div className="ruler-strip-list">
              {stacks.map((n, i) => (
                <button
                  key={`${i}-${n}`}
                  className="ruler-chip"
                  onClick={() => { setStacks((s) => s.filter((_, j) => j !== i)); haptic(8); }}
                  aria-label={t('ruler.dropStack', { n })}
                >
                  {n}<i>✕</i>
                </button>
              ))}
              {measured > 0 && (
                <button
                  className="ruler-chip pending"
                  onClick={openCorrect}
                  aria-label={t('ruler.correct', { n: measured })}
                >
                  {measured}<i>✎</i>
                </button>
              )}
              {!stacks.length && measured <= 0 && <span className="faint">{t('ruler.noStacks')}</span>}
            </div>
            <div className="ruler-strip-sum">
              <b>{total}</b>
              <span>{priceOf(total)}</span>
            </div>
          </div>

          <div className="ruler-tiny">
            <span>{t('ruler.tiny')}</span>
            {tiny.map((n) => (
              <button key={n} className="cr-btn" onClick={() => log(n)}>{n}</button>
            ))}
            <button
              className={`cr-btn ${typing ? 'on' : ''}`}
              onClick={() => (typing ? setTyping(false) : canCorrect ? openCorrect() : setTyping(true))}
              aria-label={canCorrect ? t('ruler.correct', { n: measured }) : t('ruler.typeStack')}
            >
              ⌨
            </button>
          </div>

          {typing && (
            <form
              className="ruler-type"
              onSubmit={(e) => { e.preventDefault(); submitTyped(Math.min(999, Math.max(0, +typed || 0))); }}
            >
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoFocus
                value={typed}
                placeholder={canCorrect ? t('ruler.typeReal') : t('ruler.typeHint')}
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
              />
              <button className="btn btn-primary" type="submit" disabled={!(+typed > 0)}>
                {canCorrect ? t('ruler.fixIt') : t('ruler.addStack')}
              </button>
            </form>
          )}
        </>
      )}

      {!calibrating && (
        <div className="ruler-actions">
          <button className="cr-btn" onClick={() => nudge(-1)} disabled={!touched} aria-label="−1">−</button>
          <button className="btn btn-ghost" disabled={measured <= 0} onClick={() => log(measured)}>
            {t('ruler.addStack')}
          </button>
          <button
            className="btn btn-ghost"
            disabled={!stacks.length}
            onClick={() => log(stacks[stacks.length - 1])}
          >
            {t('ruler.sameAgain')}
          </button>
          <button className="cr-btn" onClick={() => nudge(1)} disabled={!touched} aria-label="+1">+</button>
        </div>
      )}

      <p className={`ruler-foot${calError || calTooTall ? ' bad' : ''}`}>
        {calTooTall
          ? t('ruler.calibrateTooTall')
          : calError
            ? t('ruler.calibrateBad')
            : learn
              ? t(learn.ok ? 'ruler.learned' : 'ruler.learnBad', { n: learn.n })
              : calibrating
                ? t(otherScreens > 0 ? 'ruler.newScreen' : 'ruler.calibrateWhy')
                : horizon > 0
                  ? t(horizon === 1 ? 'ruler.horizon1' : 'ruler.horizon', { n: horizon })
                  : t('ruler.standIt')}
      </p>

      <div className="ruler-stage" ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
        {ticks.map((n) => (
          <div
            key={n}
            className={`ruler-tick${n % COLUMN_CHIPS === 0 ? ' col' : n % 5 === 0 ? ' five' : ''}`}
            style={{ bottom: spanFor(n, cal) - belowPx }}
          >
            {n % COLUMN_CHIPS === 0 && <span>{n} · {priceOf(n)}</span>}
          </div>
        ))}

        <div className="ruler-bar" style={{ bottom: touched ? dragPx : restPx }}>
          <span className="ruler-grip" />
          <span className="ruler-read">
            {calibrating ? (
              t('ruler.calibrateRead', { n: CALIBRATION_STEPS[calStep ?? 0] })
            ) : touched ? (
              <>
                <b>{measured}</b> · {priceOf(measured)}
              </>
            ) : (
              t('ruler.dragMe')
            )}
          </span>
        </div>

        <div className="ruler-base" />
      </div>

    </div>
  );
}
