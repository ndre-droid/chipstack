import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { startBreak, type ClockState } from '../lib/clockLogic';
import { haptic } from '../lib/platform';

/**
 * "Break when the pizza gets here."
 *
 * The existing break setting is "every N levels", which is how a tournament thinks
 * and not how a Friday night does — the thing people actually plan around is a
 * time on the clock. Arms once and clears itself, so it can't ambush the table
 * again next week at the same minute.
 *
 * Rendered wherever the clock is driven, and it fires from there: whichever device
 * owns the countdown is the one that should call the break.
 */
export default function BreakAt({ clock, send }: { clock: ClockState; send: (c: ClockState) => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const breakAt = state.settings.breakAt;
  const breakMins = state.settings.breakMinutes ?? 5;
  const fired = useRef(false);

  useEffect(() => {
    if (!breakAt) {
      fired.current = false;
      return;
    }
    const check = () => {
      if (fired.current || clock.onBreak) return;
      const [h, m] = breakAt.split(':').map((n) => parseInt(n, 10));
      const now = new Date();
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      // only ever fires forwards, and only within a couple of minutes of the time —
      // setting 22:00 at 23:00 should not break instantly
      const late = now.getTime() - target.getTime();
      if (late < 0 || late > 3 * 60_000) return;
      fired.current = true;
      haptic([40, 60, 40]);
      send(startBreak(clock, breakMins));
      dispatch({ type: 'UPDATE_SETTINGS', patch: { breakAt: null } });
    };
    check();
    const h = window.setInterval(check, 15_000);
    return () => window.clearInterval(h);
  }, [breakAt, breakMins, clock, send, dispatch]);

  const setTime = (value: string) =>
    dispatch({ type: 'UPDATE_SETTINGS', patch: { breakAt: /^\d{2}:\d{2}$/.test(value) ? value : null } });

  return (
    <div className="row break-at">
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t('table.breakAt')}</div>
        <div className="faint" style={{ fontSize: 12 }}>
          {breakAt ? t('table.breakAtSet', { time: breakAt }) : t('table.breakAtHint')}
        </div>
      </div>
      <div className="spacer" />
      <input
        type="time"
        className="input break-at-in"
        value={breakAt ?? ''}
        aria-label={t('table.breakAt')}
        onChange={(e) => setTime(e.target.value)}
      />
      {breakAt && (
        <button className="btn btn-ghost btn-sm" onClick={() => setTime('')}>
          {t('table.breakAtClear')}
        </button>
      )}
    </div>
  );
}
