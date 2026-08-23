import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { ladderForDuration } from '../lib/planning';
import MoneyInput from './MoneyInput';

/**
 * First run: three questions instead of a wall of options.
 *
 * The Plan tab is a complete tournament-director's console, which is the right thing
 * on night five and the wrong thing in minute one — the answer it computes is only
 * as good as a buy-in, a head count and a finish time, so it just asks for those and
 * derives the rest (blind ladder from the chips, level length from the clock).
 *
 * Skipping is always available and leaves the sensible defaults in place.
 */
const HOURS = [2, 3, 4, 5];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { currency, unitValue } = state.settings;

  const [step, setStep] = useState(0);
  const [buyIn, setBuyIn] = useState(state.session.buyIn || 20);
  const [players, setPlayers] = useState(state.session.playerCount || 6);
  const [hours, setHours] = useState(3);

  const plan = useMemo(
    () =>
      ladderForDuration(state.denominations, moneyToUnits(buyIn, unitValue), hours * 60, {
        breakMinutes: state.settings.breakMinutes,
        breakEvery: state.settings.breakEvery,
      }),
    [state.denominations, buyIn, unitValue, hours, state.settings.breakMinutes, state.settings.breakEvery],
  );

  const finish = () => {
    dispatch({
      type: 'UPDATE_SESSION',
      patch: {
        buyIn,
        playerCount: players,
        lateRebuyAmount: buyIn,
        startLevelIdx: 0,
        stackOverride: null,
        ...(plan.levels.length ? { blindLevels: plan.levels } : {}),
      },
    });
    dispatch({
      type: 'UPDATE_SETTINGS',
      patch: {
        minutesPerLevel: plan.minutesPerLevel,
        ...(plan.levels[0]
          ? { defaultSmallBlind: plan.levels[0].smallBlind, defaultBigBlind: plan.levels[0].bigBlind }
          : {}),
        onboardedAt: Date.now(),
      },
    });
    onDone();
  };

  const skip = () => {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { onboardedAt: Date.now() } });
    onDone();
  };

  return (
    <div className="onb">
      <div className="onb-top">
        <span className="onb-step">{t('onboard.step', { n: step + 1 })}</span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={skip}>{t('onboard.skip')}</button>
      </div>

      <div className="onb-body">
        {step === 0 && (
          <>
            <h2 className="onb-h">{t('onboard.welcome')}</h2>
            <p className="onb-p">{t('onboard.welcomeSub')}</p>
            <div className="onb-field">
              <div className="onb-q">{t('onboard.buyIn')}</div>
              <div className="faint onb-sub">{t('onboard.buyInSub')}</div>
              <div className="input-affix onb-money">
                <span className="affix">{currency}</span>
                <MoneyInput value={buyIn} ariaLabel={t('plan.buyIn')} onCommit={(v) => setBuyIn(Math.max(1, v))} />
              </div>
              <div className="onb-quick">
                {[5, 10, 20, 50].map((v) => (
                  <button key={v} className={`quick-chip ${buyIn === v ? 'is-set' : ''}`} onClick={() => setBuyIn(v)}>
                    {money(v, currency)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="onb-field">
            <div className="onb-q">{t('onboard.players')}</div>
            <div className="faint onb-sub">{t('onboard.playersSub')}</div>
            <div className="onb-players">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n} className={`onb-num ${players === n ? 'active' : ''}`} onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onb-field">
            <div className="onb-q">{t('onboard.length')}</div>
            <div className="faint onb-sub">{t('onboard.lengthSub')}</div>
            <div className="onb-hours">
              {HOURS.map((h) => (
                <button key={h} className={`onb-num wide ${hours === h ? 'active' : ''}`} onClick={() => setHours(h)}>
                  {t('onboard.hours', { n: h })}
                </button>
              ))}
            </div>
            {plan.levels.length > 0 && (
              <div className="onb-plan">
                <b>{t('onboard.result', { levels: plan.levels.length, mins: plan.minutesPerLevel })}</b>
                <span>
                  {plan.levels
                    .slice(0, 5)
                    .map((l) => `${l.smallBlind}/${l.bigBlind}`)
                    .join(' · ')}
                  {plan.levels.length > 5 ? ' …' : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="onb-foot">
        {step > 0 && (
          <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>{t('onboard.back')}</button>
        )}
        <div className="spacer" />
        {step < 2 ? (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{t('onboard.next')}</button>
        ) : (
          <button className="btn btn-primary" onClick={finish}>{t('onboard.finish')}</button>
        )}
      </div>
    </div>
  );
}
