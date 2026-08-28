import { memo, useMemo, useState } from 'react';
import { useStore } from '../store';
import { handoutAmountOf, handoutBlindOf, handoutStack } from '../lib/startingStack';
import ChipStackViz from './ChipStackViz';
import MoneyInput from './MoneyInput';
import { useT, useFmt } from '../lib/i18n';

interface Props {
  /** The blind level being played right now — what a mid-game handout is built for. */
  levelIdx?: number;
}

/**
 * The stack card on the Table tab: what to push across the felt.
 *
 * Two jobs in one card, because they are the same question asked twice. Before the
 * game it is the STARTING STACK — what everyone gets for the buy-in, the same
 * distribution the Plan tab and the TV show. Mid-game it is a HANDOUT: somebody
 * rebuys for €40 at 25/50, and the answer is neither "the starting stack" (wrong
 * amount) nor "go back to the Plan tab and change the buy-in" (which would rewrite
 * the whole night's plan for one top-up).
 *
 * So the amount is a switch on the card, and the chips are built for the blinds
 * being played NOW — which is what quietly drops the 5s and 10s once they have
 * stopped meaning anything (see `handoutBlindOf`). The chosen amount lives in the
 * session, so the big screen mirrors exactly this card.
 */
function StartingStack({ levelIdx }: Props) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { denominations, session, settings } = state;
  const { buyIn } = session;
  const { unitValue, currency, tvShowStartStack } = settings;
  const [custom, setCustom] = useState(false);

  const amount = handoutAmountOf(session);
  const isStart = Math.abs(amount - buyIn) < 0.005;

  // Same helper the roster's rebuy and the TV use, so all three show one stack.
  const stack = useMemo(
    () => handoutStack(denominations, session, unitValue, amount, levelIdx),
    [denominations, session, unitValue, amount, levelIdx],
  );
  const blind = handoutBlindOf(session, levelIdx);
  const shownLevelIdx = blind ? session.blindLevels.indexOf(blind) : -1;

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

  const pick = (v: number) => {
    setCustom(false);
    dispatch({
      type: 'UPDATE_SESSION',
      patch: { handoutAmount: Math.abs(v - buyIn) < 0.005 ? null : v },
    });
  };

  if (stack.denomsUsed.length === 0 && isStart) return null;

  return (
    <>
      <div className="section-label">
        {isStart ? t('table.startingStack') : t('table.handoutTitle')}
        <span className="hint">{isStart ? t('table.startingStackHint') : t('table.handoutHint')}</span>
      </div>
      <div className="card">
        <ChipStackViz denoms={stack.denomsUsed} counts={stack.counts} />
        <div className="start-stack-meta">
          <span>
            <b>{num(stack.totalValue)}</b> {t('plan.chips').toLowerCase()}
          </span>
          <span className="faint">· {money(amount, currency)} ·</span>
          <span className="faint">{stack.chipCount} {t('plan.chips').toLowerCase()}</span>
        </div>

        {/* What to hand over, and for how much. The buy-in is the left-hand button,
            so the way back to the starting stack is always one tap. */}
        <div className="handout-picks">
          {quick.map((v, i) => (
            <button
              key={v}
              className={`handout-pick ${!custom && Math.abs(amount - v) < 0.005 ? 'active' : ''}`}
              onClick={() => pick(v)}
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

        {/* Which blinds these chips are for. Only worth saying once it is no longer
            the obvious answer — at the starting level it is just noise. */}
        {blind && shownLevelIdx > (session.startLevelIdx ?? 0) && (
          <div className="handout-level faint">
            {t('table.handoutForLevel', {
              n: shownLevelIdx + 1,
              blinds: `${blind.smallBlind}/${blind.bigBlind}`,
            })}
            {stack.baseValue > 0 && ` · ${t('table.handoutSmallest', { value: num(stack.baseValue) })}`}
          </div>
        )}

        <button
          className={`btn btn-block btn-sm mt12 ${tvShowStartStack ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowStartStack: !tvShowStartStack } })}
        >
          {tvShowStartStack ? t('table.hideFromTv') : t('table.castToTv')}
        </button>
        {!isStart && (
          <button className="btn btn-ghost btn-block btn-sm mt8" onClick={() => pick(buyIn)}>
            ↺ {t('table.handoutBack')}
          </button>
        )}
      </div>
    </>
  );
}

/* Wrapped in `memo` because its only prop is the blind level: the Table tab repaints
   once a second while the clock runs, and without this every tick rebuilt this whole
   subtree for a countdown that lives somewhere else entirely. The level changes once
   every twenty minutes, so it costs nothing. Store changes still reach it — it reads
   the store itself, and context goes straight past `memo`. */
export default memo(StartingStack);
