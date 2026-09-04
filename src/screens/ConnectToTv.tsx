import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { IconChevron } from '../components/Icons';
import { firebaseConfigured } from '../lib/firebaseConfig';
import { useLiveSyncStatus } from '../lib/useLiveHostSync';
import { flushLiveSync, queueData } from '../lib/liveSyncQueue';
import type { Unsubscribe } from 'firebase/firestore';

const LEN = 4;
/* The TV beats every 25s (see TvMode). This has to allow TWO missed beats plus the
   5s granularity of the check below, or a perfectly healthy TV is declared offline
   between two beats — which is what a 30s window did after the beat interval was
   slowed from 12s to 25s. */
const HEARTBEAT_STALE_MS = 70000;

/**
 * Phone side of the live link, on the Table tab. The TV shows a short code; you
 * type it here and this phone becomes the host — it pushes all its data to the TV
 * and the remote panel below takes over the clock. No hosting/generating on the
 * phone: the TV owns the session, the phone just connects to it.
 *
 * Once connected this card is also the live-status home: it shows whether the TV
 * is actually alive (via its heartbeat) and gives a one-tap "Push to TV" recovery
 * for the rare dropped auto-sync — the phone can't reload inside the installed app.
 */
export default function ConnectToTv() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  /* Folded away until it is asked for. A code is typed once a night at most, and
     four empty boxes plus the paragraph explaining them were the first third of the
     Table tab every single night — above the people actually playing. A CONNECTED
     session is a different card: that one is the live status and stays open. */
  const [open, setOpen] = useState(false);

  const connected = liveSessionRole === 'host' && !!liveSessionCode;

  // --- Live TV status (heartbeat) + manual push ---
  const [tvSeen, setTvSeen] = useState(false); // has the TV beat at least once?
  const [online, setOnline] = useState(false); // beat recently enough to be "live"?
  const sync = useLiveSyncStatus(); // is everything this phone changed actually up there?
  const lastBeatAt = useRef(0);
  const prevSeenVal = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Subscribe to the session while connected, purely to watch the TV's heartbeat.
  useEffect(() => {
    if (!firebaseConfigured || !connected || !liveSessionCode) {
      setTvSeen(false);
      setOnline(false);
      return;
    }
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(
        liveSessionCode,
        (doc) => {
          const ms = doc.tvSeenAt?.toMillis?.() ?? 0;
          if (ms && ms !== prevSeenVal.current) {
            prevSeenVal.current = ms;
            lastBeatAt.current = Date.now(); // record against the local clock (skew-free)
            setTvSeen(true);
            setOnline(true);
          }
        },
        // A dropped listener means we stopped hearing the TV, not that the TV died.
        // Don't let a silent connection pass for a live one.
        (connected) => {
          if (!connected) setOnline(false);
        },
        /* The big screen was switched off and took the session with it. This phone
           used to sit on "● Live", fade to "TV offline" a minute later and go on
           heartbeating into a document that no longer existed — which, being a merge
           write, kept bringing it back. Say what happened and let go of the code. */
        () => {
          dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: null, liveSessionRole: null } });
          setErr(t('connect.ended'));
        },
      );
    }).catch(() => {
      /* the live-sync chunk is fetched on demand and deliberately not precached
         (see vite.config); offline it simply doesn't arrive. The card then shows
         "waiting for the TV", which is the truth. */
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // `dispatch` and `t` are stable for the life of the screen; re-subscribing on
    // every render of the Table tab would drop and re-open the listener constantly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, liveSessionCode]);

  // Re-evaluate liveness on a timer so a silent TV drop flips us to "offline".
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => {
      setOnline(lastBeatAt.current > 0 && Date.now() - lastBeatAt.current < HEARTBEAT_STALE_MS);
    }, 5000);
    return () => window.clearInterval(id);
  }, [connected]);

  /* "Synced" on its own is ambiguous: synced a second ago, or synced twenty minutes
     ago and nothing has moved since? The age answers it, and it needs its own slow
     tick because no store change fires while time simply passes. */
  const [ageTick, setAgeTick] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const h = window.setInterval(() => setAgeTick((n) => n + 1), 5000);
    return () => window.clearInterval(h);
  }, [connected]);
  void ageTick;

  /* Something has to be read — the code was wrong, or the big screen went away and
     took the session with it. A message inside a fold nobody opened is not a message. */
  useEffect(() => {
    if (err) setOpen(true);
  }, [err]);

  /* Opened by hand: the cursor belongs in the first box, not one tap further on. */
  useEffect(() => {
    if (open && !connected) inputs.current[0]?.focus();
  }, [open, connected]);

  if (!firebaseConfigured) return null;

  const code = digits.join('');

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1); // keep only the last typed digit
    setErr(null);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < LEN - 1) inputs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === 'Enter') {
      connect();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(LEN).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputs.current[Math.min(pasted.length, LEN - 1)]?.focus();
  };

  const connect = async () => {
    if (code.length < LEN) {
      setErr(t('connect.tooShort'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const { checkCodeExists } = await import('../lib/liveSession');
      const exists = await checkCodeExists(code);
      if (!exists) {
        setErr(t('connect.notFound'));
        return;
      }
      dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'host', deviceIsTv: false } });
      setDigits(Array(LEN).fill(''));
    } catch {
      setErr(t('connect.error'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: null, liveSessionRole: null } });


  // Force the full state to the TV right now. Auto-sync already does this on every
  // change and retries by itself; this jumps the backoff when the user is impatient.
  const pushNow = () => {
    if (!liveSessionCode) return;
    queueData(liveSessionCode, () => stateRef.current);
    flushLiveSync();
  };

  const statusLabel = online ? t('connect.tvLive') : tvSeen ? t('connect.tvOffline') : t('connect.waitingTv');

  const syncedAge = (() => {
    if (!sync.lastSyncedAt) return null;
    const secs = Math.max(0, Math.round((Date.now() - sync.lastSyncedAt) / 1000));
    return secs < 90 ? t('connect.syncAgo', { n: secs }) : t('connect.syncAgoMin', { n: Math.round(secs / 60) });
  })();

  // The outbound half of the link: the heartbeat above says the TV is there, this
  // says whether what you changed on the phone actually reached it.
  const stuck = sync.status === 'retrying';
  const syncTone = stuck ? (sync.online ? 'warn' : 'off') : sync.status === 'syncing' ? 'wait' : 'on';
  const syncLabel =
    sync.status === 'syncing'
      ? t('connect.syncSending')
      : stuck
        ? sync.online
          ? t('connect.syncRetrying', { n: sync.attempts })
          : t('connect.syncOffline')
        : sync.status === 'synced'
          ? t('connect.syncOk')
          : t('connect.syncIdle');

  return (
    <>
      {connected ? (
        <div className="section-label">
          {t('connect.title')}
          <span className="hint">{t('tv.liveConnected')}</span>
        </div>
      ) : (
        <button
          className="mins-toggle connect-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>
            📺 {t('connect.title')}
            <span className="hint" style={{ marginLeft: 8 }}>{t('connect.collapsedHint')}</span>
          </span>
          <span className={`chevron ${open ? 'rot90' : ''}`}>
            <IconChevron size={16} />
          </span>
        </button>
      )}
      {(connected || open) && (
      <div className="card">
        {connected ? (
          <>
            <div className="live-status">
              <span className={`live-dot ${online ? 'on' : tvSeen ? 'off' : 'wait'}`} />
              <div className="live-status-text">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{statusLabel}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {t('connect.code')} <b style={{ color: 'var(--acc)', letterSpacing: '0.12em' }}>{liveSessionCode}</b>
                </div>
              </div>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={disconnect}>{t('connect.disconnect')}</button>
            </div>
            <div className={`sync-line ${syncTone}`}>
              <span className={`sync-dot ${syncTone}`} />
              <span>{syncLabel}</span>
              {sync.status === 'synced' && syncedAge && <span className="sync-age">{syncedAge}</span>}
            </div>
            {stuck && sync.lastError && (
              // The reason, verbatim from the SDK. Unglamorous, but a stuck sync used
              // to say only "attempt 9" — with nothing to act on and nothing to report.
              <div className="sync-why">{sync.lastError}</div>
            )}
            <button
              className={`btn btn-block mt12 ${stuck ? 'btn-primary' : 'btn-ghost'}`}
              onClick={pushNow}
              // Only blocked during a HEALTHY send. While a push is stuck, the button
              // is the thing that rebuilds the connection — disabling it then is
              // exactly when the user needs it.
              disabled={sync.status === 'syncing' && sync.attempts === 0}
            >
              {sync.status === 'syncing' ? t('table.sending') : stuck ? t('connect.retryNow') : t('connect.pushNow')}
            </button>
            <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>{t('connect.pushHint')}</div>
          </>
        ) : (
          <>
            <p className="faint" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>{t('connect.desc')}</p>
            <div className="code-cells">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  className="code-cell"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={d}
                  disabled={busy}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={onPaste}
                  aria-label={t('connect.digitLabel', { n: i + 1 })}
                />
              ))}
            </div>
            {err && <p style={{ color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.5 }}>{err}</p>}
            <button className="btn btn-primary btn-block mt12" onClick={connect} disabled={busy || code.length < LEN}>
              {busy ? t('connect.connecting') : t('connect.button')}
            </button>
          </>
        )}
      </div>
      )}
    </>
  );
}
