import { useStore } from '../store';
import { fmtMoney } from '../lib/money';
import Chip from '../components/Chip';
import type { ThemeId, ChipArt } from '../types';

const CURRENCIES = ['€', '$', '£', 'zł', 'Fr'];
const UNIT_PRESETS = [
  { label: '1 point = 1¢', value: 0.01 },
  { label: '1 point = 10¢', value: 0.1 },
  { label: '1 point = €1', value: 1 },
];

const THEMES: { id: ThemeId; name: string; sub: string; bg: string; accent: string; text: string }[] = [
  { id: 'gold', name: 'Midnight Gold', sub: 'the original', bg: '#0a0a0c', accent: '#e4b41f', text: '#f6f6f8' },
  { id: 'emerald', name: 'Emerald Felt', sub: 'casino green', bg: '#06120c', accent: '#e4b41f', text: '#e8f3ec' },
  { id: 'crimson', name: 'Crimson Velvet', sub: 'deep red', bg: '#130607', accent: '#e4b41f', text: '#f6e8ea' },
  { id: 'retro', name: 'Terminal', sub: 'retro CRT', bg: '#030803', accent: '#b6ff3a', text: '#86ff7a' },
  { id: 'scifi', name: 'Neon Drive', sub: 'sci-fi', bg: '#04060f', accent: '#21e6ff', text: '#e3ecff' },
  { id: 'elite', name: 'Maison', sub: 'elegant serif', bg: '#111013', accent: '#c8a44e', text: '#efe9df' },
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

  return (
    <div>
      <div className="section-label">Theme</div>
      <div className="card">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch ${settings.theme === t.id ? 'active' : ''}`}
              style={{ background: t.bg }}
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { theme: t.id } })}
            >
              <span className="theme-dots">
                <i style={{ background: t.accent }} />
                <i style={{ background: t.text }} />
              </span>
              <span className="theme-name" style={{ color: t.text }}>{t.name}</span>
              <span className="theme-sub" style={{ color: t.accent }}>{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-label">Chip art</div>
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

      <div className="section-label">Money mapping</div>
      <div className="card">
        <div className="field">
          <label>What is 1 chip point worth?</label>
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

      <div className="section-label">Default starting blinds</div>
      <div className="card">
        <div className="row">
          <div className="field">
            <label>Small blind</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={settings.defaultSmallBlind || ''}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { defaultSmallBlind: Math.max(0, +e.target.value) } })}
            />
          </div>
          <div className="field">
            <label>Big blind</label>
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
          <div style={{ fontWeight: 700, fontSize: 14 }}>Minutes per blind level</div>
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

      <div className="section-label">Currency</div>
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

      <div className="section-label">Data</div>
      <div className="card">
        <div className="flex-between">
          <div>
            <div style={{ fontWeight: 700 }}>Reset everything</div>
            <div className="faint" style={{ fontSize: 12.5 }}>Restore the default SLOWPLAY chip set & session.</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm('Reset all chips, players and settings to defaults?')) dispatch({ type: 'RESET' });
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 20 }}>
        ChipStack · everything is stored on your device.
      </p>
    </div>
  );
}
