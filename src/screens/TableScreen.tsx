import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { IconPlay, IconPause, IconReset, IconChevron, IconDice, IconExpand } from '../components/Icons';
import TvMode from './TvMode';
import RemoteControl from './RemoteControl';
import ConnectToTv from './ConnectToTv';
import StartingStack from '../components/StartingStack';
import TvBroadcast from '../components/TvBroadcast';
import PlayerRoster from '../components/PlayerRoster';
import BlindStepper from '../components/BlindStepper';
import { Toggle } from '../components/Toggle';
import MoneyInput from '../components/MoneyInput';
import { useT } from '../lib/i18n';
import { firebaseConfigured } from '../lib/firebaseConfig';
import { useLocalClock, setLocalClock } from '../lib/localClock';
import { useHostClock } from '../lib/useHostClock';
import { goLevel as clockGoLevel, secondsLeft, setMinutesPerLevel, togglePlayPause } from '../lib/clockLogic';

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
  // Cash game with the timer off = no countdown, so the local clock hides. The
  // blinds still move, though — a manual stepper stands in for the clock.
  const showClock = !isHost && (!isCash || state.settings.cashUseTimer);
  const manualBlinds = !isHost && isCash && !state.settings.cashUseTimer;
  const maxIdx = Math.max(0, blindLevels.length - 1);

  /* ONE clock for the whole tab, in both modes: hosting mirrors the TV's clock and
     sends commands, otherwise the phone runs its own. The sticky bar at the top and
     the panels below are two views of the same state — they can't disagree, and the
     local clock survives a tab change because it lives outside React. */
  const local = useLocalClock(mins, maxIdx, !isHost);
  const host = useHostClock(state.settings.liveSessionCode, isHost);
  const clock = isHost ? host.clock : local.clock;
  const seconds = isHost ? secondsLeft(host.clock) : local.seconds;
  const send = isHost ? host.send : setLocalClock;
  const levelIdx = clock.levelIdx;
  const running = clock.running;

  const [tv, setTv] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];

  // Keep the phone's own clock on the length chosen in Settings. (While hosting the
  // TV holds the length, and the remote pushes changes to it.)
  useEffect(() => {
    if (isHost || local.clock.minutesPerLevel === mins) return;
    setLocalClock(setMinutesPerLevel(local.clock, mins));
  }, [mins, isHost, local.clock]);

  const goLevel = (idx: number) => {
    const clamped = Math.max(0, Math.min(maxIdx, idx));
    send(clockGoLevel(clock, clamped - clock.levelIdx, maxIdx));
  };

  const setMins = (v: number) => {
    const n = Math.max(1, Math.min(180, v));
    dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: n } });
    send(setMinutesPerLevel(clock, n));
  };

  const resetPeriod = () => send(setMinutesPerLevel(clock, clock.minutesPerLevel));

  const clockFace = (
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

  /* The bar that stays put while you scroll the roster. During a game the clock is
     the one thing you keep glancing at, and it used to scroll off the top behind
     three cards of setup. Play/pause is right here too, so putting the blinds up
     never means hunting for the clock card. */
  const showSticky = !manualBlinds && (!isCash || state.settings.cashUseTimer);

  return (
    <div>
      {showSticky && (
        <div className="table-sticky">
          <div className="ts-main">
            <span className="ts-level">
              {clock.onBreak ? t('tv.break') : `${t('plan.level')} ${levelIdx + 1}`}
            </span>
            <span className="ts-blinds">{level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}</span>
          </div>
          <div className="spacer" />
          <span className={`ts-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmt(seconds)}</span>
          <button
            className="ts-play"
            onClick={() => send(togglePlayPause(clock))}
            aria-label={running ? t('table.pause') : t('table.play')}
          >
            {running ? <IconPause size={17} /> : <IconPlay size={17} />}
          </button>
        </div>
      )}

      {/* Connect to the TV — type the code the TV shows, right here on the Table tab */}
      <ConnectToTv />

      {/* The stack everyone gets for the buy-in */}
      <StartingStack />

      {/* Everyone at the table: joining, rebuys, stack counts, cash-outs — one card. */}
      <PlayerRoster />

      {showClock && (
        <>
          <div className="section-label">
            {t('table.blindClock')}
            <span className="hint">{t('table.perLevel', { n: mins })}</span>
          </div>

          <div className="card clock-card">
            {clockFace}
            <div className="clock-controls">
              <button className="icon-btn" onClick={() => goLevel(levelIdx - 1)} aria-label="Previous level">
                <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
                  <IconChevron size={20} />
                </span>
              </button>
              <button className="clock-play" onClick={() => send(togglePlayPause(clock))}>
                {running ? <IconPause size={26} /> : <IconPlay size={26} />}
              </button>
              <button className="icon-btn" onClick={resetPeriod} aria-label="Reset timer">
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

      {manualBlinds && <BlindStepper levels={blindLevels} levelIdx={levelIdx} onStep={(d) => goLevel(levelIdx + d)} />}

      {/* Hosting a Live Session: this panel drives the TV's clock, blinds and moments. */}
      <RemoteControl clock={host.clock} send={host.send} />

      <button className="btn btn-primary btn-block" style={{ marginTop: isHost ? 14 : 0 }} onClick={() => setTv(true)}>
        <IconExpand size={18} /> {t('table.bigScreen')}
      </button>
      <p className="faint" style={{ fontSize: 12, textAlign: 'center', margin: '8px 8px 0' }}>
        {isHost ? t('table.hostHint') : t('table.castHint')}
      </p>

      {/* Everything you set once and stop touching, folded away so the running game
          is what fills the screen. Open by default until anybody has sat down. */}
      <SetupSection open={setupOpen || state.ledger.length === 0} onToggle={() => setSetupOpen((v) => !v)}>
        <GameModeCard />
        <TvBroadcast />
        <DealerAndSeats />
        {!isCash && (
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>
            Set the ladder & starting level on the Plan tab; the clock plays through it.
          </p>
        )}
      </SetupSection>

      {/* Portalled to the body on purpose: this screen animates in with a
          transform, and any transformed ancestor becomes the containing block for
          `position: fixed` — the big screen was then laid out inside the ~470px
          card column instead of filling the window. */}
      {tv && createPortal(<TvMode onClose={() => setTv(false)} />, document.body)}
    </div>
  );
}

/** The fold that hides one-time setup once the table is running. */
function SetupSection({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <button className="mins-toggle setup-toggle" onClick={onToggle} aria-expanded={open}>
        <span>
          {t('table.setup')}
          <span className="hint" style={{ marginLeft: 8 }}>{t('table.setupHint')}</span>
        </span>
        <span className={`chevron ${open ? 'rot90' : ''}`}>
          <IconChevron size={16} />
        </span>
      </button>
      {open && <div className="setup-body">{children}</div>}
    </>
  );
}

/** Tournament vs cash game — reshapes the plan, the table and the TV. */
function GameModeCard() {
  const { state, dispatch } = useStore();
  const t = useT();
  const isCash = state.settings.gameMode === 'cash';

  return (
    <>
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
            <Toggle
              on={state.settings.cashUseTimer}
              label={t('table.cashUseTimer')}
              onChange={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { cashUseTimer: !state.settings.cashUseTimer } })}
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
              <Toggle
                on={!!state.settings.bountyMode}
                label={t('table.bounty')}
                onChange={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { bountyMode: !state.settings.bountyMode } })}
              />
            </div>
            {state.settings.bountyMode && (
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.bountyAmount')}</div>
                <div className="spacer" />
                <div className="input-affix" style={{ maxWidth: 120 }}>
                  <span className="affix">{state.settings.currency}</span>
                  <MoneyInput
                    value={state.settings.bountyAmount}
                    onCommit={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { bountyAmount: Math.max(0, v) } })}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
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
                  {/* names are edited in the player roster above — read-only here */}
                  <span className="dealer-name">{p.emoji ? `${p.emoji} ` : ''}{p.name || 'Player'}</span>
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

      <button className="mins-toggle" style={{ margin: '2px 2px 8px' }} onClick={() => setShowSeats((v) => !v)} aria-expanded={showSeats}>
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
