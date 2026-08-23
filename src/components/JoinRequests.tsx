import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { JoinRequest } from '../lib/liveSession';

/**
 * People who scanned the code on the TV and put their own name in.
 *
 * The host used to type six names into a phone while six people watched. Now they
 * type their own and this card is the only thing the host touches — one tap to seat
 * somebody, one to wave them off.
 */
export default function JoinRequests() {
  const { state, dispatch } = useStore();
  const t = useT();
  const code = state.settings.liveSessionCode;
  const hosting = firebaseConfigured && state.settings.liveSessionRole === 'host' && !!code;
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  useEffect(() => {
    if (!hosting || !code) {
      setRequests([]);
      return;
    }
    let alive = true;
    let stop: (() => void) | null = null;
    void import('../lib/liveSession')
      .then(({ subscribeJoins }) => {
        if (!alive) return;
        stop = subscribeJoins(code, setRequests);
      })
      .catch(() => {
        /* the live-sync chunk is loaded on demand and deliberately not precached
           (see vite.config), so an offline phone can fail to load it. The effect
           runs again on the next mount; nothing here to recover. */
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, [hosting, code]);

  // a phone buzzing when somebody joins is the cue to look at the screen
  const count = requests.length;
  useEffect(() => {
    if (count > 0) haptic(14);
  }, [count]);

  if (!hosting || requests.length === 0) return null;

  const done = (id: string) => {
    // the request stays in the list if this fails — tapping again retries it
    if (code) void import('../lib/liveSession').then(({ clearJoin }) => clearJoin(code, id)).catch(() => {});
  };

  /** Already at the table under that name? Then this is a duplicate, not a new seat. */
  const seated = (name: string) =>
    state.ledger.some((p) => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <>
      <div className="section-label">
        {t('joins.title')}
        <span className="hint">{t('joins.hint')}</span>
      </div>
      <div className="card join-card">
        {requests.map((r) => (
          <div className="join-row" key={r.id}>
            <span className="join-emoji">{r.emoji || '🙂'}</span>
            <span className="join-name">{r.name}</span>
            {seated(r.name) ? (
              <span className="join-tag">{t('people.seated')}</span>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  dispatch({ type: 'LEDGER_ADD', name: r.name, emoji: r.emoji });
                  done(r.id);
                }}
              >
                {t('joins.seat')}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => done(r.id)}>
              {t('joins.dismiss')}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
