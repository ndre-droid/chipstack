import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { ladderForDuration } from '../lib/planning';
import { CHIP_SET_PRESETS, denomsFromPreset } from '../lib/chipSetPresets';
import { SKIN_STYLES, accentColor } from '../lib/skins';
import { suggestUnitValue } from '../lib/unitValue';
import MoneyInput from './MoneyInput';
import type { Denomination, Skin } from '../types';

/**
 * First run: a handful of questions instead of a wall of options.
 *
 * The Plan tab is a complete tournament-director's console, which is the right thing
 * on night five and the wrong thing in minute one — the answer it computes is only
 * as good as a buy-in, a head count and a finish time, so it just asks for those and
 * derives the rest (blind ladder from the chips, level length from the clock).
 *
 * WHICH CHIPS comes second, before anything is computed, and it is not cosmetic: the
 * whole app is a calculation against the box the user actually owns, and until this
 * step existed a first-time user with a Dice 300 case was quietly being planned a
 * tournament out of somebody else's ceramic set — right down to denominations they
 * do not have. It is asked early because the blind ladder on the next screen is
 * derived FROM the chips.
 *
 * The look comes last, and it is there for a reason that is not decoration: the five
 * skins are the most immediately impressive thing in the app and they were three
 * levels deep in Settings, where a first-time user would meet them on about night
 * four. It is also the one question with no wrong answer, which is a good note to
 * finish on.
 *
 * Skipping is always available and leaves the sensible defaults in place. Nothing is
 * written to the store until the last step: a wizard that had already swapped your
 * chip set by the time you pressed "skip" would be lying about what skipping means.
 */
const HOURS = [2, 3, 4, 5];
const STEPS = 5;

const newId = () => Math.random().toString(36).slice(2, 9);

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { currency, unitValue } = state.settings;

  const [step, setStep] = useState(0);
  const [buyIn, setBuyIn] = useState(state.session.buyIn || 20);
  const [players, setPlayers] = useState(state.session.playerCount || 6);
  const [hours, setHours] = useState(3);
  /* Which box. Starts on the set the app's default inventory already IS, so the
     tick is telling the truth about what happens if this screen is skipped — and
     "something else" is then a real alternative rather than the default dressed up
     as one. */
  const [setId, setSetId] = useState<string | null>('nash');
  const [skin, setSkin] = useState<Skin>(state.settings.skin ?? 'minimal');

  /* Built once per choice and reused for BOTH the ladder preview and the dispatch at
     the end, ids and all — so the levels the user was shown are the levels they get,
     computed against the very same chips. */
  const chosen = useMemo<Denomination[] | null>(() => {
    const preset = CHIP_SET_PRESETS.find((p) => p.id === setId);
    return preset ? denomsFromPreset(preset, newId) : null;
  }, [setId]);
  const denoms = chosen ?? state.denominations;

  /* What one point is worth, for THIS box. The app's default of a point per cent is
     right for a 500-piece ceramic set that runs to 5000 and wrong for a 300-piece
     dice case that stops at 100 — where a €20 buy-in is 2000 points nobody can be
     handed, and the first screen after the wizard is a red line about it. A unit
     that already works is never touched; see lib/unitValue.ts. Computed here rather
     than at the end because the blind ladder below is measured in these points. */
  const unit = useMemo(
    () =>
      suggestUnitValue(
        denoms,
        { ...state.session, buyIn },
        players + Math.max(0, state.session.earlyRebuys),
        null,
        unitValue,
      ),
    [denoms, buyIn, players, state.session, unitValue],
  );

  const plan = useMemo(
    () =>
      ladderForDuration(denoms, moneyToUnits(buyIn, unit), hours * 60, {
        breakMinutes: state.settings.breakMinutes,
        breakEvery: state.settings.breakEvery,
      }),
    [denoms, buyIn, unit, hours, state.settings.breakMinutes, state.settings.breakEvery],
  );

  /* Applying a skin only writes a setting; the theming itself is CSS hanging off
     <html>, so this is instant and free and there is nothing to undo. Previewing it
     live is the whole point of asking. */
  const pickSkin = (id: Skin) => {
    setSkin(id);
    dispatch({ type: 'UPDATE_SETTINGS', patch: { skin: id } });
  };

  const finish = () => {
    /* The chosen box becomes this device's chip set, and the untouched default it
       replaces goes with it — one box, named after the one on the table, instead of
       two sets to pick between on night one. Order matters: CHIPSET_ADD switches to
       the new set, which is what makes removing the old one legal. */
    if (chosen) {
      const previous = state.activeChipSetId;
      const preset = CHIP_SET_PRESETS.find((p) => p.id === setId);
      dispatch({ type: 'CHIPSET_ADD', name: preset?.name ?? t('chips.newSet'), denominations: chosen });
      if (previous) dispatch({ type: 'CHIPSET_REMOVE', id: previous });
    }
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
        unitValue: unit,
        skin,
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
        <span className="onb-step">{t('onboard.stepOf', { n: step + 1, of: STEPS })}</span>
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
            <div className="onb-q">{t('onboard.chips')}</div>
            <div className="faint onb-sub">{t('onboard.chipsSub')}</div>
            <div className="onb-sets">
              {CHIP_SET_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`preset-set-row ${setId === p.id ? 'active' : ''}`}
                  onClick={() => setSetId(p.id)}
                >
                  <span className="preset-set-swatches">
                    {p.chips.slice(0, 6).map((c, i) => (
                      <i key={i} style={{ background: c.color, borderColor: c.accent }} />
                    ))}
                  </span>
                  <span className="preset-set-text">
                    <b>{p.name}</b>
                    <span>{p.note}</span>
                  </span>
                </button>
              ))}
              <button
                className={`preset-set-row ${setId === null ? 'active' : ''}`}
                onClick={() => setSetId(null)}
              >
                <span className="preset-set-swatches">
                  <i style={{ background: 'transparent', borderColor: 'var(--line)' }} />
                </span>
                <span className="preset-set-text">
                  <b>{t('onboard.chipsOwn')}</b>
                  <span>{t('onboard.chipsOwnSub')}</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
          <div className="onb-field">
            <div className="onb-q">{t('onboard.look')}</div>
            <div className="faint onb-sub">{t('onboard.lookSub')}</div>
            <div className="style-grid onb-styles">
              {SKIN_STYLES.map((s) => (
                <button
                  key={s.id}
                  className={`style-opt ${skin === s.id ? 'active' : ''}`}
                  onClick={() => pickSkin(s.id)}
                >
                  <span className="style-swatch" style={{ background: s.bg }}>
                    <span className="sw-dot" style={{ background: accentColor(state.settings.accents?.[s.id]) }} />
                  </span>
                  <span className="style-name">{s.name}</span>
                </button>
              ))}
            </div>
            <p className="faint onb-sub">{t('onboard.lookLater')}</p>
          </div>
        )}
      </div>

      <div className="onb-foot">
        {step > 0 && (
          <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>{t('onboard.back')}</button>
        )}
        <div className="spacer" />
        {step < STEPS - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{t('onboard.next')}</button>
        ) : (
          <button className="btn btn-primary" onClick={finish}>{t('onboard.finish')}</button>
        )}
      </div>
    </div>
  );
}
