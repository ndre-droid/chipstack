import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import Chip from '../components/Chip';
import { IconPlay, IconPause, IconChevron, IconReset } from '../components/Icons';
import { fmtMoney } from '../lib/money';

const QUIPS = [
  'Blinds are going up — finish your beer.',
  'The cards don’t know it’s your birthday.',
  'Scared money don’t make money.',
  'If you can’t spot the fish in the first hour… it’s you.',
  'A chip and a chair is all you need.',
  'Trust everyone, but always cut the cards.',
  'Tight is right — until it isn’t.',
  'The river giveth, and the river taketh away.',
  'Fold ’em if you got ’em.',
  'Big stack, big responsibility.',
  'Slow roll and you’re buying the next round.',
  'Variance is a cruel, cruel mistress.',
];

const beep = (freq = 880, dur = 0.14, type: OscillatorType = 'sine') => {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ac.destination);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.start();
    o.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), (dur + 0.1) * 1000);
  } catch {
    /* audio not available */
  }
};
const chime = () => {
  beep(660, 0.16);
  setTimeout(() => beep(880, 0.16), 150);
  setTimeout(() => beep(1180, 0.28), 320);
};
const buzzer = () => beep(200, 0.5, 'square');

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function TvMode({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const { blindLevels } = state.session;
  const { minutesPerLevel, currency, unitValue, skin, tvSkin, accents } = state.settings;
  const effTvSkin = (tvSkin ?? 'match') === 'match' ? skin ?? 'minimal' : (tvSkin as Exclude<typeof tvSkin, 'match'>);
  const tvAccent = accents?.[effTvSkin] ?? 'amber';
  const { playerCount, buyIn } = state.session;
  const denominations = state.denominations;
  const ledger = state.ledger;

  const [levelIdx, setLevelIdx] = useState(0);
  const [seconds, setSeconds] = useState(minutesPerLevel * 60);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [spin, setSpin] = useState<{ name: string; done: boolean } | null>(null);
  const tick = useRef<number | null>(null);

  const level = blindLevels[Math.min(levelIdx, blindLevels.length - 1)];
  const next = blindLevels[levelIdx + 1];
  const currentSB = level?.smallBlind ?? 1;
  const currentBB = level?.bigBlind ?? 1;

  // keep screen awake while the TV is showing
  useEffect(() => {
    let lock: { release: () => void } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* not supported */
      }
    };
    req();
    return () => {
      try {
        lock?.release();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // main clock
  useEffect(() => {
    if (!running) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    tick.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s > 1) return s - 1;
        if (onBreak) {
          setOnBreak(false);
          chime();
          return minutesPerLevel * 60;
        }
        chime();
        try {
          navigator.vibrate?.([300, 120, 300]);
        } catch {
          /* ignore */
        }
        setFlash(true);
        setTimeout(() => setFlash(false), 3200);
        setLevelIdx((i) => {
          if (i + 1 < blindLevels.length) return i + 1;
          setRunning(false);
          return i;
        });
        return minutesPerLevel * 60;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [running, onBreak, blindLevels.length, minutesPerLevel]);

  // rotate quips
  useEffect(() => {
    const id = window.setInterval(() => setQuipIdx((i) => (i + 1) % QUIPS.length), 11000);
    return () => window.clearInterval(id);
  }, []);

  // shot clock
  useEffect(() => {
    if (shot === null) return;
    if (shot <= 0) {
      buzzer();
      const t = setTimeout(() => setShot(null), 1500);
      return () => clearTimeout(t);
    }
    const id = window.setTimeout(() => setShot((s) => (s ?? 0) - 1), 1000);
    if (shot <= 5) beep(720, 0.08);
    return () => window.clearTimeout(id);
  }, [shot]);

  const goLevel = (i: number) => {
    const c = Math.max(0, Math.min(blindLevels.length - 1, i));
    setLevelIdx(c);
    setSeconds(minutesPerLevel * 60);
    setOnBreak(false);
  };
  const takeBreak = () => {
    setOnBreak(true);
    setSeconds(5 * 60);
    setRunning(true);
  };

  const players = useMemo(
    () => (ledger.length ? ledger.map((p) => p.name || 'Player') : Array.from({ length: playerCount }, (_, i) => `Seat ${i + 1}`)),
    [ledger, playerCount],
  );
  const spinRound = () => {
    if (!players.length) return;
    let n = 0;
    const total = 18 + Math.floor(Math.random() * 8);
    const step = () => {
      setSpin({ name: players[n % players.length], done: false });
      beep(520, 0.04);
      n++;
      if (n < total) {
        setTimeout(step, 60 + n * 12);
      } else {
        const winner = players[Math.floor(Math.random() * players.length)];
        setSpin({ name: winner, done: true });
        chime();
        setTimeout(() => setSpin(null), 4500);
      }
    };
    step();
  };

  // standings
  const poolMoney = ledger.length ? ledger.reduce((s, p) => s + (p.buyIn || 0), 0) : playerCount * buyIn;
  const playersLeft = ledger.length ? Math.max(1, ledger.filter((p) => (p.cashOut || 0) === 0).length) : playerCount;
  const poolPoints = unitValue > 0 ? Math.round(poolMoney / unitValue) : 0;
  const avgStack = Math.round(poolPoints / playersLeft);
  const avgBB = currentBB > 0 ? Math.round(avgStack / currentBB) : 0;

  const legend = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0).sort((a, b) => a.value - b.value),
    [denominations],
  );
  const tooSmall = useMemo(
    () => denominations.filter((d) => d.enabled && d.value > 0 && d.value < currentSB).sort((a, b) => a.value - b.value),
    [denominations, currentSB],
  );

  const pct = Math.max(0, Math.min(100, (seconds / ((onBreak ? 5 : minutesPerLevel) * 60)) * 100));

  return (
    <div className="tv" data-tv-skin={effTvSkin} data-tv-accent={tvAccent}>
      {flash && (
        <div className="tv-flash">
          <div>BLINDS UP</div>
          <div className="tv-flash-sub">{level && `${level.smallBlind} / ${level.bigBlind}`}</div>
        </div>
      )}

      <div className="tv-grid">
        {/* left: standings + colour-up */}
        <aside className="tv-side">
          <div className="tv-stat">
            <span className="tv-stat-k">Prize pool</span>
            <span className="tv-stat-v">{fmtMoney(poolMoney, currency)}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">Players left</span>
            <span className="tv-stat-v">{playersLeft}</span>
          </div>
          <div className="tv-stat">
            <span className="tv-stat-k">Avg stack</span>
            <span className="tv-stat-v">{avgStack.toLocaleString()}<small> · {avgBB} BB</small></span>
          </div>
          {tooSmall.length > 0 && (
            <div className="tv-colorup">
              <span className="tv-colorup-h">Colour up</span>
              <span>Retire the {tooSmall.map((d) => d.value).join(', ')} — below the {currentSB} blind.</span>
            </div>
          )}
        </aside>

        {/* center: the clock */}
        <main className="tv-clock">
          <div className="tv-level">{onBreak ? 'Break' : `Level ${levelIdx + 1}`}</div>
          <div className="tv-blinds">
            {onBreak ? 'Back soon' : level ? `${level.smallBlind} / ${level.bigBlind}` : '—'}
            {!onBreak && level?.ante ? <span className="tv-ante"> · ante {level.ante}</span> : null}
          </div>
          <div className={`tv-time ${running && seconds <= 30 ? 'urgent' : ''}`}>{fmtClock(seconds)}</div>
          <div className="tv-progress"><i style={{ width: `${pct}%` }} /></div>
          <div className="tv-next">{onBreak ? '' : next ? `Next: ${next.smallBlind} / ${next.bigBlind}` : 'Final level'}</div>
        </main>

        {/* right: chip legend */}
        <aside className="tv-side tv-legend">
          <div className="tv-legend-h">Chip values</div>
          {legend.map((d) => (
            <div className="tv-legend-row" key={d.id}>
              <Chip value={d.value} color={d.color} accent={d.accent} size={34} shape={d.shape} />
              <span className="tv-legend-v">{d.value}</span>
              <span className="tv-legend-m">{fmtMoney(d.value * unitValue, currency)}</span>
            </div>
          ))}
        </aside>
      </div>

      {/* quip ticker */}
      <div className="tv-quip" key={quipIdx}>{QUIPS[quipIdx]}</div>

      {/* controls (for the phone holding the session) */}
      <div className="tv-controls">
        <button onClick={() => goLevel(levelIdx - 1)} aria-label="Previous level"><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevron size={22} /></span></button>
        <button onClick={() => setSeconds((onBreak ? 5 : minutesPerLevel) * 60)} aria-label="Reset level"><IconReset size={20} /></button>
        <button className="tv-play" onClick={() => setRunning((r) => !r)}>{running ? <IconPause size={30} /> : <IconPlay size={30} />}</button>
        <button onClick={() => goLevel(levelIdx + 1)} aria-label="Next level"><IconChevron size={22} /></button>
        <button className="tv-txt" onClick={takeBreak}>Break</button>
        <button className="tv-txt" onClick={() => setShot(30)}>Shot clock</button>
        <button className="tv-txt" onClick={spinRound}>Who buys?</button>
        <button className="tv-txt tv-exit" onClick={onClose}>Exit</button>
      </div>

      {/* shot clock overlay */}
      {shot !== null && (
        <div className="tv-overlay" onClick={() => setShot(null)}>
          <div className="tv-overlay-label">Shot clock</div>
          <div className={`tv-overlay-num ${shot <= 5 ? 'urgent' : ''}`}>{Math.max(0, shot)}</div>
          <div className="tv-overlay-hint">tap to dismiss</div>
        </div>
      )}

      {/* who-buys spinner overlay */}
      {spin && (
        <div className="tv-overlay">
          <div className="tv-overlay-label">Who buys the next round?</div>
          <div className={`tv-overlay-name ${spin.done ? 'won' : ''}`}>{spin.name}</div>
          {spin.done && <div className="tv-overlay-hint">🍻 you’re up!</div>}
        </div>
      )}
    </div>
  );
}
