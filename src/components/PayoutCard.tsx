import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { bubblePlace, defaultSplit, payoutsFor, resizeSplit } from '../lib/payouts';

/**
 * The prize-pool split, on the phone.
 *
 * It only ever existed on the big screen, which is the one place nobody is standing
 * when it is time to hand out cash. How many places pay is adjustable here, and the
 * change rides to the TV like every other display choice.
 */
export default function PayoutCard({ pool, entrants }: { pool: number; entrants: number }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const cur = state.settings.currency;

  const custom = state.settings.payoutSplit;
  const split = custom?.length ? custom : defaultSplit(Math.max(1, entrants));
  const payouts = payoutsFor(pool, entrants, custom);
  const bubble = bubblePlace(entrants, payouts.length);

  const setPlaces = (n: number) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { payoutSplit: resizeSplit(split, n) } });

  return (
    <>
      <div className="section-label">
        {t('payout.title')}
        <span className="hint">{custom?.length ? t('payout.custom') : t('payout.hint')}</span>
      </div>
      <div className="card">
        <div className="row">
          <div>
            <div style={{ fontWeight: 600 }}>{t('payout.places')}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{t('payout.pool', { amount: money(pool, cur) })}</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => setPlaces(payouts.length - 1)} disabled={payouts.length <= 1}>−</button>
            <span className="val">{payouts.length}</span>
            <button onClick={() => setPlaces(payouts.length + 1)} disabled={payouts.length >= Math.max(1, entrants)}>+</button>
          </div>
        </div>

        <div className="payout-list">
          {payouts.map((p) => (
            <div className="payout-row" key={p.place}>
              <span className="payout-place">{t('payout.place', { n: p.place })}</span>
              <span className="payout-pct">{Math.round(p.pct * 100)}%</span>
              <span className="payout-amt">{money(p.amount, cur)}</span>
            </div>
          ))}
        </div>

        <p className="faint payout-note">
          {bubble ? t('payout.bubble', { n: bubble }) : t('payout.everyonePaid')}
        </p>
        {custom?.length ? (
          <button
            className="btn btn-ghost btn-block btn-sm"
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { payoutSplit: null } })}
          >
            {t('payout.reset')}
          </button>
        ) : null}
      </div>
    </>
  );
}
