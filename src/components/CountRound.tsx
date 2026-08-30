import { useState } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { useWakeLock } from '../lib/useWakeLock';
import StackShareRound from './StackShareRound';
import PassAroundRound from './PassAroundRound';
import type { LedgerSnapshot } from '../types';

/**
 * The way into the counting round — and the one question it asks before it starts.
 *
 * There are two honest ways to count a table and they need different screens, not a
 * setting buried three taps deep: either ONE person holds the phone and divides the
 * pot by eye (StackShareRound), or the phone goes ROUND and everybody counts their
 * own pile (PassAroundRound). A table does the same thing every week, so the answer
 * is asked once and then remembered — with a way back on both screens, because the
 * night one player is missing is the night you swap.
 *
 * The screen also stays awake for as long as the round is open: a phone that goes
 * round the table spends most of the round in nobody's hand.
 */
export default function CountRound({
  levelIdx,
  onClose,
  onUndoable,
}: {
  levelIdx?: number | null;
  onClose: () => void;
  onUndoable?: (previous: LedgerSnapshot) => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const [style, setStyle] = useState<'solo' | 'pass' | null>(state.settings.countStyle ?? null);

  useWakeLock(true);
  useBackHandler(style === null, onClose);

  const pick = (next: 'solo' | 'pass') => {
    setStyle(next);
    dispatch({ type: 'UPDATE_SETTINGS', patch: { countStyle: next } });
  };

  if (style === 'pass') {
    return (
      <PassAroundRound
        levelIdx={levelIdx}
        onClose={onClose}
        onUndoable={onUndoable}
        onSwitchStyle={() => pick('solo')}
      />
    );
  }

  if (style === 'solo') {
    return (
      <StackShareRound
        levelIdx={levelIdx}
        onClose={onClose}
        onUndoable={onUndoable}
        onSwitchStyle={() => pick('pass')}
      />
    );
  }

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">{t('count.styleTitle')}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        <button className="pass-style" onClick={() => pick('solo')}>
          <span className="pass-style-icon">👤</span>
          <b>{t('count.styleSolo')}</b>
          <span className="faint">{t('count.styleSoloNote')}</span>
        </button>
        <button className="pass-style" onClick={() => pick('pass')}>
          <span className="pass-style-icon">🔁</span>
          <b>{t('count.stylePass')}</b>
          <span className="faint">{t('count.stylePassNote')}</span>
        </button>
      </div>
    </div>
  );
}
