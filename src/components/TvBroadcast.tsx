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

// Themed background presets — generated SVG (no copyright, tiny, syncs to the TV).
// `tone` is the mean luminance the TV uses to size its readability scrim.
const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const W = 1600;
const H = 900;
function neonGrid(): string {
  let lines = '';
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W;
    lines += `<line x1='${x}' y1='340' x2='${800 + (x - 800) * 2.6}' y2='900'/>`;
  }
  for (let i = 1; i <= 5; i++) {
    const y = 340 + (i / 5) * 560;
    lines += `<line x1='0' y1='${y}' x2='${W}' y2='${y}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0c1a4c'/><stop offset='1' stop-color='#05060f'/></linearGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/><circle cx='800' cy='320' r='520' fill='#3fe6ff' fill-opacity='0.10'/><g stroke='#3fe6ff' stroke-opacity='0.16' stroke-width='2'>${lines}</g></svg>`;
}
const PRESETS: { id: string; name: string; tone: number; url: string }[] = [
  {
    id: 'felt', name: 'Felt', tone: 0.18,
    url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><radialGradient id='g' cx='50%' cy='36%' r='78%'><stop offset='0%' stop-color='#2f7d54'/><stop offset='58%' stop-color='#17573a'/><stop offset='100%' stop-color='#0a2a1c'/></radialGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/></svg>`),
  },
  { id: 'neon', name: 'Neon', tone: 0.12, url: svgUrl(neonGrid()) },
  {
    id: 'sunset', name: 'Sunset', tone: 0.5,
    url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><linearGradient id='g' x1='0' y1='0' x2='0.4' y2='1'><stop offset='0' stop-color='#ffb15a'/><stop offset='0.5' stop-color='#ff6f7d'/><stop offset='1' stop-color='#7a3fb0'/></linearGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/><circle cx='1180' cy='250' r='150' fill='#fff' fill-opacity='0.28'/></svg>`),
  },
  {
    id: 'slate', name: 'Slate', tone: 0.14,
    url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#26262e'/><stop offset='1' stop-color='#0c0c10'/></linearGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/></svg>`),
  },
  {
    id: 'baize', name: 'Emerald', tone: 0.2,
    url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><radialGradient id='g' cx='50%' cy='40%' r='80%'><stop offset='0%' stop-color='#1f8a6d'/><stop offset='60%' stop-color='#0f5a48'/><stop offset='100%' stop-color='#062720'/></radialGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/></svg>`),
  },
  {
    id: 'amber', name: 'Amber', tone: 0.28,
    url: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><radialGradient id='g' cx='50%' cy='34%' r='82%'><stop offset='0%' stop-color='#3a2c12'/><stop offset='55%' stop-color='#211a10'/><stop offset='100%' stop-color='#0c0a06'/></radialGradient></defs><rect width='${W}' height='${H}' fill='url(#g)'/><circle cx='800' cy='300' r='460' fill='#f0b429' fill-opacity='0.12'/></svg>`),
  },
];

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
            <div className="bg-preset-grid">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`bg-preset ${settings.tvBackground === p.url ? 'active' : ''}`}
                  style={{ backgroundImage: `url("${p.url}")` }}
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: p.url, tvBackgroundFocus: { x: 50, y: 50 }, tvBackgroundTone: p.tone } })}
                  title={p.name}
                >
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            {settings.tvBackground && !PRESETS.some((p) => p.url === settings.tvBackground) && (
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
