import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import PlanScreen from './screens/PlanScreen';
import ChipsScreen from './screens/ChipsScreen';
import TableScreen from './screens/TableScreen';
import CashScreen from './screens/CashScreen';
import SettingsScreen from './screens/SettingsScreen';
import { IconPlan, IconChips, IconTable, IconCash, IconSettings } from './components/Icons';
import { useT } from './lib/i18n';
import { useLiveHostSync } from './lib/useLiveHostSync';

type Tab = 'plan' | 'chips' | 'table' | 'cash';
type View = Tab | 'settings';

const TABS: { id: Tab; key: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: 'plan', key: 'nav.plan', icon: IconPlan },
  { id: 'chips', key: 'nav.chips', icon: IconChips },
  { id: 'table', key: 'nav.table', icon: IconTable },
  { id: 'cash', key: 'nav.cash', icon: IconCash },
];

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="7" fill="var(--acc)" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="var(--on-acc)" strokeWidth="1.6" opacity="0.9" />
      <circle cx="12" cy="12" r="2.4" fill="var(--on-acc)" />
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <rect
            key={i}
            x={12 + Math.cos(a) * 6.5 - 1.4}
            y={12 + Math.sin(a) * 6.5 - 0.9}
            width="2.8"
            height="1.8"
            rx="0.9"
            fill="var(--on-acc)"
            transform={`rotate(${(i / 4) * 360} ${12 + Math.cos(a) * 6.5} ${12 + Math.sin(a) * 6.5})`}
          />
        );
      })}
    </svg>
  );
}

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
  const { state } = useStore();
  const { skin, accents, appearance } = state.settings;
  const activeSkin = skin ?? 'minimal';
  const activeAccent = accents?.[activeSkin] ?? 'amber';
  const t = useT();
  useLiveHostSync();
  const HEADER_SUB: Record<View, string> = {
    plan: t('header.plan'),
    chips: t('header.chips'),
    table: t('header.table'),
    cash: t('header.cash'),
    settings: t('header.settings'),
  };

  // apply skin + accent (+ appearance for minimal) to <html>.
  // each skin carries its own accent; 'minimal' also honours light/dark, the other
  // skins are self-contained colour worlds.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-skin', activeSkin);
    root.setAttribute('data-accent', activeAccent);
    if (activeSkin === 'minimal' && appearance !== 'system') root.setAttribute('data-theme', appearance);
    else root.removeAttribute('data-theme');
  }, [activeSkin, activeAccent, appearance]);

  const toSettings = () => {
    if (view === 'settings') setView(lastTab.current);
    else setView('settings');
  };
  const goTab = (t: Tab) => {
    lastTab.current = t;
    setView(t);
  };

  return (
    <div className="app">
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
