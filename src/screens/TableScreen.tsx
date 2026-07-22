import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { IconPlay, IconPause, IconReset, IconChevron, IconDice, IconExpand } from '../components/Icons';

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function TableScreen() {
  const { state, dispatch } = useStore();
  const { blindLevels } = state.session;
  const mins = state.settings.minutesPerLevel;

  const [levelIdx, setLevelIdx] = useState(0);
  const [seconds, setSeconds] = useState(mins * 60);
  const [running, setRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [rotated, setRotated] = useState(false);
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

  return (
    <div>
      <div className="section-label">
        Blind clock
        <span className="hint">{mins} min / level · edit in Settings</span>
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
          <button className="icon-btn" onClick={() => setFullscreen(true)} aria-label="Table mode">
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

      <DealerAndSeats />

      <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>
        Set the ladder & starting level on the Plan tab; the clock plays through it.
      </p>

      {fullscreen && (
        <div className="table-mode" onClick={() => setFullscreen(false)}>
          <div className={`table-mode-inner ${rotated ? 'rot' : ''}`}>{clock}</div>
          <div className="table-mode-controls" onClick={(e) => e.stopPropagation()}>
            <button className="tm-btn" onClick={() => setRotated((r) => !r)} aria-label="Rotate">
              ⟳
            </button>
            <button className="clock-play big" onClick={() => setRunning((r) => !r)}>
              {running ? <IconPause size={34} /> : <IconPlay size={34} />}
            </button>
            <button className="tm-btn" onClick={() => setFullscreen(false)} aria-label="Exit">
              ✕
            </button>
          </div>
          <div className="table-mode-hint">tap the dark area to exit</div>
        </div>
      )}
    </div>
  );
}

function DealerAndSeats() {
  const { state, dispatch } = useStore();
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
        Dealer button
        <span className="hint">spin for the button</span>
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
              <IconDice size={18} /> Spin the dealer button
            </button>
            {dealerId && (
              <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 800, color: 'var(--gold-soft)' }}>
                {nameOf(dealerId)} is on the button
              </p>
            )}
          </>
        )}
      </div>

      <button className="mins-toggle" style={{ margin: '2px 2px 8px' }} onClick={() => setShowSeats((v) => !v)}>
        <span>Random seat draw</span>
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
                <IconDice size={16} /> Draw seats
              </button>
              {seats && (
                <div className="seat-grid">
                  {seats.map((id, i) => (
                    <div className="seat" key={id}>
                      <span className="seat-no">Seat {i + 1}</span>
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
