/**
 * Pure clock-state transitions shared by TvMode (the clock owner, when synced)
 * and the phone's Remote control panel (which only ever sends commands — it
 * never runs its own countdown, so it stays correct even while backgrounded).
 *
 * The clock's source of truth is `periodEndsAt` (an epoch-ms deadline) while
 * running, or `remaining` (frozen seconds) while paused. Any client can derive
 * "seconds left right now" from either state without needing its own ticking
 * timer to own the truth.
 */
export interface ClockState {
  levelIdx: number;
  onBreak: boolean;
  running: boolean;
  /** epoch ms the current period ends at; null while paused */
  periodEndsAt: number | null;
  /** frozen seconds remaining; authoritative while paused, else a fallback */
  remaining: number;
  minutesPerLevel: number;
}

export function initialClock(minutesPerLevel: number): ClockState {
  return { levelIdx: 0, onBreak: false, running: false, periodEndsAt: null, remaining: minutesPerLevel * 60, minutesPerLevel };
}

export function secondsLeft(c: ClockState): number {
  if (c.periodEndsAt == null) return Math.max(0, c.remaining);
  return Math.max(0, Math.round((c.periodEndsAt - Date.now()) / 1000));
}

export function togglePlayPause(c: ClockState): ClockState {
  if (c.running) return { ...c, running: false, remaining: secondsLeft(c), periodEndsAt: null };
  const dur = Math.max(1, secondsLeft(c));
  return { ...c, running: true, periodEndsAt: Date.now() + dur * 1000 };
}

export function goLevel(c: ClockState, delta: number, maxIdx: number): ClockState {
  const idx = Math.max(0, Math.min(maxIdx, c.levelIdx + delta));
  const dur = c.minutesPerLevel * 60;
  return { ...c, levelIdx: idx, onBreak: false, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}

/** Never leave a running period with less than this on the clock — see below. */
const MIN_PERIOD_SECONDS = 10;

/**
 * Change the per-level length.
 *
 * "+1" means **this level gets one more minute**, not "restart this level at 21
 * minutes". The buttons sit directly under a running countdown, and the thing
 * anybody reaches for them for is "give us a bit longer" or "we're dragging, cut it
 * short" — which the old behaviour could not express at all: with 4:12 on the clock,
 * a single +1 tap jumped back to 21:00 and the level everybody had been playing
 * started again. The new length still applies in full to every level after this one
 * (see `goLevel`).
 *
 * Shortening is floored at ten seconds rather than allowed to hit zero: −10 with
 * 4:12 left should read as "as short as I can make it", not silently blow through
 * the level and put the blinds up. A break keeps its own length and is untouched.
 */
export function setMinutesPerLevel(c: ClockState, minutes: number): ClockState {
  const m = Math.max(1, Math.min(180, Math.floor(minutes)));
  if (m === c.minutesPerLevel) return c;
  if (c.onBreak) return { ...c, minutesPerLevel: m };
  const left = Math.max(MIN_PERIOD_SECONDS, secondsLeft(c) + (m - c.minutesPerLevel) * 60);
  return { ...c, minutesPerLevel: m, remaining: left, periodEndsAt: c.running ? Date.now() + left * 1000 : null };
}

/**
 * Put the current period back to its full length — the ↺ button.
 *
 * Its own function because it used to be spelled `setMinutesPerLevel(c,
 * c.minutesPerLevel)`, which only worked while that call restarted the period as a
 * side effect. Now that the length buttons adjust rather than restart, asking for
 * the length you already have is correctly a no-op, and a reset has to say so.
 *
 * Pass `breakMinutes` to make it work during a break too; without it a break is
 * left alone, which is what the Table tab did before.
 */
export function resetPeriod(c: ClockState, breakMinutes?: number): ClockState {
  if (c.onBreak && breakMinutes === undefined) return c;
  const mins = c.onBreak ? Math.max(1, Math.floor(breakMinutes!)) : c.minutesPerLevel;
  const dur = mins * 60;
  return { ...c, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}


export function startBreak(c: ClockState, minutes = 5): ClockState {
  const dur = Math.max(1, Math.floor(minutes)) * 60;
  return { ...c, onBreak: true, running: true, remaining: dur, periodEndsAt: Date.now() + dur * 1000 };
}

export function cancelBreak(c: ClockState): ClockState {
  const dur = c.minutesPerLevel * 60;
  return { ...c, onBreak: false, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}

