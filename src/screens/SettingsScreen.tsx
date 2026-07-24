import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store';
import { fmtMoney } from '../lib/money';
import Chip from '../components/Chip';
import { IconCheck } from '../components/Icons';
import { useT } from '../lib/i18n';
import type { Appearance, AccentId, Skin, ChipArt } from '../types';

const WEB_URL = 'https://ndre-droid.github.io/chipstack/';
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

  const activeStyle = STYLES.find((s) => s.id === settings.skin) ?? STYLES[0];
  const accentColor = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.color ?? '#f0b429';
  const currentAccent = settings.accents?.[settings.skin] ?? 'amber';
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...settings.accents, [settings.skin]: id } } });

  const [urlCopied, setUrlCopied] = useState(false);
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(WEB_URL);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      setUrlCopied(false);
    }
  };
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const onPickBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBgError(null);
    setBgBusy(true);
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        try {
          // downscale so the stored data URL stays well within localStorage limits
          const maxW = 1920;
          const scale = Math.min(1, maxW / img.naturalWidth);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas unavailable');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: dataUrl } });
        } catch {
          setBgError('Could not process that image — try a different photo.');
        } finally {
          setBgBusy(false);
        }
      };
      img.onerror = () => {
        setBgError('Could not read that image — try a different file.');
        setBgBusy(false);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      setBgError('Could not read that file.');
      setBgBusy(false);
    };
    reader.readAsDataURL(file);
  };

  const urlQr = useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(WEB_URL);
      qr.make();
      return qr.createDataURL(5, 16);
    } catch {
      return null;
    }
  }, []);

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
        {t('settings.tvStyle')}
        <span className="hint">{t('settings.tvStyleHint')}</span>
      </div>
      <div className="card">
        <div className="style-grid">
          {[{ id: 'match' as const, name: t('settings.matchPhone'), bg: activeStyle.bg }, ...STYLES].map((s) => (
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
        <p className="faint" style={{ fontSize: 12.5, margin: '12px 2px 0' }}>{t('settings.tvStyleNote')}</p>
      </div>

      <div className="section-label">{t('settings.tvExtras')}</div>
      <div className="card">
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('settings.quips')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('settings.quipsDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${settings.tvQuips ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvQuips: !settings.tvQuips } })}
            role="switch"
            aria-checked={settings.tvQuips}
          />
        </div>

        <div className="divider" />

        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t('settings.tvBackground')}</div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>{t('settings.tvBackgroundDesc')}</div>
        {settings.tvBackground && (
          <div className="tv-bg-preview" style={{ backgroundImage: `url(${settings.tvBackground})` }} />
        )}
        {bgError && <p style={{ color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' }}>{bgError}</p>}
        <div className="row" style={{ gap: 8 }}>
          <label className="btn btn-ghost btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
            {bgBusy ? '…' : settings.tvBackground ? t('settings.replacePhoto') : t('settings.choosePhoto')}
            <input type="file" accept="image/*" onChange={onPickBackground} style={{ display: 'none' }} disabled={bgBusy} />
          </label>
          {settings.tvBackground && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: null } })}
            >
              {t('settings.remove')}
            </button>
          )}
        </div>
      </div>

      <div className="section-label">{t('settings.showOnTv')}</div>
      <div className="card">
        <p className="faint" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
          Best way — the phone stays free: open this address in your <b>TV’s web browser</b>, then go to
          <b> Table → Big screen</b> and run it with the TV remote.
        </p>
        <div className="code-box" style={{ textAlign: 'center', fontSize: 14, letterSpacing: '0.02em' }}>{WEB_URL}</div>
        <button className="btn btn-ghost btn-block btn-sm mt8" onClick={copyUrl}>
          {urlCopied ? (
            <>
              <IconCheck size={16} /> {t('settings.copied')}
            </>
          ) : (
            t('settings.copyLink')
          )}
        </button>
        {urlQr && (
          <div className="qr-wrap">
            <img src={urlQr} alt="Web app QR code" />
            <span className="faint" style={{ fontSize: 11.5 }}>Scan with a phone to open, or bookmark on the TV</span>
          </div>
        )}
        <p className="faint" style={{ fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.6 }}>
          It updates automatically and runs offline after the first load.
          <br />
          <b>Or mirror the phone:</b> Android → Smart View / Cast; iPhone → Screen Mirroring (AirPlay) — but then the phone must stay on this screen.
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
