import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { useWakeLock } from '../lib/useWakeLock';
import { EmojiPicker } from '../components/EmojiPicker';
import type { LiveData } from '../lib/liveData';
import type { ClockState } from '../lib/clockLogic';
import type { MomentVotes } from '../lib/liveSession';
import { secondsLeft } from '../lib/clockLogic';

/**
 * A guest's own phone.
 *
 * Two problems, one screen. The host used to type six names into their phone while
 * six people watched, and everybody else spent the night asking "what are the
 * blinds?" and "how much do I have?". Scan the code on the TV, put your own name
 * in, and the table is on your phone — read-only, because a guest changing the
 * ledger is a different app entirely.
 */
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function GuestView({ onLeave }: { onLeave: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const code = state.settings.liveSessionCode ?? '';
  const [data, setData] = useState<LiveData | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [name, setName] = useState(state.settings.guestName ?? '');
  const [emoji, setEmoji] = useState(state.settings.guestEmoji ?? '🙂');
  const [pickEmoji, setPickEmoji] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  /** the host's screen ended the night — the table is gone, not merely quiet */
  const [ended, setEnded] = useState(false);
  const [votes, setVotes] = useState<MomentVotes>({});
  const [, setTick] = useState(0);
  useWakeLock(true);

  const unsub = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    void import('../lib/liveSession').then(({ subscribeSession }) => {
      if (!alive) return;
      unsub.current = subscribeSession(
        code,
        (docData) => {
          setData(docData.data ?? null);
          // never overwrite a good clock with an absent one — a host-merged document
          // can exist without it (see the crash note in HANDOFF)
          if (docData.clock) setClock(docData.clock);
        },
        () => {
          /* the view simply keeps showing the last thing it saw */
        },
        // the big screen ended the night: say so instead of leaving a frozen table
        // on the guest's phone looking like it is still being played
        () => setEnded(true),
      );
    }).catch(() => {
      /* offline before the live-sync chunk was ever cached — the empty-table
         message below is what the guest sees, and a reconnect retries. */
    });
    return () => {
      alive = false;
      unsub.current?.();
    };
  }, [code]);

  // the hand-of-the-night vote lives in its own document, like the joins
  useEffect(() => {
    if (!code) return;
    let alive = true;
    let stop: (() => void) | null = null;
    void import('../lib/liveSession')
      .then(({ subscribeVotes }) => {
        if (!alive) return;
        stop = subscribeVotes(code, setVotes);
      })
      .catch(() => {
        /* no vote counts rather than a crashed screen */
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, [code]);

  // the countdown is owned by the TV; this just re-renders so it appears to run
  useEffect(() => {
    const h = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(h);
  }, []);

  const cur = data?.currency ?? state.settings.currency;
  const unit = data?.unitValue ?? state.settings.unitValue;

  /** The row that is probably this guest — matched on the name they sent. */
  const me = useMemo(() => {
    const n = name.trim().toLowerCase();
    if (!n || !data) return null;
    return data.ledger.find((p) => (p.name || '').trim().toLowerCase() === n) ?? null;
  }, [data, name]);

  const level = clock ? data?.session.blindLevels[Math.min(clock.levelIdx, data.session.blindLevels.length - 1)] : null;
  const seconds = clock ? secondsLeft(clock) : 0;

  /* A request that never left the phone must not read as one the host is sitting on:
     "Sent — you'll appear once the host seats you" is the most misleading thing this
     screen can say while the write is actually failing. */
  const send = () => {
    const clean = name.trim();
    if (!clean || !code) return;
    dispatch({ type: 'UPDATE_SETTINGS', patch: { guestName: clean, guestEmoji: emoji } });
    setSendErr(null);
    setSent(true);
    void import('../lib/liveSession')
      .then(({ requestSeat }) => requestSeat(code, clean, emoji))
      .catch(() => {
        setSent(false);
        setSendErr(t('connect.error'));
      });
  };

  return (
    <div className="app guest">
      <header className="app-header">
        <span className="wordmark">
          Chip<b>Stack</b>
        </span>
        <span className="header-sub">{t('guest.watching')}</span>
      </header>

      <main className="screen is-active">
        <div>
          <div className="section-label">
            {t('guest.title', { code })}
            <span className="hint">{t('guest.readOnly')}</span>
          </div>

          {ended && <div className="card"><div className="empty">{t('guest.ended')}</div></div>}

          {/* Who am I — the only thing a guest can actually do */}
          <div className="card">
            {me ? (
              <div className="guest-me">
                <span className="guest-me-emoji">{me.emoji || emoji}</span>
                <div>
                  <div className="guest-me-name">{me.name}</div>
                  <div className="faint" style={{ fontSize: 12.5 }}>{t('guest.seated')}</div>
                </div>
                <div className="spacer" />
                <div className="guest-me-stack">
                  <span className="k">{t('guest.yourStack')}</span>
                  <b>{money((me.chips || 0) * unit, cur)}</b>
                </div>
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <button className="pp-emoji" onClick={() => setPickEmoji((v) => !v)} aria-label={t('roster.avatar')}>
                    {emoji}
                  </button>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={name}
                    placeholder={t('guest.yourName')}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSent(false);
                      setSendErr(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                  />
                </div>
                {pickEmoji && (
                  <EmojiPicker
                    value={emoji}
                    onPick={(e) => {
                      setEmoji(e || '🙂');
                      setPickEmoji(false);
                    }}
                  />
                )}
                <button className="btn btn-primary btn-block mt12" onClick={send} disabled={!name.trim()}>
                  {sent ? t('guest.joinAgain') : t('guest.join')}
                </button>
                {sent && (
                  <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>
                    {t('guest.waiting', { name: name.trim() })}
                  </p>
                )}
                {sendErr && (
                  <p style={{ color: 'var(--bad)', fontSize: 12.5, textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
                    {sendErr}
                  </p>
                )}
              </>
            )}
          </div>

          {/* The table, as it stands */}
          {!data ? (
            <div className="card">
              <div className="empty">{t('guest.noData')}</div>
            </div>
          ) : (
            <>
              <div className="card guest-clock">
                <div className="guest-level">{t('guest.level', { n: (clock?.levelIdx ?? 0) + 1 })}</div>
                <div className="guest-blinds">{level ? `${num(level.smallBlind)} / ${num(level.bigBlind)}` : '—'}</div>
                {clock && <div className="guest-time">{fmtTime(seconds)}</div>}
              </div>

              <div className="section-label">{t('guest.players')}</div>
              <div className="card">
                {data.ledger.map((p) => (
                  <div className={`guest-row ${p.out ? 'is-out' : ''}`} key={p.id}>
                    <span className="guest-row-emoji">{p.emoji || '🙂'}</span>
                    <span className="guest-row-name">{p.name || 'Player'}</span>
                    <span className="guest-row-stack">{p.out ? '—' : money((p.chips || 0) * unit, cur)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* The one other thing a guest gets to do: decide which hand was the best.
              The host logs the moments, the table votes. */}
          {data && (data.moments ?? []).length > 0 && (
            <>
              <div className="section-label">
                {t('vote.title')}
                <span className="hint">{name.trim() ? t('vote.hint') : t('vote.needName')}</span>
              </div>
              <div className="card">
                {(data.moments ?? []).map((m) => {
                  const voters = votes[m.id] ?? [];
                  const mine = voters.some((v) => v.trim().toLowerCase() === name.trim().toLowerCase());
                  return (
                    <button
                      key={m.id}
                      className={`vote-row ${mine ? 'mine' : ''}`}
                      disabled={!name.trim()}
                      onClick={() =>
                        void import('../lib/liveSession')
                          .then(({ castVote }) => castVote(code, m.id, name.trim()))
                          // the count simply doesn't move; tapping again retries
                          .catch(() => {})
                      }
                    >
                      <span className="vote-txt">{m.text}</span>
                      {voters.length > 0 && <span className="vote-count">{voters.length}</span>}
                      {mine && <span className="vote-mine">{t('vote.yours')}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 16 }} onClick={onLeave}>
            {t('guest.leave')}
          </button>
        </div>
      </main>
    </div>
  );
}
