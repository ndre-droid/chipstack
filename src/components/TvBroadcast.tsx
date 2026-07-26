import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store';
import { IconCheck, IconChevron } from './Icons';
import { useT } from '../lib/i18n';
import { analyzeBackground } from '../lib/imageAnalysis';
import type { AccentId, Skin } from '../types';

const WEB_URL = 'https://ndre-droid.github.io/chipstack/';

const STYLES: { id: Skin; name: string; bg: string }[] = [
  { id: 'minimal', name: 'Minimal', bg: '#16161a' },
  { id: 'casino', name: 'Casino', bg: 'radial-gradient(120% 90% at 50% 0%, #275a3d, #0a1c12)' },
  { id: 'playful', name: 'Playful', bg: '#fbe9c8' },
  { id: 'scifi', name: 'Sci-Fi', bg: 'radial-gradient(120% 90% at 50% 0%, #0c1a4c, #05060f)' },
];
const ACCENTS: { id: AccentId; color: string }[] = [
  { id: 'amber', color: '#f0b429' }, { id: 'gold', color: '#e6c878' },
  { id: 'emerald', color: '#34d399' }, { id: 'cyan', color: '#3fe6ff' },
  { id: 'cobalt', color: '#5aa0ff' }, { id: 'violet', color: '#b18cff' },
  { id: 'crimson', color: '#ff6b6b' }, { id: 'coral', color: '#ff7a4d' },
];
const accentColor = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.color ?? '#f0b429';

/**
 * The big-screen (TV) configuration — style, accent, extras (quips + background photo)
 * and how to show it on the TV. Lives on the Table tab (the session hub) so it's right
 * next to the live controls; while hosting, every change syncs to the TV instantly.
 */
export default function TvBroadcast() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { settings } = state;

  const [open, setOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);

  const activeSkin = settings.skin ?? 'minimal';
  const activeStyleBg = STYLES.find((s) => s.id === activeSkin)?.bg ?? STYLES[0].bg;
  // the accent shown/edited is the effective TV skin's accent (match → phone skin)
  const effTvSkin: Skin = (settings.tvSkin ?? 'match') === 'match' ? activeSkin : (settings.tvSkin as Skin);
  const currentAccent = settings.accents?.[effTvSkin] ?? 'amber';
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...settings.accents, [effTvSkin]: id } } });

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(WEB_URL);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      setUrlCopied(false);
    }
  };

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
          // downscale so the data URL fits localStorage AND syncs through Firestore (1 MiB cap)
          const maxW = 1600;
          const scale = Math.min(1, maxW / img.naturalWidth);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas unavailable');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.74);
          const { focus, tone } = analyzeBackground(ctx, w, h);
          dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: dataUrl, tvBackgroundFocus: focus, tvBackgroundTone: tone } });
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
    <>
      <button className="section-label collapsible-head" onClick={() => setOpen((v) => !v)}>
        {t('table.tvBroadcast')}
        <span className="hint">{t('table.tvBroadcastHint')}</span>
        <span className={`chevron ${open ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {open && (
        <>
          {/* TV style */}
          <div className="card">
            <div className="style-grid">
              {[{ id: 'match' as const, name: t('settings.matchPhone'), bg: activeStyleBg }, ...STYLES].map((s) => (
                <button
                  key={s.id}
                  className={`style-opt ${(settings.tvSkin ?? 'match') === s.id ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvSkin: s.id } })}
                >
                  <span className="style-swatch" style={{ background: s.bg }}>
                    <span
                      className="sw-dot"
                      style={{ background: s.id === 'match' ? accentColor(currentAccent) : accentColor(settings.accents?.[s.id as Skin] ?? 'amber') }}
                    />
                  </span>
                  <span className="style-name">{s.name}</span>
                </button>
              ))}
            </div>
            <div className="section-label" style={{ margin: '14px 2px 8px', padding: 0 }}>{t('settings.accent')}</div>
            <div className="accent-grid">
              {ACCENTS.map((a) => (
                <button key={a.id} className={`accent-opt ${currentAccent === a.id ? 'active' : ''}`} onClick={() => setAccent(a.id)}>
                  <span className="dot" style={{ background: a.color }} />
                  {a.id}
                </button>
              ))}
            </div>
          </div>

          {/* TV extras: quips + background */}
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
            {settings.tvBackground && <div className="tv-bg-preview" style={{ backgroundImage: `url(${settings.tvBackground})` }} />}
            {bgError && <p style={{ color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' }}>{bgError}</p>}
            <div className="row" style={{ gap: 8 }}>
              <label className="btn btn-ghost btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
                {bgBusy ? '…' : settings.tvBackground ? t('settings.replacePhoto') : t('settings.choosePhoto')}
                <input type="file" accept="image/*" onChange={onPickBackground} style={{ display: 'none' }} disabled={bgBusy} />
              </label>
              {settings.tvBackground && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: null, tvBackgroundFocus: null, tvBackgroundTone: null } })}
                >
                  {t('settings.remove')}
                </button>
              )}
            </div>
          </div>

          {/* Show on TV */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t('table.showOnTvHere')}</div>
            <p className="faint" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
              {t('table.castHint')}
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
                <span className="faint" style={{ fontSize: 11.5 }}>{t('tv.scanToConnect')}</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
