import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import { initialClock } from '../lib/clockLogic';

/**
 * Live Session start/stop + the big code to type on the TV — lives right on the
 * Table tab (the natural place to run the game), not buried in Settings. When
 * hosting, shows the code prominently above the remote clock; otherwise a single
 * Start button.
 */
export default function LiveSessionControl() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { settings } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startLive = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { hostCreate, genCode } = await import('../lib/liveSession');
      const code = genCode();
      await hostCreate(code, state, initialClock(settings.minutesPerLevel));
      dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: code, liveSessionRole: 'host' } });
    } catch {
      setErr(t('settings.liveError'));
    } finally {
      setBusy(false);
    }
  };
  const stopLive = () => dispatch({ type: 'UPDATE_SETTINGS', patch: { liveSessionCode: null, liveSessionRole: null } });

  if (!firebaseConfigured) return null;

  const isHost = settings.liveSessionRole === 'host' && !!settings.liveSessionCode;

  return (
    <>
      <div className="section-label">
        {t('settings.liveSession')}
        {isHost && <span className="hint">{t('tv.liveConnected')}</span>}
      </div>
      <div className="card">
        {isHost ? (
          <>
            <p className="faint" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.5 }}>{t('settings.liveCodeHint')}</p>
            <div className="live-code-big">{settings.liveSessionCode}</div>
            <button className="btn btn-ghost btn-block btn-sm mt12" onClick={stopLive}>{t('settings.stopLive')}</button>
          </>
        ) : (
          <>
            <p className="faint" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>{t('settings.liveSessionDesc')}</p>
            {err && <p style={{ color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' }}>{err}</p>}
            <button className="btn btn-primary btn-block" onClick={startLive} disabled={busy}>
              {busy ? t('settings.liveConnecting') : t('settings.startLive')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
