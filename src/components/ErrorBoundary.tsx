import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { translate, type Lang } from '../lib/i18n';
import { buildBackup, downloadBackup } from '../lib/backup';
import { parkState, readRawState } from '../lib/stateKey';
import type { AppState } from '../types';

/**
 * The last thing between a thrown render and a white screen.
 *
 * The app is a single-page PWA that is used with the phone on the felt and eight
 * people waiting: a crash that leaves nothing but white is not a bug report, it is a
 * ruined night. Worse, the service worker means "reload" hands the SAME build back,
 * so an app that cannot render its saved state cannot be reloaded out of it either —
 * that is exactly how a malformed record black-screened the app once already (fixed
 * in `c9f8540`; this is the net under the next one).
 *
 * So the fallback is not an apology, it is four ways out, cheapest first:
 *   1. try again        — a render that threw once on a transient value may not again
 *   2. reload           — same build, fresh boot
 *   3. update           — drop the service worker + caches, so a FIXED build can land
 *   4. save, then reset — park the unloadable state under a crash key and start clean
 *
 * Deliberately dependency-light. It reads the language out of `localStorage` and calls
 * the pure `translate()` rather than `useT()`, and it addresses the stored state
 * through `lib/stateKey` rather than the store — everything it touches has to keep
 * working when the store is the thing that is broken.
 *
 * What it does NOT catch: throws from event handlers, timers and promises, which React
 * never routes to a boundary. Those surface in the console, and the app usually keeps
 * standing.
 */

function detectLang(): Lang {
  // The store may be unreadable — that is why we are here. Try it, then the phone.
  try {
    const raw = readRawState();
    if (raw) {
      const parsed = JSON.parse(raw) as { settings?: { language?: string } };
      const l = parsed?.settings?.language;
      if (l === 'de' || l === 'en') return l;
    }
  } catch {
    /* fall through to the phone's own language */
  }
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs.some((l) => /^de/i.test(l ?? '')) ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

/** Drop the service worker and every cache, then reload — the only way a fixed build
 *  can reach a device whose cached build is the broken one. Needs the network once. */
async function updateApp(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* no service worker, or a browser that will not say — reload anyway */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* the Cache API is not available here; the unregister above is the real fix */
  }
  location.reload();
}

interface Props {
  children: ReactNode;
  /** A boundary INSIDE the app (the big screen): show a small card, not a full page. */
  compact?: boolean;
  /** Compact boundaries offer a way back out instead of a reload. */
  onDismiss?: () => void;
  /** Names the surface in the crash report, e.g. 'tv'. */
  where?: string;
}

interface State {
  error: Error | null;
  stack: string | null;
  /** How many times this boundary has caught. After a few, "try again" is a lie. */
  crashes: number;
  saved: 'idle' | 'ok' | 'failed';
  /** "Start fresh" is destructive, so it arms on the first tap and fires on the second. */
  armed: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null, crashes: 0, saved: 'idle', armed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No crash reporter in this app by design (no accounts, no network requirement),
    // so the console IS the report — and it is what a connected laptop can read off a
    // TV that has no devtools of its own.
    console.error(`[ChipStack] crash${this.props.where ? ` in ${this.props.where}` : ''}`, error, info.componentStack);
    this.setState((s) => ({ stack: info.componentStack ?? null, crashes: s.crashes + 1 }));
  }

  private retry = () => this.setState({ error: null, stack: null, saved: 'idle', armed: false });

  private save = () => {
    const raw = readRawState();
    // The state is exported as it is FOUND, not as it parses: a file that round-trips
    // the bytes is worth more than one that refuses to be written because the content
    // is the problem. `buildBackup` only wraps it.
    let parsed: AppState | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      this.setState({ saved: 'failed' });
      return;
    }
    void buildBackup(parsed)
      .then((b) => this.setState({ saved: downloadBackup(b) ? 'ok' : 'failed' }))
      .catch(() => this.setState({ saved: 'failed' }));
  };

  private startFresh = () => {
    if (!this.state.armed) {
      this.setState({ armed: true });
      return;
    }
    parkState();
    location.reload();
  };

  render() {
    const { error, stack, crashes, saved, armed } = this.state;
    if (!error) return this.props.children;

    const lang = detectLang();
    const t = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
    const detail = [error.message || String(error), stack].filter(Boolean).join('\n');

    if (this.props.compact) {
      return (
        <div className="crash crash-compact" role="alert">
          <h2 className="crash-title">{t('crash.compactTitle')}</h2>
          <p className="crash-body">{t('crash.compactBody')}</p>
          <div className="crash-actions">
            <button className="btn btn-ghost" onClick={this.retry}>{t('crash.retry')}</button>
            {this.props.onDismiss && (
              <button className="btn btn-primary" onClick={this.props.onDismiss}>{t('crash.back')}</button>
            )}
          </div>
          <details className="crash-details">
            <summary>{t('crash.details')}</summary>
            <pre>{detail}</pre>
          </details>
        </div>
      );
    }

    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <h1 className="crash-title">{t('crash.title')}</h1>
          <p className="crash-body">{t('crash.body')}</p>

          <div className="crash-actions">
            {crashes < 3 && (
              <button className="btn btn-ghost" onClick={this.retry}>{t('crash.retry')}</button>
            )}
            <button className="btn btn-ghost" onClick={() => location.reload()}>{t('crash.reload')}</button>
            <button className="btn btn-ghost" onClick={() => void updateApp()}>{t('crash.update')}</button>
          </div>
          <p className="crash-hint">{t('crash.updateHint')}</p>

          <hr className="crash-rule" />

          <p className="crash-body">{t('crash.stillBroken')}</p>
          <div className="crash-actions">
            <button className="btn btn-primary" onClick={this.save}>{t('crash.save')}</button>
            <button className={`btn btn-ghost${armed ? ' crash-danger' : ''}`} onClick={this.startFresh}>
              {armed ? t('crash.freshConfirm') : t('crash.fresh')}
            </button>
          </div>
          {saved === 'ok' && <p className="crash-hint good">{t('crash.saved')}</p>}
          {saved === 'failed' && <p className="crash-hint bad">{t('crash.saveFailed')}</p>}
          <p className="crash-hint">{t('crash.freshHint')}</p>

          <details className="crash-details">
            <summary>{t('crash.details')}</summary>
            <pre>{detail}</pre>
          </details>
        </div>
      </div>
    );
  }
}
