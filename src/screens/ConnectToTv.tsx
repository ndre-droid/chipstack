import { useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';

const LEN = 4;

/**
 * Phone side of the live link, on the Table tab. The TV shows a short code; you
 * type it here and this phone becomes the host — it pushes all its data to the TV
 * and the remote panel below takes over the clock. No hosting/generating on the
 * phone: the TV owns the session, the phone just connects to it.
 */
export default function ConnectToTv() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { liveSessionCode, liveSessionRole } = state.settings;
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  if (!firebaseConfigured) return null;

  const connected = liveSessionRole === 'host' && !!liveSessionCode;
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

  return (
    <>
      <div className="section-label">
        {t('connect.title')}
        {connected && <span className="hint">{t('tv.liveConnected')}</span>}
      </div>
      <div className="card">
        {connected ? (
          <div className="row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('connect.controlling')}</div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {t('connect.code')} <b style={{ color: 'var(--acc)', letterSpacing: '0.12em' }}>{liveSessionCode}</b>
              </div>
            </div>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={disconnect}>{t('connect.disconnect')}</button>
          </div>
        ) : (
          <>
            <p className="faint" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>{t('connect.desc')}</p>
            <div className="code-boxes">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  className="code-box"
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
