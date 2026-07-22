import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import PlanScreen from './screens/PlanScreen';
import ChipsScreen from './screens/ChipsScreen';
import TableScreen from './screens/TableScreen';
import CashScreen from './screens/CashScreen';
import SettingsScreen from './screens/SettingsScreen';
import { IconPlan, IconChips, IconTable, IconCash, IconSettings } from './components/Icons';

type Tab = 'plan' | 'chips' | 'table' | 'cash' | 'settings';

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: 'plan', label: 'Plan', icon: IconPlan },
  { id: 'chips', label: 'Chips', icon: IconChips },
  { id: 'table', label: 'Table', icon: IconTable },
  { id: 'cash', label: 'Cash', icon: IconCash },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

const HEADER_SUB: Record<Tab, string> = {
  plan: 'Session',
  chips: 'Inventory',
  table: 'At the table',
  cash: 'Settle up',
  settings: 'Preferences',
};

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="47" fill="#191922" stroke="#e4b41f" strokeWidth="4" />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <rect
            key={i}
            x={50 + Math.cos(a) * 40 - 5}
            y={50 + Math.sin(a) * 40 - 3}
            width="10"
            height="6"
            rx="3"
            fill="#e4b41f"
            transform={`rotate(${(i / 6) * 360} ${50 + Math.cos(a) * 40} ${50 + Math.sin(a) * 40})`}
          />
        );
      })}
      <polygon points="50,25 71,37 71,63 50,75 29,63 29,37" fill="none" stroke="#e4b41f" strokeWidth="3" />
      <text x="50" y="57" textAnchor="middle" fill="#f0cb54" fontSize="26" fontWeight="800" fontFamily="Inter, sans-serif">
        ♣
      </text>
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
  const [tab, setTab] = useState<Tab>('plan');
  const { state } = useStore();
  const theme = state.settings.theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <div className="app">
        <header className="app-header">
          <LogoMark />
          <span className="wordmark">
            Chip<b>Stack</b>
          </span>
          <span className="header-sub">{HEADER_SUB[tab]}</span>
        </header>

        <main className="screen" key={tab}>
          {tab === 'plan' && <PlanScreen />}
          {tab === 'chips' && <ChipsScreen />}
          {tab === 'table' && <TableScreen />}
          {tab === 'cash' && <CashScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </main>

        <nav className="bottom-nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                <Icon size={24} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
