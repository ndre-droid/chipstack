import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import PlanScreen from './screens/PlanScreen';
import ChipsScreen from './screens/ChipsScreen';
import TableScreen from './screens/TableScreen';
import CashScreen from './screens/CashScreen';
import SettingsScreen from './screens/SettingsScreen';
import { IconPlan, IconChips, IconTable, IconCash, IconSettings } from './components/Icons';

type Tab = 'plan' | 'chips' | 'table' | 'cash';
type View = Tab | 'settings';

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: 'plan', label: 'Plan', icon: IconPlan },
  { id: 'chips', label: 'Chips', icon: IconChips },
  { id: 'table', label: 'Table', icon: IconTable },
  { id: 'cash', label: 'Cash', icon: IconCash },
];

const HEADER_SUB: Record<View, string> = {
  plan: 'Session',
  chips: 'Inventory',
  table: 'At the table',
  cash: 'Settle up',
  settings: 'Settings',
};

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
          aria-label="Settings"
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
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`nav-item ${view === t.id ? 'active' : ''}`} onClick={() => goTab(t.id)}>
              <Icon size={22} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
