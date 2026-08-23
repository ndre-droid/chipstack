import { createPortal } from 'react-dom';
import type { BlindLevel } from '../types';
import { IconPlay, IconPause, IconChevron } from './Icons';
import { useT } from '../lib/i18n';
import { useBackHandler } from '../lib/backHandler';
import { useWakeLock } from '../lib/useWakeLock';

interface Props {
  levelIdx: number;
  level: BlindLevel | undefined;
  next: BlindLevel | undefined;
  seconds: number;
  running: boolean;
  onBreak?: boolean;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onClose: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The phone laid flat in the middle of the table, being the clock.
 *
 * TV mode is built for a landscape big screen across the room; this is the same
 * job at arm's length on a phone that may be in either orientation. Reachable by
 * tapping the time in the sticky bar, which is where you were already looking.
 */
export default function ClockFocus({ levelIdx, level, next, seconds, running, onBreak, onToggle, onStep, onClose }: Props) {
  const t = useT();
  useBackHandler(true, onClose);
  useWakeLock(true);

  return createPortal(
    <div className="clock-focus" role="dialog" aria-modal="true">
      <button className="cf-close icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>

      <div className="cf-level">{onBreak ? t('tv.break') : `${t('plan.level')} ${levelIdx + 1}`}</div>
      <div className="cf-blinds">
        {level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
        {level?.ante ? <span className="cf-ante"> · {t('common.ante')} {level.ante}</span> : null}
      </div>
      <div className={`cf-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmt(seconds)}</div>
      <div className="cf-next">{next ? `${t('table.nextLevel')} ${next.smallBlind} / ${next.bigBlind}` : t('tv.finalLevel')}</div>

      <div className="cf-controls">
        <button className="icon-btn" onClick={() => onStep(-1)} aria-label={t('table.prevLevel')}>
          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
            <IconChevron size={22} />
          </span>
        </button>
        <button className="cf-play" onClick={onToggle} aria-label={running ? t('table.pause') : t('table.play')}>
          {running ? <IconPause size={30} /> : <IconPlay size={30} />}
        </button>
        <button className="icon-btn" onClick={() => onStep(1)} aria-label={t('table.nextLevelBtn')}>
          <IconChevron size={22} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
