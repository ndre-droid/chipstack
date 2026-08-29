import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import {
  COLUMN_CHIPS,
  calibrate,
  chipsAt,
  isCalibrated,
  rulerCapacity,
  rulerTotal,
  spanFor,
} from '../lib/chipRuler';
import type { Denomination } from '../types';

/**
 * Measure one colour instead of counting it.
 *
 * Lay the column flat on the glass with its base on the baseline, drag the bar up
 * to its top, read the number. The maths and the reasoning behind the calibration
 * live in lib/chipRuler.ts; what this file adds is the physical staging, and that
 * part is not decoration:
 *
 * The baseline is drawn INSIDE the screen, not at the phone's edge, because a case
 * has a raised lip and a column pressed against the edge would sit on that lip at
 * some unknown offset. Everything — baseline, column, ticks — happens on the glass,
 * where the case cannot reach.
 *
 * The ladder tops out around 25 chips on a phone, so the sheet counts full columns
 * with a stepper and measures only the remainder. That is not a limitation being
 * worked around; three stacks of twenty are countable at a glance, and the loose
 * seventeen on top is the only part anybody actually dreads.
 */
export default function ChipRuler({
  denom,
  onResult,
  onClose,
}: {
  denom: Denomination;
  /** the counted chips for this colour, handed back to the row that opened us */
  onResult: (chips: number) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { unitValue, currency } = state.settings;
  const pxPerChip = state.settings.chipRulerPx ?? null;

  useBackHandler(true, onClose);

  /** how tall the measuring track is, in CSS px — read from the DOM, never guessed */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackPx, setTrackPx] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const read = () => setTrackPx(el.clientHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** how far the bar sits above the baseline */
  const [dragPx, setDragPx] = useState(0);
  const [columns, setColumns] = useState(0);
  /** the ruler refuses to measure until it has been calibrated — see the lib */
  const [calibrating, setCalibrating] = useState(!isCalibrated(pxPerChip));
  const [calChips, setCalChips] = useState(COLUMN_CHIPS);
  const [calError, setCalError] = useState(false);

  const calibrated = isCalibrated(pxPerChip);
  const measured = calibrating || !calibrated ? 0 : chipsAt(dragPx, pxPerChip);
  const capacity = calibrating || !calibrated ? 0 : rulerCapacity(trackPx, pxPerChip);
  const total = rulerTotal({
    columns,
    columnSize: COLUMN_CHIPS,
    measured,
    inventory: denom.count,
  });

  const moveTo = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDragPx(Math.max(0, Math.min(rect.height, rect.bottom - clientY)));
    setCalError(false);
  };

  /* One gesture for the whole track: press anywhere to put the bar there, keep the
     finger down to slide it. Pointer capture matters here — with a column of chips
     under the other hand a finger easily wanders off the track, and without capture
     the bar would stop dead where it left instead of following. */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    trackRef.current?.setPointerCapture(e.pointerId);
    moveTo(e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackRef.current?.hasPointerCapture(e.pointerId)) return;
    moveTo(e.clientY);
  };

  /** ± a single chip, for when the drag lands a hair off */
  const nudge = (by: number) => {
    if (!calibrated) return;
    setDragPx((px) =>
      Math.max(0, Math.min(trackPx, spanFor(Math.max(0, chipsAt(px, pxPerChip) + by), pxPerChip))),
    );
  };

  const saveCalibration = () => {
    const px = calibrate(dragPx, calChips);
    if (px === null) {
      setCalError(true);
      return;
    }
    dispatch({ type: 'UPDATE_SETTINGS', patch: { chipRulerPx: px } });
    setCalibrating(false);
    setDragPx(0);
  };

  /** ticks: one per chip, bolder every five, priced every full column */
  const ticks: number[] = [];
  for (let n = 1; n <= capacity; n++) ticks.push(n);

  return (
    <div className="cr-sheet ruler-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">
          <span className="cr-swatch" style={{ background: denom.color, borderColor: denom.accent }} />
          {num(denom.value)}
        </div>
        <div className="cr-prev">{calibrating ? t('ruler.calibrateTitle') : t('ruler.title')}</div>
        {!calibrating && (
          <button
            className="ruler-recal icon-btn"
            onClick={() => { setCalibrating(true); setDragPx(0); setCalError(false); }}
            aria-label={t('ruler.recalibrate')}
          >
            ⋯
          </button>
        )}
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      {calibrating ? (
        <p className="ruler-hint">{t('ruler.calibrateHint', { n: calChips })}</p>
      ) : (
        <div className="ruler-columns">
          <span>{t('ruler.fullColumns')}</span>
          <button className="cr-btn" onClick={() => setColumns((c) => Math.max(0, c - 1))} aria-label="−1">−</button>
          <b>{columns}</b>
          <button className="cr-btn" onClick={() => setColumns((c) => c + 1)} aria-label="+1">+</button>
          <span className="ruler-columns-sum">{columns * COLUMN_CHIPS}</span>
        </div>
      )}

      <div className="ruler-stage" ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
        {ticks.map((n) => (
          <div
            key={n}
            className={`ruler-tick${n % COLUMN_CHIPS === 0 ? ' col' : n % 5 === 0 ? ' five' : ''}`}
            style={{ bottom: n * (pxPerChip ?? 0) }}
          >
            {n % COLUMN_CHIPS === 0 && <span>{money(n * denom.value * unitValue, currency)}</span>}
          </div>
        ))}

        <div className="ruler-bar" style={{ bottom: dragPx }}>
          <span className="ruler-grip" />
          <span className="ruler-read">
            {calibrating ? (
              t('ruler.calibrateRead', { n: calChips })
            ) : (
              <>
                <b>{measured}</b> · {money(measured * denom.value * unitValue, currency)}
              </>
            )}
          </span>
        </div>

        <div className="ruler-base" />
      </div>

      {calError && <p className="ruler-error">{t('ruler.calibrateBad')}</p>}

      {calibrating ? (
        <div className="cr-bar ruler-cal-bar">
          <div className="ruler-cal-n">
            <button className="cr-btn" onClick={() => setCalChips((n) => Math.max(5, n - 5))}>−5</button>
            <b>{calChips}</b>
            <button className="cr-btn" onClick={() => setCalChips((n) => Math.min(40, n + 5))}>+5</button>
          </div>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={dragPx <= 0} onClick={saveCalibration}>
            {t('ruler.calibrateSave')}
          </button>
        </div>
      ) : (
        <>
          <div className="ruler-nudge">
            <button className="cr-btn" onClick={() => nudge(-1)} aria-label="−1">−</button>
            <div className="cr-total ruler-total">
              <span>{total} {t('plan.chips').toLowerCase()}</span>
              <b>{money(total * denom.value * unitValue, currency)}</b>
            </div>
            <button className="cr-btn" onClick={() => nudge(1)} aria-label="+1">+</button>
          </div>
          <div className="cr-bar">
            <button className="btn btn-ghost" onClick={onClose}>{t('count.close')}</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={total <= 0}
              onClick={() => { onResult(total); onClose(); }}
            >
              {t('ruler.use', { n: total })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
