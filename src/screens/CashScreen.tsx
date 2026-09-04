import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { settleLedger } from '../lib/settle';
import { renderSettlementImage } from '../lib/share';
import { useT, useFmt } from '../lib/i18n';
import SeasonLeague from '../components/SeasonLeague';
import PayoutCard from '../components/PayoutCard';
import CarryCard from '../components/CarryCard';
import Timeline from '../components/Timeline';
import NightAwards from '../components/NightAwards';
import Panes from '../components/Panes';
import { useConfirm } from '../components/Confirm';

/**
 * Settle-up tab: what the night added up to and who owes whom. Players themselves
 * (adding, rebuys, stack counts, cashing out) are managed in ONE place — the
 * roster on the Table tab — so this screen is read-only reporting.
 *
 * It answers "who pays whom" at ANY point in the night, not just after the last
 * cash-out: a stack that hasn't been cashed in yet counts as what that player would
 * take off the table right now. Before that, this screen counted only
 * `cashOut − buyIn`, so mid-game every still-playing player read as a total loser
 * while the roster showed them up — and once a single player cashed out it printed
 * a confident payment list built from balances that didn't add up to zero.
 */
export default function CashScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money: fmtMoney } = useFmt();
  const cur = state.settings.currency;
  const ledger = state.ledger;
  const unit = state.settings.unitValue || 0.01;
  const confirm = useConfirm();
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const totalIn = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const totalOut = ledger.reduce((s, p) => s + (p.cashOut || 0), 0);

  /* Balances left over from earlier nights are folded straight into tonight's
     figures, so one list of payments settles everything instead of everybody
     keeping their own private running total. */
  const carryMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of state.carry) m[c.name.trim().toLowerCase()] = (m[c.name.trim().toLowerCase()] ?? 0) + c.amount;
    return m;
  }, [state.carry]);

  const settlement = useMemo(() => settleLedger(ledger, unit, carryMap), [ledger, unit, carryMap]);
  const { transfers, nets, provisional, drift, imbalance } = settlement;
  const anyMoney = totalIn > 0 || totalOut > 0;
  const isCash = state.settings.gameMode === 'cash';
  const pool = isCash ? Math.max(0, totalIn - totalOut) : totalIn;

  /** Payment details the user saved on a player's profile — shown when settling. */
  const paymentFor = (name: string) =>
    state.people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())?.payment?.trim() || null;

  const shareSettlement = async () => {
    const date = new Date().toLocaleDateString(state.settings.language === 'de' ? 'de-DE' : 'en-GB');
    const title = t('settle.shareTitle', { date });
    const lines = [
      title,
      '',
      ...nets.map((n) => `${n.emoji ? `${n.emoji} ` : ''}${n.name}: ${n.net >= 0 ? '+' : ''}${fmtMoney(n.net, cur)}`),
      '',
      ...transfers.map((tr) => t('settle.owes', { from: tr.from, to: tr.to, amount: fmtMoney(tr.amount, cur) })),
    ];
    const text = lines.join('\n');
    try {
      const dataUrl = renderSettlementImage({
        title,
        subtitle: `${t('cash.boughtIn')} ${fmtMoney(totalIn, cur)}`,
        nets: nets.map((n) => ({ name: n.name, emoji: n.emoji, net: n.net })),
        transfers,
        format: (n) => fmtMoney(Math.abs(n), cur),
        paysLabel: t('cash.pays'),
        netLabel: t('cash.perPlayer'),
        payLabel: t('cash.whoPays'),
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'chipstack-settlement.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch {
      /* sharing refused or unsupported — fall through to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg(t('settle.copied'));
      setTimeout(() => setShareMsg(null), 1800);
    } catch {
      setShareMsg(null);
    }
  };

  /**
   * Nobody has cash on them: fold tonight's result into the open balances and clear
   * the table. Clearing is part of it — leaving the ledger up would show the same
   * money twice, once as tonight's net and once as carried over.
   */
  const carryOver = () =>
    confirm.ask({
      text: t('debts.carryConfirm'),
      confirmLabel: t('debts.carry'),
      onYes: () => {
        dispatch({
          type: 'CARRY_ADD',
          entries: ledger.map((p, i) => ({
            name: p.name || 'Player',
            personId: p.personId,
            // `net` already includes any earlier balance, so take it back out —
            // otherwise last week's debt would be counted a second time
            amount: nets[i].net - nets[i].carried,
          })),
        });
        dispatch({ type: 'LEDGER_CLEAR' });
        setShareMsg(t('debts.carried'));
        setTimeout(() => setShareMsg(null), 2600);
      },
    });

  if (ledger.length === 0) {
    return (
      <div>
        <div className="section-label">{t('cash.moneyInPlay')}</div>
        <div className="card">
          <div className="empty">{t('cash.emptyHint')}</div>
        </div>
        <CarryCard />
        <SeasonLeague />
      </div>
    );
  }

  return (
    <div>
      {/* Money in and who has it on the left; the settle-up and the night's
          record on the right. Contiguous, so a phone sees the same order. */}
      <Panes
        left={
          <>
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
            {t('cash.perPlayer')}
            <span className="hint">{t('cash.manageOnTable')}</span>
          </div>
          <div className="card ledger-card">
            {ledger.map((p, i) => {
              const n = nets[i];
              return (
                <div className="cash-row" key={p.id}>
                  <span className="cash-name">{p.emoji ? `${p.emoji} ` : ''}{p.name || 'Player'}</span>
                  <span className="cash-fig">
                    <label>{t('cash.boughtIn')}</label>
                    {fmtMoney(p.buyIn || 0, cur)}
                  </span>
                  <span className="cash-fig">
                    <label>{n.settled ? t('cash.cashedOut') : t('cash.stillIn')}</label>
                    {n.settled ? fmtMoney(p.cashOut || 0, cur) : fmtMoney(n.onTable, cur)}
                  </span>
                  <span className="cash-fig">
                    <label>{t('cash.net')}</label>
                    <b className={n.net >= 0 ? 'pos' : 'neg'}>{n.net >= 0 ? '+' : ''}{fmtMoney(n.net, cur)}</b>
                  </span>
                  {n.carried !== 0 && (
                    <span className="cash-carried">
                      {t('debts.hint')}: {n.carried >= 0 ? '+' : ''}{fmtMoney(n.carried, cur)}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="row mt12">
              <div className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  confirm.ask({
                    text: t('cash.newGameConfirm'),
                    confirmLabel: t('cash.newGame'),
                    danger: true,
                    onYes: () => dispatch({ type: 'LEDGER_CLEAR' }),
                  });
                }}
              >
                {t('cash.newGame')}
              </button>
            </div>
          </div>

          {!provisional && drift !== 0 && (
            <div className="feas warn" style={{ fontSize: 12.5 }}>
              {t('cash.offBy', { out: fmtMoney(totalOut, cur), in: fmtMoney(totalIn, cur), diff: fmtMoney(Math.abs(drift), cur) })}
            </div>
          )}

          {!isCash && pool > 0 && <PayoutCard pool={pool} entrants={ledger.length} />}

          </>
        }
        right={
          <>
          <div className="section-label">
            {t('cash.whoPays')}
            <span className="hint">{provisional ? t('cash.provisional') : t('cash.final')}</span>
          </div>
          <div className="card">
            {!anyMoney ? (
              <div className="empty">{t('cash.nothingYet')}</div>
            ) : transfers.length === 0 ? (
              <div className="empty">{t('cash.allEven')}</div>
            ) : (
              transfers.map((tr, i) => {
                const pay = paymentFor(tr.to);
                return (
                  <div className="transfer-row" key={i}>
                    <span className="t-from">{tr.from}</span>
                    <span className="t-arrow">{t('cash.pays')}</span>
                    <span className="t-to">{tr.to}</span>
                    <span className="t-amt">{fmtMoney(tr.amount, cur)}</span>
                    {pay && (
                      <button
                        className="t-pay"
                        onClick={() => {
                          const text = `${t('settle.owes', { from: tr.from, to: tr.to, amount: fmtMoney(tr.amount, cur) })} — ${pay}`;
                          void navigator.clipboard?.writeText(text).then(
                            () => {
                              setShareMsg(t('settle.copied'));
                              setTimeout(() => setShareMsg(null), 1600);
                            },
                            () => undefined,
                          );
                        }}
                      >
                        {t('settle.payLink')}
                      </button>
                    )}
                  </div>
                );
              })
            )}

            {/* The nets no longer add up: a carried balance was paid off outside the app.
                Say so rather than printing a payment list that cannot settle everyone. */}
            {imbalance !== 0 && anyMoney && (
              <p className="tt-note" style={{ color: 'var(--bad)' }}>
                {t('cash.offBy', { out: fmtMoney(totalOut, cur), in: fmtMoney(totalIn, cur), diff: fmtMoney(Math.abs(imbalance), cur) })}
              </p>
            )}

            {provisional && anyMoney && (
              <>
                <p className="faint settle-note">{t('cash.provisionalHint')}</p>
                <button
                  className="btn btn-ghost btn-block btn-sm"
                  onClick={() =>
                    confirm.ask({
                      text: t('cash.settleNowConfirm'),
                      confirmLabel: t('cash.settleNow'),
                      onYes: () => dispatch({ type: 'LEDGER_SETTLE_ALL' }),
                    })
                  }
                >
                  {t('cash.settleNow')}
                </button>
                <p className="faint settle-note center">{t('cash.settleNowHint')}</p>
              </>
            )}

            {anyMoney && (
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => void shareSettlement()}>
                  ↗ {t('settle.share')}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={carryOver} title={t('debts.carryHint')}>
                  {t('debts.carry')}
                </button>
              </div>
            )}
            {shareMsg && <p className="faint settle-note center">{shareMsg}</p>}
          </div>

          <NightAwards />
          <Timeline />
          <CarryCard />
          <SeasonLeague />
          </>
        }
      />
      {confirm.node}
    </div>
  );
}
