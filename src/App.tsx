import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import PlanScreen from './screens/PlanScreen';
import ChipsScreen from './screens/ChipsScreen';
import TableScreen from './screens/TableScreen';
import CashScreen from './screens/CashScreen';
import SettingsScreen from './screens/SettingsScreen';
import TvMode from './screens/TvMode';
import { firebaseConfigured } from './lib/firebaseConfig';
import { IconPlan, IconChips, IconTable, IconCash, IconSettings } from './components/Icons';
import { useT } from './lib/i18n';
import { useLiveHostSync } from './lib/useLiveHostSync';
import { useNativeDeepLink, appSchemeUrl } from './lib/deepLink';
import { customAccentVars } from './lib/color';
import { runBackHandlers } from './lib/backHandler';
import { isNative } from './lib/platform';
import Onboarding from './components/Onboarding';
import GuestView from './screens/GuestView';

type Tab = 'plan' | 'chips' | 'table' | 'cash';
type View = Tab | 'settings';

const TABS: { id: Tab; key: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: 'plan', key: 'nav.plan', icon: IconPlan },
  { id: 'chips', key: 'nav.chips', icon: IconChips },
  { id: 'table', key: 'nav.table', icon: IconTable },
  { id: 'cash', key: 'nav.cash', icon: IconCash },
];

const VIEWS: View[] = ['plan', 'chips', 'table', 'cash', 'settings'];
const VIEW_KEY = 'chipstack.view';

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

/** The tab this device was last on — unlocking the phone mid-game should not land
 *  on the planning screen two taps away from the table. */
const storedView = (): Tab | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v && v !== 'settings' && VIEWS.includes(v as View) ? (v as Tab) : null;
  } catch {
    return null;
  }
};

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}

