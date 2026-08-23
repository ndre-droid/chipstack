/**
 * The late-registration window.
 *
 * "Can I still buy in?" is asked every single night, usually of the one person who
 * has to work out which level it is and how long is left. This turns the answer
 * into a line on the screen everybody is already looking at.
 */
export interface LateRegState {
  /** the window is configured at all */
  enabled: boolean;
  open: boolean;
  /** minutes left in the window, rounded up — null when it is closed or off */
  minutesLeft: number | null;
  /** true while the last level of the window is running */
  lastLevel: boolean;
}

/**
 * @param lateRegLevels last level people can buy in during (1-based); 0 = off
 * @param levelIdx      current level, 0-based
 * @param secondsLeft   seconds left in the current level
 * @param minutesPerLevel length of a level
 */
export function lateRegState(
  lateRegLevels: number,
  levelIdx: number,
  secondsLeft: number,
  minutesPerLevel: number,
): LateRegState {
  if (!lateRegLevels || lateRegLevels <= 0) return { enabled: false, open: false, minutesLeft: null, lastLevel: false };
  const current = levelIdx + 1;
  if (current > lateRegLevels) return { enabled: true, open: false, minutesLeft: null, lastLevel: false };
  const fullLevelsAfterThisOne = Math.max(0, lateRegLevels - current);
  const minutes = Math.ceil(secondsLeft / 60) + fullLevelsAfterThisOne * Math.max(1, minutesPerLevel);
  return { enabled: true, open: true, minutesLeft: minutes, lastLevel: fullLevelsAfterThisOne === 0 };
}
