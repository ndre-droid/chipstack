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
import { goLevel as clockGoLevel, resetPeriod as clockResetPeriod, secondsLeft, setMinutesPerLevel, togglePlayPause } from '../lib/clockLogic';
import { useWakeLock } from '../lib/useWakeLock';
import { useBackHandler } from '../lib/backHandler';
import ClockFocus from '../components/ClockFocus';
import TableTools from '../components/TableTools';
import JoinRequests from '../components/JoinRequests';
import BreakAt from '../components/BreakAt';
import { haptic } from '../lib/platform';
import { cancelLevelAlert, levelAlertsAvailable, requestLevelAlerts, scheduleLevelAlert } from '../lib/levelAlert';
import { lateRegState } from '../lib/lateReg';

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
  const [focus, setFocus] = useState(false);
  const [tools, setTools] = useState(false);
  const [alertDenied, setAlertDenied] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  /* A phone propped up on the table IS the clock when there's no TV, and it went to
     sleep mid-level like any other page. Held only while the countdown runs, so a
     phone left on the Plan tab still dims normally. */
  useWakeLock(running);

  /* The app makes no sound on purpose, and a visual cue only reaches somebody who is
     looking. A notification scheduled at the deadline is the one channel that still
     works with the phone face-down in a pocket — and it survives Android freezing
     the tab, which a JS timer does not. */
  const alerts = state.settings.levelAlerts;
  useEffect(() => {
    if (!alerts || !running || clock.onBreak || !clock.periodEndsAt) {
      void cancelLevelAlert();
      return;
    }
    const upcoming = blindLevels[levelIdx + 1];
    void scheduleLevelAlert(
      clock.periodEndsAt,
      t('alert.levelOver', { n: levelIdx + 1 }),
      upcoming ? t('alert.blindsNow', { blinds: `${upcoming.smallBlind}/${upcoming.bigBlind}` }) : t('alert.lastLevel'),
    );
  }, [alerts, running, clock.onBreak, clock.periodEndsAt, levelIdx, blindLevels, t]);
  useEffect(() => () => void cancelLevelAlert(), []);
  // the big screen is a full-screen overlay: back leaves it, it doesn't leave the app
  useBackHandler(tv, () => setTv(false));

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];

  /* The two figures everybody asks for between hands — "how deep are we?" and
     "how many are left?" — used to live only on the big screen. They ride along in
     the sticky bar so the phone answers them without scrolling anywhere. */
  const unit = state.settings.unitValue || 0.01;
  const inPlay = state.ledger.filter((p) => !p.out);
  const potMoney = isCash
    ? state.ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0)
    : state.ledger.reduce((s, p) => s + (p.buyIn || 0), 0);
  const lateReg = lateRegState(
    isCash ? 0 : state.settings.lateRegLevels ?? 0,
    levelIdx,
    seconds,
    state.settings.minutesPerLevel,
  );
  const avgBb =
    inPlay.length > 0 && level?.bigBlind
      ? Math.round(Math.max(0, potMoney) / unit / inPlay.length / level.bigBlind)
      : 0;

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

  // ↺ puts the period back to its full length — a break included, which the old
  // spelling (`setMinutesPerLevel` with the length it already had) could not do.
  const resetPeriod = () => send(clockResetPeriod(clock, state.settings.breakMinutes ?? 5));

  const clockFace = (
    <div className="clock-face">
      <div className="clock-level">{t('table.remoteLevel', { n: levelIdx + 1 })}</div>
      <div className="clock-blinds">
        {level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
        {level?.ante ? <span className="clock-ante"> · {t('common.ante')} {level.ante}</span> : null}
      </div>
      <div className={`clock-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmt(seconds)}</div>
      <div className="clock-next">
        {next ? t('tv.next', { blinds: `${next.smallBlind} / ${next.bigBlind}` }) : t('tv.finalLevel')}
      </div>
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
          {lateReg.enabled && (
            <span className={`ts-latereg ${lateReg.open ? '' : 'closed'}`}>
              {!lateReg.open
                ? t('table.lateRegClosed')
                : lateReg.lastLevel
                  ? t('table.lateRegLast')
                  : t('table.lateRegOpen', { mins: lateReg.minutesLeft ?? 0 })}
            </span>
          )}
          {inPlay.length > 0 && (
            <span className="ts-stats">
              {avgBb > 0 && <span>{t('table.avgBb', { n: avgBb })}</span>}
              <span>{t('table.left', { n: inPlay.length })}</span>
            </span>
          )}
          <button
            className={`ts-time ts-time-btn ${running && seconds <= 30 ? 'urgent' : ''}`}
            onClick={() => setFocus(true)}
            aria-label={t('table.focusMode')}
          >
            {fmt(seconds)}
          </button>
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

      {/* Anybody who scanned the code on the TV and typed their own name. */}
      <JoinRequests />

      {/* Everyone at the table: joining, rebuys, stack counts, cash-outs — one card. */}
      <PlayerRoster />

      {/* Side pots and colouring up — the two calculations the table argues about. */}
      <button className="btn btn-ghost btn-block btn-sm tools-btn" onClick={() => setTools(true)}>
        🃏 {t('tools.open')}
      </button>

      {showClock && (
        <>
          <div className="section-label">
            {t('table.blindClock')}
            <span className="hint">{t('table.perLevel', { n: mins })}</span>
          </div>

          <div className="card clock-card">
            {clockFace}
            <div className="clock-controls">
              <button className="icon-btn" onClick={() => goLevel(levelIdx - 1)} aria-label={t('table.prevLevel')}>
                <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
                  <IconChevron size={20} />
                </span>
              </button>
              <button className="clock-play" onClick={() => send(togglePlayPause(clock))}>
                {running ? <IconPause size={26} /> : <IconPlay size={26} />}
              </button>
              <button className="icon-btn" onClick={resetPeriod} aria-label={t('table.resetTimer')}>
                <IconReset size={19} />
              </button>
              <button className="icon-btn" onClick={() => goLevel(levelIdx + 1)} aria-label={t('table.nextLevelBtn')}>
                <IconChevron size={20} />
              </button>
              <button className="icon-btn" onClick={() => setTv(true)} aria-label={t('table.bigScreenShort')}>
                <IconExpand size={18} />
              </button>
            </div>

            {/* Native only — the browser has no way to wake a closed tab at a
                deadline, so offering the switch there would be a promise the app
                cannot keep. */}
            {levelAlertsAvailable() && (
            <div className="row break-at">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.levelAlert')}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {alertDenied ? t('table.levelAlertDenied') : t('table.levelAlertHint')}
                </div>
              </div>
              <div className="spacer" />
              <Toggle
                on={alerts}
                label={t('table.levelAlert')}
                onChange={async () => {
                  if (alerts) {
                    dispatch({ type: 'UPDATE_SETTINGS', patch: { levelAlerts: false } });
                    void cancelLevelAlert();
                    return;
                  }
                  const ok = await requestLevelAlerts();
                  setAlertDenied(!ok);
                  if (ok) dispatch({ type: 'UPDATE_SETTINGS', patch: { levelAlerts: true } });
                }}
              />
            </div>
            )}

            <BreakAt clock={clock} send={send} />

            <div className="clock-adjust">
              <button className="adj10" onClick={() => setMins(mins - 10)}>−10</button>
              <button className="adj1" onClick={() => setMins(mins - 1)}>−1</button>
              <div className="mpl-center">
                <b>{mins}</b>
                <small>{t('table.minPerLevel')}</small>
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

      {/* The big screen's own settings sit at the top level, not inside the setup
          fold: they are the one thing here you reach for DURING a night (the text is
          too small, the panels want moving), and two taps to get at them is one too
          many. */}
      <TvBroadcast />

      {/* Everything you set once and stop touching, folded away so the running game
          is what fills the screen. Open by default until anybody has sat down. */}
      <SetupSection open={setupOpen || state.ledger.length === 0} onToggle={() => setSetupOpen((v) => !v)}>
        <GameModeCard />
        <DealerAndSeats />
        {!isCash && (
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>
            {t('table.ladderHint')}
          </p>
        )}
      </SetupSection>

      {tools && <TableTools onClose={() => setTools(false)} />}

      {focus && (
        <ClockFocus
          levelIdx={levelIdx}
          level={level}
          next={next}
          seconds={seconds}
          running={running}
          onBreak={clock.onBreak}
          onToggle={() => send(togglePlayPause(clock))}
          onStep={(d) => goLevel(levelIdx + d)}
          onClose={() => setFocus(false)}
        />
      )}

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
            {/* "Can I still buy in?" — asked every night, so the answer gets a
                permanent home on the clock bar and the big screen. */}
            <div className="row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.lateReg')}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {state.settings.lateRegLevels
                    ? t('table.lateRegLevels', { n: state.settings.lateRegLevels })
                    : t('table.lateRegHint')}
                </div>
              </div>
              <div className="spacer" />
              <div className="stepper">
                <button
                  onClick={() =>
                    dispatch({ type: 'UPDATE_SETTINGS', patch: { lateRegLevels: Math.max(0, (state.settings.lateRegLevels ?? 0) - 1) } })
                  }
                >
                  −
                </button>
                <span className="val">{state.settings.lateRegLevels || t('table.lateRegOff')}</span>
                <button
                  onClick={() =>
                    dispatch({
                      type: 'UPDATE_SETTINGS',
                      patch: {
                        lateRegLevels: Math.min(state.session.blindLevels.length, (state.settings.lateRegLevels ?? 0) + 1),
                      },
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>
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

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

function DealerAndSeats() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { ledger } = state;
  const { playerCount } = state.session;
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [showSeats, setShowSeats] = useState(false);
  const [seats, setSeats] = useState<string[] | null>(null);
  const [cards, setCards] = useState<{ id: string; rank: number; label: string }[] | null>(null);

  const pickDealer = () => {
    if (!ledger.length) return;
    setCards(null);
    setDealerId(ledger[Math.floor(Math.random() * ledger.length)].id);
  };

  /* The way a real table does it: everybody gets a card, highest one deals. Slower
     than a spinner and considerably more fun, because everyone watches their own
     card instead of a wheel. Drawn from ONE deck, so no two players can tie. */
  const drawForButton = () => {
    if (!ledger.length) return;
    const deck: { rank: number; label: string }[] = [];
    for (const suit of SUITS) for (let r = 2; r <= 14; r++) deck.push({ rank: r, label: `${RANKS[r]}${suit}` });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const drawn = ledger.map((p, i) => ({ id: p.id, ...deck[i] }));
    const top = drawn.reduce((best, d) => (d.rank > best.rank ? d : best), drawn[0]);
    setCards(drawn);
    setDealerId(top.id);
    haptic(16);
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
            <div className="empty" style={{ paddingBottom: 12 }}>{t('table.dealerEmpty')}</div>
            <button className="btn btn-ghost btn-block btn-sm" onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: playerCount })}>
              {t('table.addNPlayers', { n: playerCount })}
            </button>
          </div>
        ) : (
          <>
            <div className="dealer-list">
              {ledger.map((p) => (
                <div className={`dealer-row ${dealerId === p.id ? 'is-dealer' : ''}`} key={p.id}>
                  {/* names are edited in the player roster above — read-only here */}
                  <span className="dealer-name">{p.emoji ? `${p.emoji} ` : ''}{p.name || 'Player'}</span>
                  {cards && (
                    <span className={`draw-card ${/[♥♦]/.test(cards.find((c) => c.id === p.id)?.label ?? '') ? 'red' : ''}`}>
                      {cards.find((c) => c.id === p.id)?.label}
                    </span>
                  )}
                  {dealerId === p.id && <span className="seat-badge" style={{ position: 'static' }}>D</span>}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-block btn-sm mt12" onClick={drawForButton}>
              🂠 {cards ? t('table.drawAgain') : t('table.drawCards')}
            </button>
            {cards && dealerId && (
              <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', margin: '8px 0 0' }}>
                {t('table.dealsFirst', { name: nameOf(dealerId) })}
              </p>
            )}
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
