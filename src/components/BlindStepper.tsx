import type { BlindLevel } from '../types';
import { useT } from '../lib/i18n';
import { IconChevron } from './Icons';

interface Props {
  levels: BlindLevel[];
  levelIdx: number;
  /** step the ladder by ±1 — local on the phone, a clock command while hosting */
  onStep: (delta: number) => void;
}

/**
 * Manual blind control for a cash game with the timer off. There's no countdown to
 * advance the ladder, so the table raises the blinds when it agrees to — this is the
 * button that does it, on the phone. The big screen has its own compact stepper in
 * the TV controls.
 *
 * Renders nothing for a single-level ladder: there is nothing to step through.
 */
export default function BlindStepper({ levels, levelIdx, onStep }: Props) {
  const t = useT();
  if (levels.length < 2) return null;

  const idx = Math.max(0, Math.min(levels.length - 1, levelIdx));
  const level = levels[idx];
  const next = levels[idx + 1];

  return (
    <>
      <div className="section-label">
        {t('table.manualBlinds')}
        <span className="hint">{t('table.manualBlindsHint')}</span>
      </div>
      <div className="card clock-card">
        <div className="clock-face">
          <div className="clock-level">{t('tv.level', { n: idx + 1 })}</div>
          <div className="clock-blinds">
            {level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
            {level?.ante ? <span className="clock-ante"> · {t('common.ante')} {level.ante}</span> : null}
          </div>
          <div className="clock-next">
            {next ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` }) : t('tv.topLevel')}
          </div>
        </div>
        <div className="clock-controls">
          <button className="icon-btn" onClick={() => onStep(-1)} disabled={idx <= 0} aria-label={t('tv.lowerBlinds')}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
              <IconChevron size={20} />
            </span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onStep(1)} disabled={!next}>
            {t('tv.raiseBlinds')}
          </button>
        </div>
      </div>
    </>
  );
}
