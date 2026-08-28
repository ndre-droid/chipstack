import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { handoutAmountOf, handoutLevelOf } from '../lib/startingStack';
import MoneyInput from './MoneyInput';
import { useT, useFmt } from '../lib/i18n';

interface Props {
  /** The blind level being played right now, when there is one (the Table tab). */
  levelIdx?: number;
}

/**
 * THE control that shapes the stack card — how much, and for which blinds.
 *
 * There used to be two chip stacks in the app: the Plan tab's, which answered "what
 * does everyone get for the buy-in", and the Table tab's, which answered "what do I
 * push across for a €45 top-up at level 7". Same question with different inputs, so
 * they are now one card in two places, and this is the piece that says which stack
 * is on screen. Both numbers live in `session` (and therefore in LiveData), so
 * turning the dial on the Plan tab moves the Table tab and the big screen with it.
 *
 * The level stepper never goes below the level being played: chips finer than the
 * table needs are precisely what the whole engine exists to avoid handing out (see
 * `handoutLevelOf`).
 */
export default function StackTuner({ levelIdx }: Props) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { session, settings } = state;
  const { buyIn, blindLevels } = session;
  const { currency } = settings;
  const [custom, setCustom] = useState(false);

  const amount = handoutAmountOf(session);
  const level = handoutLevelOf(session, levelIdx);
  /* The lowest level this card may show: the plan's own starting level, or the one
     the clock is on if the game has moved past it. Stepping down to it clears the
     pin rather than saving a number that means the same thing. */
  const floorLevel = handoutLevelOf({ ...session, handoutLevelIdx: null }, levelIdx);
  const maxLevel = Math.max(floorLevel, blindLevels.length - 1);
  const tuned = amount !== buyIn || level !== floorLevel;

  /* The amounts worth one tap: the buy-in itself, the rebuy the Plan tab already
     knows about, and double the buy-in — deduplicated, because a night where the
     rebuy IS twice the buy-in should not get the same button twice. */
  const quick = useMemo(() => {
    const out: number[] = [buyIn];
    for (const v of [session.lateRebuyAmount, buyIn * 2]) {
      if (v > 0 && !out.some((x) => Math.abs(x - v) < 0.005)) out.push(v);
    }
    return out;
  }, [buyIn, session.lateRebuyAmount]);

  const pickAmount = (v: number) => {
    setCustom(false);
    dispatch({
      type: 'UPDATE_SESSION',
      patch: { handoutAmount: Math.abs(v - buyIn) < 0.005 ? null : v },
    });
  };

  const pickLevel = (i: number) => {
    const next = Math.min(maxLevel, Math.max(floorLevel, i));
    dispatch({ type: 'UPDATE_SESSION', patch: { handoutLevelIdx: next <= floorLevel ? null : next } });
  };

  const reset = () =>
    dispatch({ type: 'UPDATE_SESSION', patch: { handoutAmount: null, handoutLevelIdx: null } });

  const blind = blindLevels[Math.min(level, blindLevels.length - 1)] ?? null;

  return (
    <div className="stack-tuner">
      {/* What to hand over, and for how much. The buy-in is the left-hand button,
          so the way back to the starting stack is always one tap. */}
      <div className="handout-picks">
        {quick.map((v, i) => (
          <button
            key={v}
            className={`handout-pick ${!custom && Math.abs(amount - v) < 0.005 ? 'active' : ''}`}
            onClick={() => pickAmount(v)}
          >
            {i === 0 && <small>{t('table.handoutStart')}</small>}
            {money(v, currency)}
          </button>
        ))}
        <button
          className={`handout-pick ${custom ? 'active' : ''}`}
          onClick={() => setCustom((v) => !v)}
          aria-label={t('table.handoutAmount')}
        >
          ✎ {t('table.handoutCustom')}
        </button>
      </div>
      {custom && (
        <MoneyInput
          className="input handout-amount"
          value={amount}
          ariaLabel={t('table.handoutAmount')}
          onCommit={(v) =>
            dispatch({
              type: 'UPDATE_SESSION',
              patch: { handoutAmount: v > 0 && Math.abs(v - buyIn) >= 0.005 ? v : null },
            })
          }
        />
      )}

      {/* Which blinds these chips are for. Only shown when there is a ladder to
          walk: with one fixed level the question has no other answer. */}
      {maxLevel > floorLevel && (
        <div className="handout-level-row">
          <span className="handout-level-k">{t('stack.forBlinds')}</span>
          <div className="stepper sm">
            <button onClick={() => pickLevel(level - 1)} disabled={level <= floorLevel} aria-label={t('table.prevLevel')}>
              −
            </button>
            <span className="val">
              {t('stack.levelN', { n: level + 1 })}
              {blind && <small> · {blind.smallBlind}/{blind.bigBlind}</small>}
            </span>
            <button onClick={() => pickLevel(level + 1)} disabled={level >= maxLevel} aria-label={t('table.nextLevelBtn')}>
              +
            </button>
          </div>
        </div>
      )}

      {tuned && (
        <button className="btn btn-ghost btn-block btn-sm mt8" onClick={reset}>
          ↺ {t('table.handoutBack')}
        </button>
      )}
    </div>
  );
}
