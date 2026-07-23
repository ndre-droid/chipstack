import { useStore } from '../store';
import { fmtMoney } from '../lib/money';
import Chip from '../components/Chip';
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

  const activeStyle = STYLES.find((s) => s.id === settings.skin) ?? STYLES[0];
  const accentColor = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.color ?? '#f0b429';
  const currentAccent = settings.accents?.[settings.skin] ?? 'amber';
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...settings.accents, [settings.skin]: id } } });

  return (
    <div>
      <div className="section-label">Style</div>
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
          <div className="section-label">Appearance</div>
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
        Accent
        <span className="hint">{activeStyle.name}</span>
      </div>
      <div className="card">
        <div className="accent-grid">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className={`accent-opt ${currentAccent === a.id ? 'active' : ''}`}
              onClick={() => setAccent(a.id)}
            >
              <span className="dot" style={{ background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section-label">
        TV broadcast style
        <span className="hint">match phone or pick</span>
      </div>
      <div className="card">
        <div className="style-grid">
          {[{ id: 'match' as const, name: 'Match phone', bg: activeStyle.bg }, ...STYLES].map((s) => (
            <button
              key={s.id}
              className={`style-opt ${(settings.tvSkin ?? 'match') === s.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvSkin: s.id } })}
            >
              <span className="style-swatch" style={{ background: s.bg }}>
                <span
                  className="sw-dot"
                  style={{ background: s.id === 'match' ? accentColor(currentAccent) : accentColor(settings.accents?.[s.id] ?? 'amber') }}
                />
              </span>
              <span className="style-name">{s.name}</span>
            </button>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 12.5, margin: '12px 2px 0' }}>
          The big-screen look on the Table tab’s TV mode. Defaults to matching your phone; pick a style to make it independent.
        </p>
      </div>

      <div className="section-label">Cast to TV</div>
      <div className="card">
        <p className="faint" style={{ fontSize: 13, margin: 0, lineHeight: 1.65 }}>
          Open <b>Table → Big screen · TV mode</b>, turn the phone <b>landscape</b>, then mirror the screen:
          <br />• <b>Android:</b> swipe down → <b>Smart View / Cast</b> → your LG TV.
          <br />• <b>iPhone:</b> Control Centre → <b>Screen Mirroring</b> → your LG TV (AirPlay).
          <br />It stays awake while casting.
        </p>
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
