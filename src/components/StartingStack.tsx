import { useMemo } from 'react';
import { useStore } from '../store';
import { startingStackOf } from '../lib/startingStack';
import ChipStackViz from './ChipStackViz';
import { useT, useFmt } from '../lib/i18n';

/**
 * The starting stack every player gets for the buy-in — shown on the Table tab so
 * everyone can see how big a stack they're dealt as the phone passes around. Same
 * distribution engine as the Plan tab, computed for the current buy-in + first blind.
 */
export default function StartingStack() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { denominations, session, settings } = state;
  const { buyIn } = session;
  const { unitValue, currency, tvShowStartStack } = settings;

  // Same helper the Plan tab and the TV use, so all three show one stack.
  const stack = useMemo(
    () => startingStackOf(denominations, session, unitValue),
    [denominations, session, unitValue],
  );

  if (stack.denomsUsed.length === 0) return null;

  return (
    <>
      <div className="section-label">
        {t('table.startingStack')}
        <span className="hint">{t('table.startingStackHint')}</span>
      </div>
      <div className="card">
        <ChipStackViz denoms={stack.denomsUsed} counts={stack.counts} />
        <div className="start-stack-meta">
          <span>
            <b>{num(stack.totalValue)}</b> {t('plan.chips').toLowerCase()}
          </span>
          <span className="faint">· {money(buyIn, currency)} ·</span>
          <span className="faint">{stack.chipCount} {t('plan.chips').toLowerCase()}</span>
        </div>
        <button
          className={`btn btn-block btn-sm mt12 ${tvShowStartStack ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowStartStack: !tvShowStartStack } })}
        >
          {tvShowStartStack ? t('table.hideFromTv') : t('table.castToTv')}
        </button>
      </div>
    </>
  );
}
