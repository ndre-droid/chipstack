import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';

const LEN = 4;
const HEARTBEAT_STALE_MS = 30000; // TV beats every ~12s; allow one miss before "offline"

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

  const connected = liveSessionRole === 'host' && !!liveSessionCode;

  // --- Live TV status (heartbeat) + manual push ---
  const [tvSeen, setTvSeen] = useState(false); // has the TV beat at least once?
  const [online, setOnline] = useState(false); // beat recently enough to be "live"?
  const [pushState, setPushState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const lastBeatAt = useRef(0);
  const prevSeenVal = useRef(0);
  const pushTimer = useRef<number | null>(null);
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
      unsub = subscribeSession(liveSessionCode, (doc) => {
        const ms = doc.tvSeenAt?.toMillis?.() ?? 0;
        if (ms && ms !== prevSeenVal.current) {
          prevSeenVal.current = ms;
          lastBeatAt.current = Date.now(); // record against the local clock (skew-free)
          setTvSeen(true);
          setOnline(true);
        }
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [connected, liveSessionCode]);

  // Re-evaluate liveness on a timer so a silent TV drop flips us to "offline".
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => {
      setOnline(lastBeatAt.current > 0 && Date.now() - lastBeatAt.current < HEARTBEAT_STALE_MS);
    }, 5000);
    return () => window.clearInterval(id);
  }, [connected]);

  useEffect(() => () => { if (pushTimer.current) window.clearTimeout(pushTimer.current); }, []);

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
  // change; this is the recovery path if a write was dropped while the TV blipped.
  const pushNow = () => {
    if (!liveSessionCode) return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    setPushState('sending');
    import('../lib/liveSession')
      .then(({ hostPushData }) => hostPushData(liveSessionCode, stateRef.current))
      .then(() => {
        setPushState('sent');
        pushTimer.current = window.setTimeout(() => setPushState('idle'), 2000);
      })
      .catch(() => {
        setPushState('error');
        pushTimer.current = window.setTimeout(() => setPushState('idle'), 3500);
      });
  };

  const statusLabel = online ? t('connect.tvLive') : tvSeen ? t('connect.tvOffline') : t('connect.waitingTv');

  return (
    <>
      <div className="section-label">
        {t('connect.title')}
        {connected && <span className="hint">{t('tv.liveConnected')}</span>}
      </div>
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
            <button
              className={`btn btn-block mt12 ${pushState === 'error' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={pushNow}
              disabled={pushState === 'sending'}
            >
              {pushState === 'sending'
                ? t('table.sending')
                : pushState === 'sent'
                  ? t('table.sent')
                  : pushState === 'error'
                    ? t('table.syncError')
                    : t('connect.pushNow')}
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
                  aria-label={`Code digit ${i + 1}`}
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
    </>
  );
}
