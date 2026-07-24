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

/** Change the per-level length. Resets the current level's countdown to the new
 *  length (break time is left alone), so the TV reflects it immediately. */
export function setMinutesPerLevel(c: ClockState, minutes: number): ClockState {
  const m = Math.max(1, Math.min(180, Math.floor(minutes)));
  if (c.onBreak) return { ...c, minutesPerLevel: m };
  const dur = m * 60;
  return { ...c, minutesPerLevel: m, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}

export function resetLevel(c: ClockState): ClockState {
  const dur = c.onBreak ? 5 * 60 : c.minutesPerLevel * 60;
  return { ...c, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}

export function startBreak(c: ClockState): ClockState {
  const dur = 5 * 60;
  return { ...c, onBreak: true, running: true, remaining: dur, periodEndsAt: Date.now() + dur * 1000 };
}

export function cancelBreak(c: ClockState): ClockState {
  const dur = c.minutesPerLevel * 60;
  return { ...c, onBreak: false, remaining: dur, periodEndsAt: c.running ? Date.now() + dur * 1000 : null };
}

/** Called by the clock owner (TV) when its local countdown reaches zero. */
export function advanceAfterExpiry(c: ClockState, maxIdx: number): ClockState {
  if (c.onBreak) {
    const dur = c.minutesPerLevel * 60;
    return { ...c, onBreak: false, remaining: dur, periodEndsAt: Date.now() + dur * 1000 };
  }
  if (c.levelIdx + 1 <= maxIdx) {
    const dur = c.minutesPerLevel * 60;
    return { ...c, levelIdx: c.levelIdx + 1, remaining: dur, periodEndsAt: Date.now() + dur * 1000 };
  }
  return { ...c, running: false, remaining: 0, periodEndsAt: null };
}
