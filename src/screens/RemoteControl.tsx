import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { fmtMoney } from '../lib/money';
import { firebaseConfigured } from '../lib/firebaseConfig';
import type { Unsubscribe } from 'firebase/firestore';
import { togglePlayPause, goLevel, startBreak, cancelBreak, secondsLeft, initialClock, setMinutesPerLevel } from '../lib/clockLogic';
import type { ClockState } from '../lib/clockLogic';
import { IconPlay, IconPause, IconChevron, IconPlus, IconTrash } from '../components/Icons';
import type { Skin, AccentId } from '../types';

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const TV_SKINS: { id: Skin | 'match'; key: string; name: string }[] = [
  { id: 'match', key: 'settings.matchPhone', name: 'Match phone' },
  { id: 'minimal', key: '', name: 'Minimal' },
  { id: 'casino', key: '', name: 'Casino' },
  { id: 'playful', key: '', name: 'Playful' },
  { id: 'scifi', key: '', name: 'Sci-Fi' },
];
const ACCENTS: { id: AccentId; color: string }[] = [
  { id: 'amber', color: '#f0b429' }, { id: 'gold', color: '#e6c878' },
  { id: 'emerald', color: '#34d399' }, { id: 'cyan', color: '#3fe6ff' },
  { id: 'cobalt', color: '#5aa0ff' }, { id: 'violet', color: '#b18cff' },
  { id: 'crimson', color: '#ff6b6b' }, { id: 'coral', color: '#ff7a4d' },
];

/**
 * The phone's remote, shown on the Table tab only while this phone is hosting a
 * Live Session. It is the full TV control panel: the clock, level length, blinds,
 * players & prize pool, the TV design (skin + accent) and TV toggles — everything
 * writes to the shared session, so the TV mirrors it instantly. This panel never
 * runs its own countdown; it derives from the shared deadline and sends commands.
 */
