import { useMemo } from 'react';
import { useStore } from '../store';
import { settleUp } from '../lib/settle';
import type { PlayerBalance } from '../lib/settle';
import { fmtMoney } from '../lib/money';
import { IconPlus, IconTrash } from '../components/Icons';

export default function CashScreen() {
  const { state, dispatch } = useStore();
  const cur = state.settings.currency;
  const { buyIn, playerCount } = state.session;
  const ledger = state.ledger;

  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);
  const diff = totalOut - totalIn;
  const anyOut = ledger.some((p) => (p.cashOut || 0) > 0);

  const transfers = useMemo(() => {
    const balances: PlayerBalance[] = ledger.map((p) => ({ name: p.name || 'Player', net: (p.cashOut || 0) - (p.buyIn || 0) }));
    return settleUp(balances);
  }, [ledger]);

  if (ledger.length === 0) {
    return (
      <div>
        <div className="section-label">Cash ledger</div>
        <div className="card">
          <div className="empty" style={{ paddingBottom: 16 }}>
            Track each player's buy-ins during the game, then enter their final chips to settle up.
          </div>
          <button className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: playerCount })}>
            Start with {playerCount} players
          </button>
          <button className="btn btn-ghost btn-block btn-sm mt8" onClick={() => dispatch({ type: 'LEDGER_ADD' })}>
            <IconPlus size={16} /> Add one player
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-label">
        Money in play
        <span className="hint">{ledger.length} players</span>
      </div>
      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="k">Bought in</div>
            <div className="v">{fmtMoney(totalIn, cur)}</div>
          </div>
          <div className="stat">
            <div className="k">Cashed out</div>
            <div className="v">{fmtMoney(totalOut, cur)}</div>
          </div>
          <div className="stat">
            <div className="k">On table</div>
            <div className="v" style={{ color: 'var(--gold-soft)' }}>{fmtMoney(totalIn - totalOut, cur)}</div>
          </div>
        </div>
      </div>

      <div className="section-label">
        Players
        <span className="hint">tap + each rebuy · enter final chips</span>
      </div>
      <div className="card ledger-card">
        {ledger.map((p) => {
          const net = (p.cashOut || 0) - (p.buyIn || 0);
          return (
            <div className="ledger-row" key={p.id}>
              <input
                className="ledger-name"
                value={p.name}
                placeholder="Name"
                onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
              />
              <button className="icon-btn danger" style={{ width: 30, height: 30 }} onClick={() => dispatch({ type: 'LEDGER_REMOVE', id: p.id })}>
                <IconTrash size={14} />
              </button>

              <div className="ledger-fields">
                <div className="ledger-field">
                  <label>Bought in</label>
                  <div className="buyin-ctl">
                    <input
                      className="ledger-num"
                      type="number"
                      inputMode="decimal"
                      value={p.buyIn || ''}
                      onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: Math.max(0, +e.target.value) } })}
                    />
                    <button
                      className="buyin-add"
                      onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: (p.buyIn || 0) + buyIn } })}
                      title={`Add a ${fmtMoney(buyIn, cur)} buy-in`}
                    >
                      +{cur}{buyIn}
                    </button>
                  </div>
                </div>
                <div className="ledger-field">
                  <label>Final chips</label>
                  <input
                    className="ledger-num"
                    type="number"
                    inputMode="decimal"
                    value={p.cashOut || ''}
                    onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { cashOut: Math.max(0, +e.target.value) } })}
                  />
                </div>
                <div className="ledger-net">
                  <label>Net</label>
                  <span className={net >= 0 ? 'pos' : 'neg'}>
                    {net >= 0 ? '+' : ''}
                    {fmtMoney(net, cur)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="row mt12" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => dispatch({ type: 'LEDGER_ADD' })}>
            <IconPlus size={16} /> Add player
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm('Clear the ledger for a new game?')) dispatch({ type: 'LEDGER_CLEAR' });
            }}
          >
            New game
          </button>
        </div>
      </div>

      {anyOut && diff !== 0 && (
        <div className="feas warn" style={{ fontSize: 12.5 }}>
          Final chips total {fmtMoney(totalOut, cur)} but {fmtMoney(totalIn, cur)} was bought in — off by {fmtMoney(Math.abs(diff), cur)}. Re-count the stacks.
        </div>
      )}

      <div className="section-label">Who pays whom</div>
      <div className="card">
        {!anyOut ? (
          <div className="empty">Enter final chips to see the payouts.</div>
        ) : transfers.length === 0 ? (
          <div className="empty">Everyone's even — no payments needed.</div>
        ) : (
          transfers.map((t, i) => (
            <div className="transfer-row" key={i}>
              <span className="t-from">{t.from}</span>
              <span className="t-arrow">pays</span>
              <span className="t-to">{t.to}</span>
              <span className="t-amt">{fmtMoney(t.amount, cur)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
