import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { IconPlay, IconPause, IconReset, IconChevron, IconDice, IconExpand } from '../components/Icons';
import TvMode from './TvMode';
import RemoteControl from './RemoteControl';
import ConnectToTv from './ConnectToTv';
import StartingStack from '../components/StartingStack';
import TvBroadcast from '../components/TvBroadcast';
import ChipCountCard from '../components/ChipCountCard';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function TableScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { blindLevels } = state.session;
  const mins = state.settings.minutesPerLevel;
  // While this phone is hosting a Live Session the TV owns the countdown, so the
  // local timer here would just be a confusing second clock. Hand the whole clock
  // over to the RemoteControl panel, which drives the TV's clock directly.
  const isHost =
    firebaseConfigured && state.settings.liveSessionRole === 'host' && !!state.settings.liveSessionCode;
  const isCash = state.settings.gameMode === 'cash';
  // Cash game with the timer off = one fixed blind level, so the local clock hides.
  const showClock = !isHost && (!isCash || state.settings.cashUseTimer);

  const [levelIdx, setLevelIdx] = useState(0);
  const [seconds, setSeconds] = useState(mins * 60);
  const [running, setRunning] = useState(false);
  const [tv, setTv] = useState(false);
  const tick = useRef<number | null>(null);

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];

  // keep the clock in sync if the per-level length changes while paused
  useEffect(() => {
    if (!running) setSeconds(mins * 60);
  }, [mins]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    tick.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s > 1) return s - 1;
        // level over → advance
        try {
          navigator.vibrate?.(400);
        } catch {
          /* ignore */
        }
        setLevelIdx((idx) => {
          if (idx + 1 < blindLevels.length) return idx + 1;
          setRunning(false);
          return idx;
        });
        return mins * 60;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [running, blindLevels.length, mins]);

  const goLevel = (idx: number) => {
    const clamped = Math.max(0, Math.min(blindLevels.length - 1, idx));
    setLevelIdx(clamped);
    setSeconds(mins * 60);
  };

  const setMins = (v: number) => {
    const n = Math.max(1, Math.min(180, v));
    dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: n } });
    if (!running) setSeconds(n * 60);
  };

  const clock = (
    <div className="clock-face">
      <div className="clock-level">Level {levelIdx + 1}</div>
      <div className="clock-blinds">
        {level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
        {level?.ante ? <span className="clock-ante"> · ante {level.ante}</span> : null}
      </div>
      <div className={`clock-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmt(seconds)}</div>
      <div className="clock-next">{next ? `Next: ${next.smallBlind} / ${next.bigBlind}` : 'Final level'}</div>
    </div>
  );

  const playerCount = state.session.playerCount;

  return (
    <div>
      {/* Game mode — tournament vs cash game (reshapes the plan, table & TV) */}
      <div className="section-label">{t('table.gameMode')}</div>
      <div className="card">
        <div className="segmented">
          <button
            className={!isCash ? 'active' : ''}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { gameMode: 'tournament' } })}
          >
            {t('table.tournament')}
          </button>
          <button
            className={isCash ? 'active' : ''}
            onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { gameMode: 'cash' } })}
          >
            {t('table.cashGame')}
          </button>
        </div>
        <p className="faint" style={{ fontSize: 12.5, margin: '10px 2px 0', lineHeight: 1.55 }}>
          {isCash ? t('table.gameModeCashDesc') : t('table.gameModeTournDesc')}
        </p>
        {isCash && (
          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.cashUseTimer')}</div>
              <div className="faint" style={{ fontSize: 12 }}>{t('table.cashUseTimerDesc')}</div>
            </div>
            <div className="spacer" />
            <div
              className={`toggle ${state.settings.cashUseTimer ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { cashUseTimer: !state.settings.cashUseTimer } })}
              role="switch"
              aria-checked={state.settings.cashUseTimer}
            />
          </div>
        )}
        {!isCash && (
          <>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>🎯 {t('table.bounty')}</div>
                <div className="faint" style={{ fontSize: 12 }}>{t('table.bountyDesc')}</div>
              </div>
              <div className="spacer" />
              <div
                className={`toggle ${state.settings.bountyMode ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { bountyMode: !state.settings.bountyMode } })}
                role="switch"
                aria-checked={state.settings.bountyMode}
              />
            </div>
            {state.settings.bountyMode && (
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.bountyAmount')}</div>
                <div className="spacer" />
                <div className="input-affix" style={{ maxWidth: 120 }}>
                  <span className="affix">{state.settings.currency}</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    value={state.settings.bountyAmount || ''}
                    onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { bountyAmount: Math.max(0, +e.target.value) } })}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Connect to the TV — type the code the TV shows, right here on the Table tab */}
      <ConnectToTv />

      {/* The stack everyone gets for the buy-in */}
      <StartingStack />

      {/* Players at the table — adjustable any time during the session */}
      <div className="card">
        <div className="row">
          <div>
            <div style={{ fontWeight: 600 }}>{t('plan.playersAtTable')}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{t('table.playersAnytime')}</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: playerCount - 1 })}>−</button>
            <span className="val">{playerCount}</span>
            <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: playerCount + 1 })}>+</button>
          </div>
        </div>
      </div>

      {/* Photo chip-count — always reachable, both modes, no TV session needed. */}
      <ChipCountCard />

      {showClock && (
        <>
          <div className="section-label">
            {t('table.blindClock')}
            <span className="hint">{t('table.perLevel', { n: mins })}</span>
          </div>

          <div className="card clock-card">
            {clock}
            <div className="clock-controls">
              <button className="icon-btn" onClick={() => goLevel(levelIdx - 1)} aria-label="Previous level">
                <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
                  <IconChevron size={20} />
                </span>
              </button>
              <button className="clock-play" onClick={() => setRunning((r) => !r)}>
                {running ? <IconPause size={26} /> : <IconPlay size={26} />}
              </button>
              <button className="icon-btn" onClick={() => setSeconds(mins * 60)} aria-label="Reset timer">
                <IconReset size={19} />
              </button>
              <button className="icon-btn" onClick={() => goLevel(levelIdx + 1)} aria-label="Next level">
                <IconChevron size={20} />
              </button>
              <button className="icon-btn" onClick={() => setTv(true)} aria-label="Big screen">
                <IconExpand size={18} />
              </button>
            </div>

            <div className="clock-adjust">
              <button className="adj10" onClick={() => setMins(mins - 10)}>−10</button>
              <button className="adj1" onClick={() => setMins(mins - 1)}>−1</button>
              <div className="mpl-center">
                <b>{mins}</b>
                <small>min / level</small>
              </div>
              <button className="adj1" onClick={() => setMins(mins + 1)}>+1</button>
              <button className="adj10" onClick={() => setMins(mins + 10)}>+10</button>
            </div>
          </div>
        </>
      )}

      {/* Hosting a Live Session: this panel is the single clock and drives the TV. */}
      <RemoteControl />

      <button className="btn btn-primary btn-block" style={{ marginTop: isHost ? 14 : 0 }} onClick={() => setTv(true)}>
        <IconExpand size={18} /> {t('table.bigScreen')}
      </button>
      <p className="faint" style={{ fontSize: 12, textAlign: 'center', margin: '8px 8px 0' }}>
        {isHost ? t('table.hostHint') : t('table.castHint')}
      </p>

      {/* TV broadcast — the big-screen look, extras, and how to show it on the TV */}
      <TvBroadcast />

      <DealerAndSeats />

      {!isCash && (
        <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>
          Set the ladder & starting level on the Plan tab; the clock plays through it.
        </p>
      )}

      {tv && <TvMode onClose={() => setTv(false)} />}
    </div>
  );
}

function DealerAndSeats() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { ledger } = state;
  const { playerCount } = state.session;
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [showSeats, setShowSeats] = useState(false);
  const [seats, setSeats] = useState<string[] | null>(null);

  const pickDealer = () => {
    if (!ledger.length) return;
    setDealerId(ledger[Math.floor(Math.random() * ledger.length)].id);
  };

  const drawSeats = () => {
    const order = ledger.map((p) => p.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    setSeats(order);
  };

  const nameOf = (id: string) => ledger.find((p) => p.id === id)?.name || 'Player';

  return (
    <>
      <div className="section-label" style={{ marginTop: 18 }}>
        {t('table.dealerButton')}
        <span className="hint">{t('table.spinForButton')}</span>
      </div>
      <div className="card">
        {ledger.length === 0 ? (
          <div>
            <div className="empty" style={{ paddingBottom: 12 }}>Add players to name them and spin the dealer button.</div>
            <button className="btn btn-ghost btn-block btn-sm" onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: playerCount })}>
              Add {playerCount} players
            </button>
          </div>
        ) : (
          <>
            <div className="dealer-list">
              {ledger.map((p) => (
                <div className={`dealer-row ${dealerId === p.id ? 'is-dealer' : ''}`} key={p.id}>
                  <input
                    className="ledger-name"
                    value={p.name}
                    onChange={(e) => dispatch({ type: 'LEDGER_UPDATE', id: p.id, patch: { name: e.target.value } })}
                  />
                  {dealerId === p.id && <span className="seat-badge" style={{ position: 'static' }}>D</span>}
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-block mt12" onClick={pickDealer}>
              <IconDice size={18} /> {t('table.spin')}
            </button>
            {dealerId && (
              <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 700, color: 'var(--acc)' }}>
                {t('table.onTheButton', { name: nameOf(dealerId) })}
              </p>
            )}
          </>
        )}
      </div>

      <button className="mins-toggle" style={{ margin: '2px 2px 8px' }} onClick={() => setShowSeats((v) => !v)}>
        <span>{t('table.seatDraw')}</span>
        <span className={`chevron ${showSeats ? 'rot90' : ''}`}>
          <IconChevron size={16} />
        </span>
      </button>
      {showSeats && (
        <div className="card">
          {ledger.length === 0 ? (
            <div className="empty">Add players first (Dealer button above).</div>
          ) : (
            <>
              <button className="btn btn-ghost btn-block btn-sm" onClick={drawSeats}>
                <IconDice size={16} /> {t('table.drawSeats')}
              </button>
              {seats && (
                <div className="seat-grid">
                  {seats.map((id, i) => (
                    <div className="seat" key={id}>
                      <span className="seat-no">{t('table.seat', { n: i + 1 })}</span>
                      <span className="seat-player">{nameOf(id)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