export default function RemoteControl() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { liveSessionCode, liveSessionRole, minutesPerLevel, currency, skin, tvSkin, accents, tvQuips, tvShowPlayers, tvShowPayouts, tvShowBustOrder, breakMinutes, breakEvery, tvCustomQuips } = state.settings;
  const { ledger, session } = state;
  const maxIdx = session.blindLevels.length - 1;

  const [clock, setClock] = useState<ClockState>(() => initialClock(minutesPerLevel));
  const [now, setNow] = useState(Date.now());
  const [showBlinds, setShowBlinds] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  const [showQuips, setShowQuips] = useState(false);
  const [newQuip, setNewQuip] = useState('');

  const active = firebaseConfigured && liveSessionRole === 'host' && !!liveSessionCode;

  useEffect(() => {
    if (!active || !liveSessionCode) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    import('../lib/liveSession').then(({ subscribeSession }) => {
      if (cancelled) return;
      unsub = subscribeSession(liveSessionCode, (doc) => setClock(doc.clock));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [active, liveSessionCode]);

  // local 1s tick purely to refresh the displayed countdown — never writes state
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active || !liveSessionCode) return null;

  const send = (next: ClockState) => {
    setClock(next); // optimistic
    import('../lib/liveSession').then(({ pushClock }) =>
      pushClock(liveSessionCode, next).catch(() => {
        /* the next command or the TV's own tick will reconcile */
      }),
    );
  };

  const setMinutes = (m: number) => {
    const n = Math.max(1, Math.min(180, m));
    dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: n } });
    send(setMinutesPerLevel(clock, n)); // reflect on the TV's current level immediately
  };

  const tvSkinKey: Skin = (tvSkin ?? 'match') === 'match' ? (skin ?? 'minimal') : (tvSkin as Skin);
  const currentAccent = accents?.[tvSkinKey] ?? 'amber';
  const setAccent = (id: AccentId) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { accents: { ...accents, [tvSkinKey]: id } } });

  void now; // triggers the re-render each second so secondsLeft() below is fresh

  const pool = ledger.reduce((s, p) => s + (p.buyIn || 0), 0);

  return (
    <>
      {/* --- Clock --- */}
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.remoteControl')}
        <span className="hint">{t('table.remoteHint')}</span>
      </div>
      <div className="card clock-card">
        <div className="clock-face">
          <div className="clock-level">{clock.onBreak ? t('tv.break') : t('table.remoteLevel', { n: clock.levelIdx + 1 })}</div>
          <div className={`clock-time ${clock.running && secondsLeft(clock) <= 30 ? 'urgent' : ''}`}>{fmtClock(secondsLeft(clock))}</div>
        </div>
        <div className="clock-controls">
          <button className="icon-btn" onClick={() => send(goLevel(clock, -1, maxIdx))} aria-label="Previous level">
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
              <IconChevron size={20} />
            </span>
          </button>
          <button className="clock-play" onClick={() => send(togglePlayPause(clock))}>
            {clock.running ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button className="icon-btn" onClick={() => send(goLevel(clock, 1, maxIdx))} aria-label="Next level">
            <IconChevron size={20} />
          </button>
          {clock.onBreak ? (
            <button className="btn btn-ghost btn-sm" onClick={() => send(cancelBreak(clock))}>{t('tv.cancelBreak')}</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => send(startBreak(clock, breakMinutes))}>{t('tv.break')}</button>
          )}
        </div>

        {/* Level length — fully adjustable from the phone */}
        <div className="clock-adjust">
          <button className="adj10" onClick={() => setMinutes(minutesPerLevel - 10)}>−10</button>
          <button className="adj1" onClick={() => setMinutes(minutesPerLevel - 1)}>−1</button>
          <div className="mpl-center">
            <b>{minutesPerLevel}</b>
            <small>{t('table.minPerLevel')}</small>
          </div>
          <button className="adj1" onClick={() => setMinutes(minutesPerLevel + 1)}>+1</button>
          <button className="adj10" onClick={() => setMinutes(minutesPerLevel + 10)}>+10</button>
        </div>

        {/* one-tap timer presets */}
        <div className="chip-toggle-row" style={{ marginTop: 10, justifyContent: 'center' }}>
          {[
            { label: t('table.turbo'), m: 10 },
            { label: t('table.standard'), m: 20 },
            { label: t('table.deep'), m: 30 },
          ].map((p) => (
            <button key={p.m} className={`chip-toggle ${minutesPerLevel === p.m ? '' : 'off'}`} onClick={() => setMinutes(p.m)}>
              {p.label} · {p.m}
            </button>
          ))}
        </div>
      </div>

      {/* --- Break --- */}
      <div className="card">
        <div className="row">
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.breakLength')}</div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakMinutes: Math.max(1, breakMinutes - 1) } })}>−</button>
            <span className="val">{breakMinutes}</span>
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakMinutes: breakMinutes + 1 } })}>+</button>
          </div>
        </div>
        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.breakEvery')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{breakEvery === 0 ? t('table.breakEveryOff') : t('table.breakEveryOn', { n: breakEvery })}</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakEvery: Math.max(0, breakEvery - 1) } })}>−</button>
            <span className="val">{breakEvery === 0 ? t('table.off') : breakEvery}</span>
            <button onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { breakEvery: breakEvery + 1 } })}>+</button>
          </div>
        </div>
      </div>

      {/* --- Blinds --- */}
      <button className="section-label collapsible-head" onClick={() => setShowBlinds((v) => !v)}>
        {t('table.blinds')}
        <span className="hint">{t('table.blindsHint')}</span>
        <span className={`chevron ${showBlinds ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {showBlinds && (
        <div className="card">
          {session.blindLevels.map((b, i) => (
            <div className={`blind-row ${i === clock.levelIdx ? 'start' : ''}`} key={b.id} style={{ cursor: 'default' }}>
              <div className="lvl-badge">{i + 1}</div>
              <div className="blind-inputs">
                <input
                  className="mini-input"
                  type="number"
                  inputMode="numeric"
                  value={b.smallBlind || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { smallBlind: Math.max(0, +e.target.value) } })}
                />
                <span className="x">/</span>
                <input
                  className="mini-input"
                  type="number"
                  inputMode="numeric"
                  value={b.bigBlind || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { bigBlind: Math.max(0, +e.target.value) } })}
                />
                {i === clock.levelIdx && <span className="badge-soft" style={{ marginLeft: 6 }}>{t('table.now')}</span>}
              </div>
              <button
                className="icon-btn danger"
                style={{ width: 32, height: 32 }}
                onClick={() => dispatch({ type: 'REMOVE_BLIND', id: b.id })}
                aria-label="Remove level"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm mt8" onClick={() => dispatch({ type: 'ADD_BLIND' })}>
            <IconPlus size={16} /> {t('table.addLevel')}
          </button>
        </div>
      )}

      {/* --- Players & prize pool --- */}
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.remotePlayers')}
        <span className="hint">{t('table.remotePlayersHint')}</span>
      </div>
      <div className="card">
        {ledger.length === 0 ? (
          <div className="empty" style={{ paddingBottom: 12 }}>{t('table.remotePlayersHint')}</div>
        ) : (
          <div className="remote-players">
            {ledger.map((p) => (
              <div className={`remote-player ${p.out ? 'out' : ''}`} key={p.id}>
                <div className="remote-player-top">
                  <input
                    className="ledger-name"
                    value={p.name}
                    placeholder="Player"
                    onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
                  />
                  <div className="input-affix remote-buyin">
                    <span className="affix">{currency}</span>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      value={p.buyIn || ''}
                      onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: Math.max(0, +e.target.value) } })}
                    />
                  </div>
                </div>
                <div className="remote-player-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { buyIn: (p.buyIn || 0) + session.buyIn } })}
                  >
                    <IconPlus size={14} /> {t('table.rebuy')} {fmtMoney(session.buyIn, currency)}
                  </button>
                  <button
                    className={`btn btn-sm ${p.out ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { out: !p.out, outAt: !p.out ? Date.now() : undefined } })}
                  >
                    {p.out ? t('table.backIn') : t('table.markOut')}
                  </button>
                  <div className="spacer" />
                  <button className="icon-btn danger" style={{ width: 34, height: 34 }} onClick={() => dispatch({ type: 'LEDGER_REMOVE', id: p.id })} aria-label="Remove player">
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex-between mt12">
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'LEDGER_ADD' })}>
            <IconPlus size={16} /> {t('table.addPlayer')}
          </button>
          <div style={{ textAlign: 'right' }}>
            <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('table.poolTotal')}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--acc)' }}>{fmtMoney(pool, currency)}</div>
          </div>
        </div>
      </div>

      {/* --- TV design (skin + accent) --- */}
      <button className="section-label collapsible-head" onClick={() => setShowDesign((v) => !v)}>
        {t('table.tvDesign')}
        <span className="hint">{t('table.tvDesignHint')}</span>
        <span className={`chevron ${showDesign ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {showDesign && (
        <div className="card">
          <div className="chip-toggle-row">
            {TV_SKINS.map((sk) => (
              <button
                key={sk.id}
                className={`chip-toggle ${(tvSkin ?? 'match') === sk.id ? '' : 'off'}`}
                onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvSkin: sk.id } })}
              >
                {sk.key ? t(sk.key) : sk.name}
              </button>
            ))}
          </div>
          <div className="section-label" style={{ margin: '14px 2px 8px', padding: 0 }}>{t('settings.accent')}</div>
          <div className="accent-grid">
            {ACCENTS.map((a) => (
              <button key={a.id} className={`accent-opt ${currentAccent === a.id ? 'active' : ''}`} onClick={() => setAccent(a.id)}>
                <span className="dot" style={{ background: a.color }} />
                {a.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- TV toggles --- */}
      <div className="section-label">{t('settings.tvExtras')}</div>
      <div className="card">
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.showPlayers')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('table.showPlayersDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${tvShowPlayers ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowPlayers: !tvShowPlayers } })}
            role="switch"
            aria-checked={tvShowPlayers}
          />
        </div>
        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.showPayouts')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('table.showPayoutsDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${tvShowPayouts ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowPayouts: !tvShowPayouts } })}
            role="switch"
            aria-checked={tvShowPayouts}
          />
        </div>
        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.showBustOrder')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('table.showBustOrderDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${tvShowBustOrder ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvShowBustOrder: !tvShowBustOrder } })}
            role="switch"
            aria-checked={tvShowBustOrder}
          />
        </div>
        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('settings.quips')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('settings.quipsDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${tvQuips ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvQuips: !tvQuips } })}
            role="switch"
            aria-checked={tvQuips}
          />
        </div>
      </div>

      {/* --- Custom sayings --- */}
      <button className="section-label collapsible-head" onClick={() => setShowQuips((v) => !v)}>
        {t('table.customQuips')}
        <span className="hint">{t('table.customQuipsHint')}</span>
        <span className={`chevron ${showQuips ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {showQuips && (
        <div className="card">
          {(tvCustomQuips ?? []).length > 0 && (
            <div className="remote-players" style={{ marginBottom: 10 }}>
              {(tvCustomQuips ?? []).map((q, i) => (
                <div className="remote-player-top" key={i}>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{q}</span>
                  <button
                    className="icon-btn danger"
                    style={{ width: 34, height: 34 }}
                    onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { tvCustomQuips: (tvCustomQuips ?? []).filter((_, j) => j !== i) } })}
                    aria-label="Remove saying"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={newQuip}
              placeholder={t('table.customQuipsPlaceholder')}
              onChange={(e) => setNewQuip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newQuip.trim()) {
                  dispatch({ type: 'UPDATE_SETTINGS', patch: { tvCustomQuips: [...(tvCustomQuips ?? []), newQuip.trim()] } });
                  setNewQuip('');
                }
              }}
            />
            <button
              className="btn btn-ghost btn-sm"
              disabled={!newQuip.trim()}
              onClick={() => {
                if (!newQuip.trim()) return;
                dispatch({ type: 'UPDATE_SETTINGS', patch: { tvCustomQuips: [...(tvCustomQuips ?? []), newQuip.trim()] } });
                setNewQuip('');
              }}
            >
              <IconPlus size={16} /> {t('table.addSaying')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
