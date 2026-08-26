import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { IconCheck, IconChevron } from './Icons';
import { TV_BACKGROUNDS, backgroundsFor } from '../lib/tvBackgrounds';
import { addPhoto, deletePhoto, listPhotos, type SavedPhoto } from '../lib/photoStore';
import { useT } from '../lib/i18n';
import { analyzeBackground } from '../lib/imageAnalysis';
import type { AccentId, Skin, TvTextRole } from '../types';
import { Toggle } from './Toggle';
import {
  DEFAULT_TV_TEXT_SCALE,
  TV_TEXT_MAX,
  TV_TEXT_MIN,
  TV_TEXT_ROLES,
  TV_TEXT_STEP,
  clampTvText,
  isDefaultTvTextScale,
  normalizeTvTextScale,
} from '../lib/tvLayout';

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
 * Which panel name to show for a text role. Most roles ARE a panel; the three that
 * make up the clock (its countdown, its blinds, its level line) are sized apart
 * because that is exactly the complaint — the clock is fine and the line under it
 * is not — so they borrow the labels below.
 */
const ROLE_LABEL: Record<TvTextRole, string> = {
  clock: 'clock',
  blinds: 'blinds',
  level: 'level',
  players: 'roster',
  legend: 'legend',
  stats: 'stats',
  quips: 'quips',
};
const roleLabel = (role: TvTextRole) => ROLE_LABEL[role];


/**
 * The big-screen (TV) configuration — style, accent, extras (quips + background photo)
 * and how to show it on the TV. Lives on the Table tab (the session hub) so it's right
 * next to the live controls; while hosting, every change syncs to the TV instantly.
 */
/**
 * Width/quality steps tried in order until the encoded photo fits BG_MAX_CHARS.
 * The first step is what a good photo gets; the rest are the fallbacks for the
 * 12-megapixel one straight off a phone camera.
 */
const BG_STEPS: [number, number][] = [
  [1600, 0.72],
  [1280, 0.68],
  [1024, 0.62],
  [800, 0.55],
];
/** ~150 kB of base64. A Firestore document caps at 1 MiB including everything else. */
const BG_MAX_CHARS = 200_000;

