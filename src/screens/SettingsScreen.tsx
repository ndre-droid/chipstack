import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import Chip from '../components/Chip';
import { chip3dSupported, clearChipCache } from '../lib/chip3d';
import { useT, useFmt } from '../lib/i18n';
import type { Appearance, AccentId, ChipArt } from '../types';
import { useConfirm } from '../components/Confirm';
import MoneyInput from '../components/MoneyInput';
import { buildBackup, downloadBackup, parseBackup, restorePhotos } from '../lib/backup';
import { haptic, hapticBackend } from '../lib/platform';
import { ACCENT_SWATCHES, SKIN_STYLES, accentColor } from '../lib/skins';
import Onboarding from '../components/Onboarding';
import ChipRuler from '../components/ChipRuler';
import Panes from '../components/Panes';
import { forgetCalibration, readScreenShape, rulerSlots, type RulerSlot } from '../lib/chipRuler';

const CURRENCIES = ['€', '$', '£', 'zł', 'Fr'];
const UNIT_PRESETS = [
  { label: '1 point = 1¢', value: 0.01 },
  { label: '1 point = 10¢', value: 0.1 },
  { label: '1 point = €1', value: 1 },
];

const STYLES = SKIN_STYLES;

const APPEARANCES: { id: Appearance; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

const ACCENTS = ACCENT_SWATCHES;

const CHIP_ARTS: { id: ChipArt; name: string }[] = [
  { id: 'deco', name: 'Art Deco' },
  { id: 'diamond', name: 'Diamonds' },
  { id: 'classic', name: 'Classic' },
  { id: 'sunburst', name: 'Sunburst' },
];

export default function SettingsScreen() {
  const { state, dispatch } = useStore();
  const { settings } = state;
  const t = useT();
  const { money: fmtMoney } = useFmt();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  // WebGL is checked once: without it the 3D chips can never draw, so the option
  // is disabled rather than silently falling back forever.
  const [webgl] = useState(chip3dSupported);
  /** which path the last test buzz took — null until the button is pressed */
  const [buzzPath, setBuzzPath] = useState<'native' | 'web' | 'none' | null>(null);

  const activeStyle = STYLES.find((s) => s.id === settings.skin) ?? STYLES[0];
  const currentAccent = settings.accents?.[settings.skin] ?? 'amber';
  // picking a preset clears any custom accent so the preset takes over
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...settings.accents, [settings.skin]: id }, customAccent: null } });

  return (
    <div>
      {/* Two columns of settings once there is room for them — the split is
          contiguous, so on a phone this is the same list in the same order.
          See components/Panes.tsx. */}
      <Panes
        left={
          <>
                  <BeforeTheNight />

                  <div className="section-label">{t('settings.language')}</div>
                  <div className="card">
                    <div className="segmented">
                      <button
                        className={settings.language === 'en' ? 'active' : ''}
                        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { language: 'en' } })}
                      >
                        English
                      </button>
                      <button
                        className={settings.language === 'de' ? 'active' : ''}
                        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { language: 'de' } })}
                      >
                        Deutsch
                      </button>
                    </div>
                  </div>

                  <div className="section-label">{t('settings.style')}</div>
                  <div className="card">
                    <div className="style-grid">
                      {STYLES.map((s) => (
                        <button
                          key={s.id}
                          className={`style-opt ${settings.skin === s.id ? 'active' : ''}`}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { skin: s.id } })}
                        >
                          <span className="style-swatch" style={{ background: s.bg }}>
                            <span className="sw-dot" style={{ background: accentColor(settings.accents?.[s.id] ?? 'amber') }} />
                          </span>
                          <span className="style-name">{s.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="faint" style={{ fontSize: 12.5, margin: '12px 2px 0' }}>{activeStyle.note}</p>
                  </div>

                  {settings.skin === 'minimal' && (
                    <>
                      <div className="section-label">{t('settings.appearance')}</div>
                      <div className="card">
                        <div className="segmented">
                          {APPEARANCES.map((a) => (
                            <button
                              key={a.id}
                              className={settings.appearance === a.id ? 'active' : ''}
                              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { appearance: a.id } })}
                            >
                              {a.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="section-label">
                    {t('settings.accent')}
                    <span className="hint">{activeStyle.name}</span>
                  </div>
                  <div className="card">
                    <div className="accent-grid">
                      {ACCENTS.map((a) => (
                        <button
                          key={a.id}
                          className={`accent-opt ${!settings.customAccent && currentAccent === a.id ? 'active' : ''}`}
                          onClick={() => setAccent(a.id)}
                        >
                          <span className="dot" style={{ background: a.color }} />
                          {a.name}
                        </button>
                      ))}
                    </div>
                    <div className="divider" />
                    <div className="row">
                      <label className={`accent-opt custom-accent ${settings.customAccent ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
                        <span className="dot" style={{ background: settings.customAccent || 'conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)' }} />
                        {t('settings.customAccent')}
                        <input
                          type="color"
                          value={settings.customAccent || '#f0b429'}
                          onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { customAccent: e.target.value } })}
                          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                        />
                      </label>
                      <div className="spacer" />
                      {settings.customAccent && (
                        <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { customAccent: null } })}>
                          {t('settings.usePreset')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="section-label">{t('settings.showOnTv')}</div>
                  <div className="card">
                    <p style={{ fontSize: 12.5, margin: 0, fontWeight: 600 }}>{t('settings.liveMovedToTable')}</p>
                  </div>

                  <div className="section-label">{t('settings.chipStyle')}</div>
                  <div className="card">
                    <div className="chip-toggle-row">
                      <button
                        className={`chip-toggle ${settings.chipStyle === 'render3d' ? '' : 'off'}`}
                        onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { chipStyle: 'render3d' } })}
                        disabled={!webgl}
                      >
                        {t('settings.chipStyleRender')}
                      </button>
                      <button
                        className={`chip-toggle ${settings.chipStyle === 'vector' ? '' : 'off'}`}
                        onClick={() => {
                          clearChipCache();
                          dispatch({ type: 'UPDATE_SETTINGS', patch: { chipStyle: 'vector' } });
                        }}
                      >
                        {t('settings.chipStyleVector')}
                      </button>
                    </div>
                    <p className="muted mt12" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                      {webgl ? t('settings.chipStyleNote') : t('settings.chipStyleNoWebgl')}
                    </p>
                  </div>

                  <div className="section-label">{t('settings.chipAnim')}</div>
                  <div className="card">
                    <div className="chip-toggle-row">
                      {(['off', 'plan', 'all'] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`chip-toggle ${settings.chipAnim === mode ? '' : 'off'}`}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { chipAnim: mode } })}
                        >
                          {t(`settings.chipAnim.${mode}` as 'settings.chipAnim.off')}
                        </button>
                      ))}
                    </div>
                    <p className="muted mt12" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                      {t('settings.chipAnimNote')}
                    </p>
                  </div>

                  {/* Vibration, with a way to prove it. It went unnoticed-dead in the APK for
                      months because a failed buzz looks exactly like a buzz nobody asked for —
                      so the test button says which path it took, not just "done". */}
          </>
        }
        right={
          <>
                  <div className="section-label">{t('settings.haptics')}</div>
                  <div className="card">
                    <div className="chip-toggle-row">
                      {([true, false] as const).map((on) => (
                        <button
                          key={String(on)}
                          className={`chip-toggle ${(settings.countHaptics ?? true) === on ? '' : 'off'}`}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { countHaptics: on } })}
                        >
                          {t(on ? 'settings.hapticsOn' : 'settings.hapticsOff')}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn-ghost mt12"
                      style={{ width: '100%' }}
                      onClick={() => { haptic([18, 90, 18, 90, 45]); setBuzzPath(hapticBackend()); }}
                    >
                      {t('settings.hapticsTest')}
                    </button>
                    <p className="muted mt12" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                      {buzzPath
                        ? t(`settings.haptics.${buzzPath}` as 'settings.haptics.native')
                        : t('settings.hapticsNote')}
                    </p>
                  </div>

                  <div className="section-label">{t('settings.chipArt')}</div>
                  <div className="card">
                    <div className="chip-art-grid">
                      {CHIP_ARTS.map((c) => (
                        <button
                          key={c.id}
                          className={`chip-art-opt ${settings.chipArt === c.id ? 'active' : ''}`}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { chipArt: c.id } })}
                        >
                          <Chip value={100} color="#191922" accent="#cba85a" size={52} art={c.id} />
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-label">{t('settings.moneyMapping')}</div>
                  <div className="card">
                    <div className="field">
                      <label>{t('settings.oneChipWorth')}</label>
                      <div className="input-affix">
                        <span className="affix">{settings.currency}</span>
                        <MoneyInput
                          value={settings.unitValue}
                          ariaLabel={t('settings.oneChipWorth')}
                          onCommit={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { unitValue: Math.max(0, v) } })}
                        />
                      </div>
                    </div>
                    <div className="chip-toggle-row mt12">
                      {UNIT_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          className={`chip-toggle ${settings.unitValue === p.value ? '' : 'off'}`}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { unitValue: p.value } })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="faint" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
                      A <b>25</b> chip is worth {fmtMoney(25 * settings.unitValue, settings.currency)} · a{' '}
                      <b>1000</b> chip is worth {fmtMoney(1000 * settings.unitValue, settings.currency)}.
                    </p>
                  </div>

                  <div className="section-label">{t('settings.defaultBlinds')}</div>
                  <div className="card">
                    <div className="row">
                      <div className="field">
                        <label>{t('settings.smallBlind')}</label>
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          value={settings.defaultSmallBlind || ''}
                          onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { defaultSmallBlind: Math.max(0, +e.target.value) } })}
                        />
                      </div>
                      <div className="field">
                        <label>{t('settings.bigBlind')}</label>
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          value={settings.defaultBigBlind || ''}
                          onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { defaultBigBlind: Math.max(0, +e.target.value) } })}
                        />
                      </div>
                    </div>
                    <div className="row mt12">
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t('settings.minutesPerLevel')}</div>
                      <div className="spacer" />
                      <div className="stepper">
                        <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: Math.max(1, settings.minutesPerLevel - 1) } })}>−</button>
                        <span className="val">{settings.minutesPerLevel}</span>
                        <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: settings.minutesPerLevel + 1 } })}>+</button>
                      </div>
                    </div>
                    <p className="faint" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
                      Default blinds start new sessions & the suggested ladder. The timer on the Table tab uses the minutes above.
                    </p>
                  </div>

                  <div className="section-label">{t('settings.currency')}</div>
                  <div className="card">
                    <div className="segmented">
                      {CURRENCIES.map((c) => (
                        <button
                          key={c}
                          className={settings.currency === c ? 'active' : ''}
                          onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { currency: c } })}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="section-label">{t('settings.backup')}</div>
                  <div className="card">
                    <p className="faint" style={{ fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.6 }}>{t('settings.backupDesc')}</p>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => {
                          void buildBackup(state).then((b) => setBackupMsg(downloadBackup(b) ? null : t('settings.exportFailed')));
                        }}
                      >
                        ⬇ {t('settings.export')}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
                        ⬆ {t('settings.import')}
                      </button>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/json,.json"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setBackupMsg(null);
                        void file.text().catch(() => null).then((text) => {
                          if (text === null) {
                            setBackupMsg(t('settings.importBad'));
                            return;
                          }
                          const parsed = parseBackup(text);
                          if (!parsed) {
                            setBackupMsg(t('settings.importBad'));
                            return;
                          }
                          confirm.ask({
                            text: t('settings.importConfirm', {
                              chips: parsed.summary.chips,
                              sets: parsed.summary.sets,
                              people: parsed.summary.people,
                              nights: parsed.summary.nights,
                            }),
                            confirmLabel: t('settings.import'),
                            danger: true,
                            onYes: () => {
                              dispatch({ type: 'RESTORE_STATE', state: parsed.state });
                              void restorePhotos(parsed.photos);
                              setBackupMsg(t('settings.importDone'));
                            },
                          });
                        });
                      }}
                    />
                    {backupMsg && <p className="faint" style={{ fontSize: 12.5, margin: '10px 2px 0' }}>{backupMsg}</p>}
                  </div>

                  <div className="section-label">{t('settings.data')}</div>
                  <div className="card">
                    <div className="flex-between">
                      <div>
                        <div style={{ fontWeight: 700 }}>{t('settings.resetEverything')}</div>
                        <div className="faint" style={{ fontSize: 12.5 }}>{t('settings.resetDesc')}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          confirm.ask({
                            text: t('settings.resetConfirm'),
                            confirmLabel: t('settings.reset'),
                            danger: true,
                            onYes: () => dispatch({ type: 'RESET' }),
                          });
                        }}
                      >
                        {t('settings.reset')}
                      </button>
                    </div>
                  </div>

          </>
        }
      />

      <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 20 }}>
        {t('settings.footer')}
      </p>
      {confirm.node}
    </div>
  );
}
/**
 * The two things that used to happen at the worst possible moment.
 *
 * The setup wizard used to be a wall you met on first launch — including on every
 * fresh install of a test build — and calibrating the chip ruler used to happen
 * mid-count, at a table, with four people waiting, once per screen and once per
 * way up. Both are the same kind of job: a quiet one, done in advance, kept.
 *
 * So they are both here, at the top of Settings, as buttons rather than as
 * ambushes. Nothing in this section runs on its own.
 */
function BeforeTheNight() {
  const { state, dispatch } = useStore();
  const t = useT();
  const confirm = useConfirm();
  const [wizard, setWizard] = useState(false);
  /** which slot the ruler sheet was opened to measure — null when it is shut */
  const [measuring, setMeasuring] = useState<string | null>(null);

  const cals = state.settings.chipRulerCals;
  const onboardedAt = state.settings.onboardedAt;

  /* Which piece of glass, and which way up, RIGHT NOW. Watched rather than read
     once: this section's whole job is telling the user which slots are still
     empty, and turning the phone over while looking at it changes the answer.
     Both signals are needed — `data-layout` is part of the key and is written on
     its own debounce (see lib/windowLayout), and a rotation is a resize. */
  const [shape, setShape] = useState(readScreenShape);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => setShape(readScreenShape());
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 200);
    };
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
    window.addEventListener('resize', later);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', later);
      obs.disconnect();
    };
  }, []);

  const slots = rulerSlots(cals, shape);
  const here = slots.filter((s) => s.here);
  const elsewhere = slots.filter((s) => !s.here);

  const forget = (slot: RulerSlot) =>
    confirm.ask({
      text: t('settings.rulerForgetConfirm'),
      confirmLabel: t('settings.rulerForget'),
      danger: true,
      onYes: () =>
        dispatch({
          type: 'UPDATE_SETTINGS',
          patch: { chipRulerCals: forgetCalibration(cals, slot.key) },
        }),
    });

  /**
   * What a measured slot says about itself.
   *
   * `20.8 px per chip · 70 px below the glass` was true and useless — two numbers
   * nobody can act on, in units nobody measures chips in. Three drags produce a
   * residual, so the slot can report the thing that matters instead: how far off a
   * stack is likely to read, and when that was last established. A calibration with
   * no residual keeps the old line rather than claiming an accuracy nothing has
   * demonstrated — a two-drag one from before this existed, or a line slid onto a
   * single correction, genuinely has nothing to report.
   */
  const reading = (slot: RulerSlot) => {
    if (!slot.cal) return t('settings.rulerNone');
    const { rms, span, at } = slot.cal;
    const body =
      rms !== undefined && span
        ? t('settings.rulerQuality', { rms: rms.toFixed(1), n: span })
        : t('settings.rulerReady', { px: slot.cal.px.toFixed(1), zero: Math.round(slot.cal.zeroPx) });
    const when = at ? new Date(at).toLocaleDateString(state.settings.language) : '';
    return when ? `${body} · ${when}` : body;
  };

  return (
    <>
      <div className="section-label">{t('settings.beforeNight')}</div>

      <div className="card">
        <div className="flex-between">
          <div>
            <div style={{ fontWeight: 700 }}>{t('settings.wizard')}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              {onboardedAt ? t('settings.wizardRan') : t('settings.wizardNever')}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setWizard(true)}>
            {t('settings.wizardRun')}
          </button>
        </div>
        <p className="faint" style={{ fontSize: 12, margin: '10px 2px 0', lineHeight: 1.6 }}>
          {t('settings.wizardDesc')}
        </p>
      </div>

      <div className="section-label">{t('settings.ruler')}</div>
      <div className="card">
        <p className="faint" style={{ fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.6 }}>
          {t('settings.rulerDesc')}
        </p>

        {here.map((slot) => {
          /* Only the way the phone is being held right now can be measured: the
             offset being solved for is the case lip it is STANDING on, and there
             is no way to drag to the top of a stack beside a screen that is not
             facing you. So the other row says what to do instead of offering a
             button that would quietly measure the wrong edge. */
          const now = slot.portrait === shape.portrait;
          return (
            <div className="ruler-slot" key={slot.key}>
              <div className="ruler-slot-txt">
                <div className="ruler-slot-name">
                  {t(slot.portrait ? 'settings.rulerUpright' : 'settings.rulerSide')}
                  {now && <span className="ruler-slot-now">{t('settings.rulerNow')}</span>}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>{reading(slot)}</div>
              </div>
              {now ? (
                <div className="ruler-slot-actions">
                  {slot.cal && (
                    <button className="btn btn-ghost btn-sm" onClick={() => forget(slot)}>
                      {t('settings.rulerForget')}
                    </button>
                  )}
                  <button
                    className={`btn btn-sm ${slot.cal ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => setMeasuring(slot.key)}
                  >
                    {t(slot.cal ? 'settings.rulerRedo' : 'settings.rulerDo')}
                  </button>
                </div>
              ) : (
                <span className="faint ruler-slot-turn">{t('settings.rulerTurn')}</span>
              )}
            </div>
          );
        })}

        {elsewhere.length > 0 && (
          <>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="ruler-slot-head">{t('settings.rulerOther')}</div>
            {elsewhere.map((slot) => (
              <div className="ruler-slot" key={slot.key}>
                <div className="ruler-slot-txt">
                  <div className="ruler-slot-name">
                    {t(slot.portrait ? 'settings.rulerUpright' : 'settings.rulerSide')}
                    <span className="ruler-slot-glass">{slot.glass}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>{reading(slot)}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => forget(slot)}>
                  {t('settings.rulerForget')}
                </button>
              </div>
            ))}
            <p className="faint" style={{ fontSize: 12, margin: '8px 2px 0', lineHeight: 1.6 }}>
              {t('settings.rulerUnfold')}
            </p>
          </>
        )}

        <p className="faint" style={{ fontSize: 12, margin: '12px 2px 0', lineHeight: 1.6 }}>
          {t('settings.rulerCaseHint')}
        </p>
      </div>

      {/* Both of these are full-screen and `position: fixed`, and this screen
          animates in with a transform — which would make it their containing
          block and lay them out inside the settings column. Portalled, as the big
          screen is from the Table tab. */}
      {wizard && createPortal(<Onboarding onDone={() => setWizard(false)} />, document.body)}
      {measuring &&
        createPortal(<ChipRuler calibrateOnly onClose={() => setMeasuring(null)} />, document.body)}
      {confirm.node}
    </>
  );
}
