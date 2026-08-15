import { useMemo } from 'react';
import { useStore } from '../store';
import { settleUp } from '../lib/settle';
import type { PlayerBalance } from '../lib/settle';
import { useT, useFmt } from '../lib/i18n';
import SeasonLeague from '../components/SeasonLeague';

/**
 * Settle-up tab: what the night added up to and who owes whom. Players themselves
 * (adding, rebuys, stack counts, cashing out) are managed in ONE place — the
 * roster on the Table tab — so this screen is read-only reporting.
 */
export default function CashScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money: fmtMoney } = useFmt();
  const cur = state.settings.currency;
  const ledger = state.ledger;

  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const diff = totalOut - totalIn;
  const anyOut = ledger.some((p) => (p.cashOut || 0) > 0);
  // Mid-game the totals SHOULD differ (money is still on the table) — only flag a
  // mismatch once everyone has been settled.
  const allSettled = ledger.every((p) => p.out || (p.cashOut || 0) > 0);

  const transfers = useMemo(() => {
    const balances: PlayerBalance[] = ledger.map((p) => ({ name: p.name || 'Player', net: (p.cashOut || 0) - (p.buyIn || 0) }));
    return settleUp(balances);
  }, [ledger]);

  if (ledger.length === 0) {
    return (
      <div>
        <div className="section-label">{t('cash.moneyInPlay')}</div>
        <div className="card">
          <div className="empty">{t('cash.emptyHint')}</div>
        </div>
        <SeasonLeague />
      </div>
    );
  }

  return (
    <div>
      <div className="section-label">
        {t('cash.moneyInPlay')}
        <span className="hint">{ledger.length} {t('cash.players').toLowerCase()}</span>
      </div>
      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="k">{t('cash.boughtIn')}</div>
            <div className="v">{fmtMoney(totalIn, cur)}</div>
          </div>
          <div className="stat">
            <div className="k">{t('cash.cashedOut')}</div>
            <div className="v">{fmtMoney(totalOut, cur)}</div>
          </div>
          <div className="stat">
            <div className="k">{t('cash.onTable')}</div>
            <div className="v" style={{ color: 'var(--acc)' }}>{fmtMoney(totalIn - totalOut, cur)}</div>
          </div>
        </div>
      </div>

      <div className="section-label">
        {t('cash.players')}
        <span className="hint">{t('cash.manageOnTable')}</span>
      </div>
      <div className="card ledger-card">
        {ledger.map((p) => {
          const net = (p.cashOut || 0) - (p.buyIn || 0);
          const gone = (p.cashOut || 0) > 0;
          return (
            <div className="cash-row" key={p.id}>
              <span className="cash-name">{p.emoji ? `${p.emoji} ` : ''}{p.name || 'Player'}</span>
              <span className="cash-fig">
                <label>{t('cash.boughtIn')}</label>
                {fmtMoney(p.buyIn || 0, cur)}
              </span>
              <span className="cash-fig">
                <label>{t('cash.cashedOut')}</label>
                {gone ? fmtMoney(p.cashOut, cur) : '—'}
              </span>
              <span className="cash-fig">
                <label>{t('cash.net')}</label>
                <b className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}{fmtMoney(net, cur)}</b>
              </span>
            </div>
          );
        })}
        <div className="row mt12">
          <div className="spacer" />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm(t('cash.newGameConfirm'))) dispatch({ type: 'LEDGER_CLEAR' });
            }}
          >
            {t('cash.newGame')}
          </button>
        </div>
      </div>

      {allSettled && diff !== 0 && (
        <div className="feas warn" style={{ fontSize: 12.5 }}>
          {t('cash.offBy', { out: fmtMoney(totalOut, cur), in: fmtMoney(totalIn, cur), diff: fmtMoney(Math.abs(diff), cur) })}
        </div>
      )}

      <div className="section-label">{t('cash.whoPays')}</div>
      <div className="card">
        {!anyOut ? (
          <div className="empty">{t('cash.needCashOuts')}</div>
        ) : transfers.length === 0 ? (
          <div className="empty">{t('cash.allEven')}</div>
        ) : (
          transfers.map((tr, i) => (
            <div className="transfer-row" key={i}>
              <span className="t-from">{tr.from}</span>
              <span className="t-arrow">{t('cash.pays')}</span>
              <span className="t-to">{tr.to}</span>
              <span className="t-amt">{fmtMoney(tr.amount, cur)}</span>
            </div>
          ))
        )}
      </div>

      <SeasonLeague />
    </div>
  );
}
