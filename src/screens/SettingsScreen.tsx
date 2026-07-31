import { useStore } from '../store';
import Chip from '../components/Chip';
import { useT, useFmt } from '../lib/i18n';
import type { Appearance, AccentId, Skin, ChipArt } from '../types';

const CURRENCIES = ['€', '$', '£', 'zł', 'Fr'];
const UNIT_PRESETS = [
  { label: '1 point = 1¢', value: 0.01 },
  { label: '1 point = 10¢', value: 0.1 },
  { label: '1 point = €1', value: 1 },
];

const STYLES: { id: Skin; name: string; bg: string; note: string }[] = [
  { id: 'minimal', name: 'Minimal', bg: '#16161a', note: 'Neutral canvas — also pick light / dark below.' },
  { id: 'casino', name: 'Casino Felt', bg: 'radial-gradient(120% 90% at 50% 0%, #275a3d, #0a1c12)', note: 'Warm green felt & brass, with a serif touch.' },
  { id: 'playful', name: 'Playful', bg: '#fbe9c8', note: 'Bright, bold and chunky.' },
  { id: 'scifi', name: 'Sci-Fi', bg: 'radial-gradient(120% 90% at 50% 0%, #0c1a4c, #05060f)', note: 'Deep space with a neon glow.' },
];

const APPEARANCES: { id: Appearance; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

const ACCENTS: { id: AccentId; name: string; color: string }[] = [
  { id: 'amber', name: 'Amber', color: '#f0b429' },
  { id: 'gold', name: 'Gold', color: '#e6c878' },
  { id: 'emerald', name: 'Emerald', color: '#34d399' },
  { id: 'cyan', name: 'Cyan', color: '#3fe6ff' },
  { id: 'cobalt', name: 'Cobalt', color: '#5aa0ff' },
  { id: 'violet', name: 'Violet', color: '#b18cff' },
  { id: 'crimson', name: 'Crimson', color: '#ff6b6b' },
  { id: 'coral', name: 'Coral', color: '#ff7a4d' },
];

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

  const activeStyle = STYLES.find((s) => s.id === settings.skin) ?? STYLES[0];
  const accentColor = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.color ?? '#f0b429';
  const currentAccent = settings.accents?.[settings.skin] ?? 'amber';
  // picking a preset clears any custom accent so the preset takes over
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...settings.accents, [settings.skin]: id }, customAccent: null } });

  return (
    <div>
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
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={settings.unitValue}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { unitValue: Math.max(0, +e.target.value) } })}
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
              if (confirm('Reset all chips, players and settings to defaults?')) dispatch({ type: 'RESET' });
            }}
          >
            {t('settings.reset')}
          </button>
        </div>
      </div>

      <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 20 }}>
        {t('settings.footer')}
      </p>
    </div>
  );
}
