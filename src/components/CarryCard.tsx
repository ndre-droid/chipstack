import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { useConfirm } from './Confirm';

/**
 * What is still owed from earlier nights.
 *
 * Home games rarely settle to the cent on the night — somebody has no cash on them,
 * somebody leaves early. Carrying the result forward means next week's "who pays
 * whom" nets the whole thing out instead of six people keeping private tallies.
 */
export default function CarryCard() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const confirm = useConfirm();
  const cur = state.settings.currency;

  if (state.carry.length === 0) return null;

  return (
    <>
      <div className="section-label">
        {t('debts.title')}
        <span className="hint">{t('debts.hint')}</span>
      </div>
      <div className="card">
        {state.carry.map((c) => (
          <div className="carry-row" key={c.id}>
            <span className="carry-name">{c.name}</span>
            <span className={`carry-amt ${c.amount >= 0 ? 'pos' : 'neg'}`}>
              {c.amount >= 0 ? '+' : ''}{money(c.amount, cur)}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'CARRY_SETTLE', id: c.id })}>
              {t('debts.settleOne')}
            </button>
          </div>
        ))}
        <button
          className="btn btn-ghost btn-block btn-sm mt12"
          onClick={() =>
            confirm.ask({
              text: t('debts.settleAll'),
              confirmLabel: t('debts.settleOne'),
              onYes: () => dispatch({ type: 'CARRY_CLEAR' }),
            })
          }
        >
          {t('debts.settleAll')}
        </button>
      </div>
      {confirm.node}
    </>
  );
}