function AppShell() {
  const { state, dispatch } = useStore();
  const [view, setView] = useState<View>(() => storedView() ?? (state.ledger.length > 0 ? 'table' : 'plan'));
  const lastTab = useRef<Tab>(view === 'settings' ? 'plan' : view);
  const { skin, accents, appearance, deviceIsTv, customAccent, liveSessionCode, liveSessionRole } = state.settings;
  const activeSkin = skin ?? 'minimal';
  const activeAccent = accents?.[activeSkin] ?? 'amber';
  const t = useT();
  useLiveHostSync();

  /* A scanned code no longer means "take over the table". One person is running the
     game and everybody else is a player, so the code asks which one this phone is —
     otherwise every guest who scanned the TV became a second host. */
  const [pendingCode, setPendingCode] = useState<string | null>(initialTvCode);
  const connectAsHost = (code: string) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'host', deviceIsTv: false } });
  const connectAsGuest = (code: string) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'guest', deviceIsTv: false } });
  // Native app: opened via chipstack://tv/NNNN (or the https App Link).
  useNativeDeepLink(setPendingCode);

  // On the WEB, a phone that scanned the QR can hand off into the installed app.
  const isAndroidWeb = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [openAppBar, setOpenAppBar] = useState(!!initialTvCode && isAndroidWeb);
  const [toast, setToast] = useState<string | null>(null);

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
    const url = window.location.origin + window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', url);
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

  /* Keep <html lang> honest: it drives how a screen reader pronounces the page and
     how the browser hyphenates it, and the app ships German text under lang="en"
     otherwise. */
  useEffect(() => {
    document.documentElement.lang = state.settings.language ?? 'en';
  }, [state.settings.language]);

  /* Every screen stays mounted once it has been opened, so switching tabs no longer
     throws away what you were doing — a half-open disclosure, the pins in the
     fine-tune editor, an inline editor mid-edit. `display:none` does drop the
     scroll offset, so it is saved and restored by hand here. */
  const [visited, setVisited] = useState<View[]>([view]);
  const scrollRefs = useRef<Partial<Record<View, HTMLElement | null>>>({});
  const scrollTops = useRef<Partial<Record<View, number>>>({});

  // Recorded as it happens, NOT when the tab changes: `display: none` has already
  // zeroed scrollTop by the time an effect could read it back.
  const rememberScroll = (v: View, el: HTMLElement) => {
    scrollTops.current[v] = el.scrollTop;
  };

  useLayoutEffect(() => {
    const entering = scrollRefs.current[view];
    if (entering) entering.scrollTop = scrollTops.current[view] ?? 0;
  }, [view]);

  const go = useCallback((next: View) => {
    setVisited((v) => (v.includes(next) ? v : [...v, next]));
    setView(next);
    if (next !== 'settings') {
      lastTab.current = next;
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* private mode — the tab just won't be remembered */
      }
    }
  }, []);

  const toSettings = () => go(view === 'settings' ? lastTab.current : 'settings');
  const goTab = (tab: Tab) => go(tab);

  /* ---------------------------------------------------------------
     Android back button. Order: close whatever is on top (sheets and
     dialogs register themselves via useBackHandler), then leave the
     settings screen, then press again to exit. Without this, back
     closed the whole app from anywhere — including with a sheet open.
     --------------------------------------------------------------- */
  const exitArmed = useRef(0);
  const onBack = useCallback((): 'handled' | 'exit' => {
    if (runBackHandlers()) return 'handled';
    if (view === 'settings') {
      go(lastTab.current);
      return 'handled';
    }
    if (Date.now() - exitArmed.current < 2500) return 'exit';
    exitArmed.current = Date.now();
    setToast(t('app.backAgainToExit'));
    window.setTimeout(() => setToast(null), 2500);
    return 'handled';
  }, [view, go, t]);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (isNative()) {
      let remove: (() => void) | undefined;
      import('@capacitor/app')
        .then(({ App: CapApp }) =>
          CapApp.addListener('backButton', () => {
            if (onBackRef.current() === 'exit') void CapApp.exitApp();
          }),
        )
        .then((handle) => {
          remove = () => void handle.remove();
        })
        .catch(() => {
          /* not running natively after all */
        });
      return () => remove?.();
    }
    // Web / installed PWA: keep one spare history entry to consume. When nothing
    // wants the press we let it through, and the NEXT press really does leave.
    const guard = { chipstack: true };
    window.history.pushState(guard, '');
    const onPop = () => {
      if (onBackRef.current() !== 'exit') window.history.pushState(guard, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* Nothing has ever been set up here: ask the three questions that actually
     determine the answer, instead of opening on a full tournament console. */
  if (state.settings.onboardedAt === null && !deviceIsTv) {
    return <Onboarding onDone={() => go(state.ledger.length > 0 ? 'table' : 'plan')} />;
  }

  /* This phone belongs to somebody who is just playing: their own read-only view of
     the table, and the one thing they can do — put their name in. */
  if (liveSessionRole === 'guest' && liveSessionCode && !deviceIsTv) {
    return (
      <GuestView
        onLeave={() =>
          dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionRole: null, liveSessionCode: null } })
        }
      />
    );
  }

  if (pendingCode && liveSessionCode !== pendingCode && !deviceIsTv) {
    return (
      <RoleChoice
        code={pendingCode}
        onHost={() => {
          connectAsHost(pendingCode);
          setPendingCode(null);
        }}
        onGuest={() => {
          connectAsGuest(pendingCode);
          setPendingCode(null);
        }}
        onCancel={() => setPendingCode(null)}
      />
    );
  }

  // This device is the designated TV: boot straight into the big screen. Exiting
  // clears the flag (and any live session) and returns to the normal phone app.
  if (deviceIsTv) {
    return (
      <TvMode
        onClose={() => {
          // The pairing code is public and guessable, so the document goes when the
          // big screen does instead of lingering until the TTL sweep finds it.
          const code = liveSessionRole === 'tv' ? liveSessionCode : null;
          if (code && firebaseConfigured) {
            import('./lib/liveSession')
              .then(({ endSession }) => endSession(code))
              .catch(() => {
                /* offline — the TTL policy cleans it up */
              });
          }
          dispatch({ type: 'UPDATE_SETTINGS', patch: { deviceIsTv: false, liveSessionRole: null, liveSessionCode: null } });
        }}
      />
    );
  }

  const SCREENS: Record<View, React.ReactNode> = {
    plan: <PlanScreen />,
    chips: <ChipsScreen />,
    table: <TableScreen />,
    cash: <CashScreen />,
    settings: <SettingsScreen />,
  };

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

      {visited.map((v) => (
        <main
          key={v}
          className={`screen ${v === view ? 'is-active' : ''}`}
          ref={(el) => {
            scrollRefs.current[v] = el;
          }}
          onScroll={(e) => rememberScroll(v, e.currentTarget)}
          aria-hidden={v !== view}
        >
          {SCREENS[v]}
        </main>
      ))}

      {toast && <div className="snackbar app-toast">{toast}</div>}

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

/**
 * Which phone is this? Shown once, right after a code is scanned or typed.
 *
 * The old flow made every scanner the host, which is fine for the one person
 * running the night and wrong for the five who are only playing.
 */
function RoleChoice({
  code,
  onHost,
  onGuest,
  onCancel,
}: {
  code: string;
  onHost: () => void;
  onGuest: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="onb role-choice">
      <div className="onb-top">
        <span className="onb-step">{t('guest.chooseSub', { code })}</span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>{t('onboard.skip')}</button>
      </div>
      <div className="onb-body">
        <h2 className="onb-h">{t('guest.choose')}</h2>
        <button className="role-opt" onClick={onGuest}>
          <span className="role-opt-ic">🪑</span>
          <span>
            <b>{t('guest.beGuest')}</b>
            <i>{t('guest.beGuestSub')}</i>
          </span>
        </button>
        <button className="role-opt" onClick={onHost}>
          <span className="role-opt-ic">🎛️</span>
          <span>
            <b>{t('guest.beHost')}</b>
            <i>{t('guest.beHostSub')}</i>
          </span>
        </button>
      </div>
    </div>
  );
}