export default function TvBroadcast() {
  const { state, dispatch, storageFull } = useStore();
  const t = useT();
  const { settings } = state;

  const [open, setOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [penaltyText, setPenaltyText] = useState('');

  // The gallery lives in IndexedDB (see lib/photoStore.ts), so it is read once the
  // panel is actually opened rather than on every Table-tab render.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    // IndexedDB is unavailable in some private modes — no saved photos, no crash
    void listPhotos().then((list) => alive && setPhotos(list)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);
  const [ruleText, setRuleText] = useState('');

  const addToList = (key: 'tvPenalties' | 'tvHouseRules', text: string) => {
    const v = text.trim();
    if (!v) return;
    dispatch({ type: 'UPDATE_SETTINGS', patch: { [key]: [...(settings[key] ?? []), v] } });
  };
  const removeFromList = (key: 'tvPenalties' | 'tvHouseRules', i: number) => {
    dispatch({ type: 'UPDATE_SETTINGS', patch: { [key]: (settings[key] ?? []).filter((_, idx) => idx !== i) } });
  };

  const textScale = normalizeTvTextScale(settings.tvTextScale);
  const setTextScale = (role: TvTextRole, v: number) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { tvTextScale: { ...textScale, [role]: clampTvText(v) } } });

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
          /* Downscale until the encoded string is comfortably small. It has to fit
             three budgets: localStorage (a few MB for the WHOLE app state), a
             Firestore document (1 MiB hard limit, and the base64 of a 1600px photo
             can be most of it), and a phone's data plan — the background rides in
             its own document now, but it is still re-sent whenever it changes. */
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas unavailable');
          let dataUrl = '';
          let w = 0;
          let h = 0;
          for (const [maxW, quality] of BG_STEPS) {
            const scale = Math.min(1, maxW / img.naturalWidth);
            w = Math.round(img.naturalWidth * scale);
            h = Math.round(img.naturalHeight * scale);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= BG_MAX_CHARS) break;
          }
          const { focus, tone } = analyzeBackground(ctx, w, h);
          dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: dataUrl, tvBackgroundFocus: focus, tvBackgroundTone: tone } });
          // keep it: picking the same photo again next week should not mean
          // hunting through the camera roll for it
          // the photo is already applied above; keeping it for next week is a bonus
          void addPhoto({ url: dataUrl, tone, focus }).then(() => listPhotos()).then(setPhotos).catch(() => {});
        } catch {
          setBgError(t('settings.bgErrProcess'));
        } finally {
          setBgBusy(false);
        }
      };
      img.onerror = () => {
        setBgError(t('settings.bgErrRead'));
        setBgBusy(false);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      setBgError(t('settings.bgErrFile'));
      setBgBusy(false);
    };
    reader.readAsDataURL(file);
  };

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
              <Toggle
                on={settings.tvQuips}
                label={t('settings.quips')}
                onChange={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvQuips: !settings.tvQuips } })}
              />
            </div>
            <div className="divider" />
            {/* The trend line lives on the roster on both screens, but it is the TV
                the question gets asked about — twelve rows across a room. */}
            <div className="row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('roster.trendLine')}</div>
                <div className="faint" style={{ fontSize: 12 }}>{t('settings.trendDesc')}</div>
              </div>
              <div className="spacer" />
              <Toggle
                on={settings.showTrend !== false}
                label={t('roster.trendLine')}
                onChange={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { showTrend: settings.showTrend === false } })}
              />
            </div>
            <div className="divider" />
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t('table.rosterSort')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('table.rosterSortDesc')}</div>
            <div className="segmented">
              {([
                ['seat', t('table.sortSeat')],
                ['chips', t('table.sortChips')],
                ['profit', t('table.sortProfit')],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  className={(settings.tvRosterSort ?? 'seat') === id ? 'active' : ''}
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvRosterSort: id } })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="divider" />
            {/* Sizing the big screen's text, piece by piece. The overall zoom is
                per-device and lives on the TV itself (it answers "this laptop is not
                a TV"); these are part of the setup and travel to the screen, because
                the screen has no keyboard to dial them in on. */}
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t('settings.tvTextSize')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('settings.tvTextSizeDesc')}</div>
            <div className="tv-text-sizes">
              {TV_TEXT_ROLES.map((role) => (
                <div className="row tv-text-row" key={role}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t(`tv.panel.${roleLabel(role)}` as 'tv.panel.clock')}</div>
                  <div className="spacer" />
                  <div className="stepper">
                    <button
                      onClick={() => setTextScale(role, textScale[role] - TV_TEXT_STEP)}
                      disabled={textScale[role] <= TV_TEXT_MIN}
                      aria-label="−"
                    >
                      −
                    </button>
                    <span className="val">{Math.round(textScale[role] * 100)}%</span>
                    <button
                      onClick={() => setTextScale(role, textScale[role] + TV_TEXT_STEP)}
                      disabled={textScale[role] >= TV_TEXT_MAX}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!isDefaultTvTextScale(textScale) && (
              <button
                className="btn btn-ghost btn-sm mt8"
                onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvTextScale: { ...DEFAULT_TV_TEXT_SCALE } } })}
              >
                {t('settings.tvTextReset')}
              </button>
            )}
            <div className="divider" />
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t('settings.tvLayoutHead')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('settings.tvLayoutDesc')}</div>
            <div className="row" style={{ gap: 8 }}>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {settings.tvLayout ? t('settings.tvLayoutCustom') : t('settings.tvLayoutDefault')}
              </span>
              <div className="spacer" />
              {settings.tvLayout && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvLayout: null, tvLayoutOwn: false } })}
                >
                  {t('settings.tvLayoutReset')}
                </button>
              )}
            </div>
            <div className="divider" />
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t('settings.tvBackground')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>{t('settings.tvBackgroundDesc')}</div>
            {/* Ordered so the ones drawn for the chosen big-screen style come first —
                casino and sci-fi each have their own set. */}
            <div className="bg-preset-grid">
              {backgroundsFor(effTvSkin).map((p) => (
                <button
                  key={p.id}
                  className={`bg-preset ${settings.tvBackground === p.url ? 'active' : ''} ${p.skin === effTvSkin ? 'matches' : ''}`}
                  style={{ backgroundImage: `url("${p.url}")` }}
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: p.url, tvBackgroundFocus: { x: 50, y: 50 }, tvBackgroundTone: p.tone } })}
                  title={p.name}
                >
                  <span>{p.name}</span>
                </button>
              ))}
            </div>

            {/* The user's own gallery — saved on this device, never synced. */}
            {photos.length > 0 && (
              <>
                <div className="bg-fav-head">
                  {t('settings.myPhotos')}
                  <span className="faint">{t('settings.myPhotosHint')}</span>
                </div>
                <div className="bg-fav-strip">
                  {photos.map((ph) => (
                    <div className={`bg-fav ${settings.tvBackground === ph.url ? 'active' : ''}`} key={ph.id}>
                      <button
                        className="bg-fav-pick"
                        style={{ backgroundImage: `url("${ph.url}")` }}
                        onClick={() =>
                          dispatch({
                            type: 'UPDATE_SETTINGS',
                            patch: { tvBackground: ph.url, tvBackgroundFocus: ph.focus, tvBackgroundTone: ph.tone },
                          })
                        }
                        aria-label={t('settings.myPhotos')}
                      />
                      <button
                        className="bg-fav-x"
                        aria-label={t('settings.removePhoto')}
                        onClick={() => {
                          void deletePhoto(ph.id).then(() => setPhotos((l) => l.filter((x) => x.id !== ph.id))).catch(() => {});
                          if (settings.tvBackground === ph.url)
                            dispatch({ type: 'UPDATE_SETTINGS', patch: { tvBackground: null, tvBackgroundFocus: null, tvBackgroundTone: null } });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {settings.tvBackground &&
              !TV_BACKGROUNDS.some((p) => p.url === settings.tvBackground) &&
              !photos.some((p) => p.url === settings.tvBackground) && (
                <div className="tv-bg-preview" style={{ backgroundImage: `url("${settings.tvBackground}")` }} />
              )}
            {bgError && <p style={{ color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' }}>{bgError}</p>}
            {/* The photo was dropped to get the rest of the night saved — say so,
                rather than letting it disappear on the next launch unexplained. */}
            {storageFull && (
              <p style={{ color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' }}>{t('settings.storageFull')}</p>
            )}
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

          {/* Fun extras: penalty spinner entries + break house rules */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>🎡 {t('table.penalties')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('table.penaltiesDesc')}</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input" style={{ flex: 1 }} value={penaltyText} maxLength={60}
                placeholder={t('table.penaltyPlaceholder')}
                onChange={(e) => setPenaltyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addToList('tvPenalties', penaltyText); setPenaltyText(''); } }}
              />
              <button className="btn btn-primary btn-sm" disabled={!penaltyText.trim()} onClick={() => { addToList('tvPenalties', penaltyText); setPenaltyText(''); }}>{t('table.addSaying')}</button>
            </div>
            {(settings.tvPenalties ?? []).length > 0 && (
              <div className="chip-list mt8">
                {(settings.tvPenalties ?? []).map((p, i) => (
                  <span className="chip-list-item" key={i}>{p}<button onClick={() => removeFromList('tvPenalties', i)} aria-label={t('common.remove')}>×</button></span>
                ))}
              </div>
            )}
            <div className="divider" />
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>📜 {t('table.houseRules')}</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>{t('table.houseRulesDesc')}</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input" style={{ flex: 1 }} value={ruleText} maxLength={80}
                placeholder={t('table.rulePlaceholder')}
                onChange={(e) => setRuleText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addToList('tvHouseRules', ruleText); setRuleText(''); } }}
              />
              <button className="btn btn-primary btn-sm" disabled={!ruleText.trim()} onClick={() => { addToList('tvHouseRules', ruleText); setRuleText(''); }}>{t('table.addSaying')}</button>
            </div>
            {(settings.tvHouseRules ?? []).length > 0 && (
              <div className="chip-list mt8">
                {(settings.tvHouseRules ?? []).map((p, i) => (
                  <span className="chip-list-item" key={i}>{p}<button onClick={() => removeFromList('tvHouseRules', i)} aria-label={t('common.remove')}>×</button></span>
                ))}
              </div>
            )}
          </div>

          {/* Show on TV — open this URL in the TV's own browser, then tap
              "Use this device as the TV". No QR here: the TV already runs this
              page, and the pairing QR (scan to control) lives on the TV screen. */}
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t('table.showOnTvHere')}</div>
            <p className="faint" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
              {t('table.castHint')}
            </p>
            <div className="url-box">{WEB_URL}</div>
            <button className="btn btn-ghost btn-block btn-sm mt8" onClick={copyUrl}>
              {urlCopied ? (
                <>
                  <IconCheck size={16} /> {t('settings.copied')}
                </>
              ) : (
                t('settings.copyLink')
              )}
            </button>
          </div>
        </>
      )}
    </>
  );
}
