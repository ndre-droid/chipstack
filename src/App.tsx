import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import PlanScreen from './screens/PlanScreen';
import ChipsScreen from './screens/ChipsScreen';
import TableScreen from './screens/TableScreen';
import CashScreen from './screens/CashScreen';
import SettingsScreen from './screens/SettingsScreen';
import TvMode from './screens/TvMode';
import { IconPlan, IconChips, IconTable, IconCash, IconSettings } from './components/Icons';
import { useT } from './lib/i18n';
import { useLiveHostSync } from './lib/useLiveHostSync';
import { useNativeDeepLink, appSchemeUrl } from './lib/deepLink';
import { customAccentVars } from './lib/color';

type Tab = 'plan' | 'chips' | 'table' | 'cash';
type View = Tab | 'settings';

const TABS: { id: Tab; key: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: 'plan', key: 'nav.plan', icon: IconPlan },
  { id: 'chips', key: 'nav.chips', icon: IconChips },
  { id: 'table', key: 'nav.table', icon: IconTable },
  { id: 'cash', key: 'nav.cash', icon: IconCash },
];

// Token ring — matches the app icon: accent tile, ring + centre dot in the on-accent
// colour. Minimal, themeable (follows the active skin's accent).
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="var(--acc)" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="var(--on-acc)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.1" fill="var(--on-acc)" />
    </svg>
  );
}

// Captured once at load (before React), so it survives StrictMode's double-mount
// even after the effect strips the URL — a phone opening the TV's QR pairs reliably.
const initialTvCode: string | null = (() => {
  try {
    const c = new URLSearchParams(window.location.search).get('tv');
    return c && /^\d{4}$/.test(c) ? c : null;
  } catch {
    return null;
  }
})();

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}

function AppShell() {
  const [view, setView] = useState<View>('plan');
  const lastTab = useRef<Tab>('plan');
  const { state, dispatch } = useStore();
  const { skin, accents, appearance, deviceIsTv, customAccent } = state.settings;
  const activeSkin = skin ?? 'minimal';
  const activeAccent = accents?.[activeSkin] ?? 'amber';
  const t = useT();
  useLiveHostSync();

  // Connect this phone as the host of a session (from the TV's QR / deep link).
  const connectAsHost = (code: string) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'host', deviceIsTv: false } });
  // Native app: opened via chipstack://tv/NNNN (or the https App Link) → host it.
  useNativeDeepLink(connectAsHost);

  // On the WEB, a phone that scanned the QR can hand off into the installed app.
  const isAndroidWeb = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [openAppBar, setOpenAppBar] = useState(!!initialTvCode && isAndroidWeb);

  const HEADER_SUB: Record<View, string> = {
    plan: t('header.plan'),
    chips: t('header.chips'),
    table: t('header.table'),
    cash: t('header.cash'),
    settings: t('header.settings'),
  };

  // Deep link from the TV's QR: `?tv=NNNN` connects this phone as the host of
  // that session (the TV already created the doc), then strips the param so a
  // reload doesn't re-trigger it. Runs once on load.
  useEffect(() => {
    if (!initialTvCode) return;
    dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: initialTvCode, liveSessionRole: 'host', deviceIsTv: false } });
    const url = window.location.origin + window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apply skin + accent (+ appearance for minimal) to <html>.
  // each skin carries its own accent; 'minimal' also honours light/dark, the other
  // skins are self-contained colour worlds.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-skin', activeSkin);
    root.setAttribute('data-accent', activeAccent);
    if (activeSkin === 'minimal' && appearance !== 'system') root.setAttribute('data-theme', appearance);
    else root.removeAttribute('data-theme');
    // free custom accent overrides the preset hues (all skins) when set
    const custom = customAccent && /^#[0-9a-fA-F]{6}$/.test(customAccent) ? customAccentVars(customAccent) : null;
    for (const key of ['--acc', '--acc-bright', '--acc-deep']) {
      if (custom) root.style.setProperty(key, custom[key]);
      else root.style.removeProperty(key);
    }
  }, [activeSkin, activeAccent, appearance, customAccent]);

  const toSettings = () => {
    if (view === 'settings') setView(lastTab.current);
    else setView('settings');
  };
  const goTab = (t: Tab) => {
    lastTab.current = t;
    setView(t);
  };

  // This device is the designated TV: boot straight into the big screen. Exiting
  // clears the flag (and any live session) and returns to the normal phone app.
  if (deviceIsTv) {
    return (
      <TvMode
        onClose={() =>
          dispatch({ type: 'UPDATE_SETTINGS', patch: { deviceIsTv: false, liveSessionRole: null, liveSessionCode: null } })
        }
      />
    );
  }

  return (
    <div className="app">
      {openAppBar && initialTvCode && (
        <div className="openapp-banner">
          <span className="openapp-txt">{t('app.openInApp')}</span>
          <a className="btn btn-primary btn-sm" href={appSchemeUrl(initialTvCode)}>{t('app.openApp')}</a>
          <button className="openapp-x" onClick={() => setOpenAppBar(false)} aria-label={t('app.stayWeb')}>×</button>
        </div>
      )}
      <header className="app-header">
        <LogoMark />
        <span className="wordmark">
          Chip<b>Stack</b>
        </span>
        <span className="header-sub">{HEADER_SUB[view]}</span>
        <button
          className={`header-gear ${view === 'settings' ? 'on' : ''}`}
          onClick={toSettings}
          aria-label={t('header.settings')}
          aria-pressed={view === 'settings'}
        >
          <IconSettings size={19} />
        </button>
      </header>

      <main className="screen" key={view}>
        {view === 'plan' && <PlanScreen />}
        {view === 'chips' && <ChipsScreen />}
        {view === 'table' && <TableScreen />}
        {view === 'cash' && <CashScreen />}
        {view === 'settings' && <SettingsScreen />}
      </main>

      <nav className="bottom-nav">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} className={`nav-item ${view === tab.id ? 'active' : ''}`} onClick={() => goTab(tab.id)}>
              <Icon size={22} />
              {t(tab.key)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
