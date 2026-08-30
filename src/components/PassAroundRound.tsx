import { useEffect, useMemo, useState } from 'react';
import { useBackHandler } from '../lib/backHandler';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { shareStep } from '../lib/stackShare';
import { poolLeft, suggestedShare, difference, settleDifference } from '../lib/passRound';
import { haptic } from '../lib/platform';
import CountStack from './CountStack';
import type { LedgerSnapshot } from '../types';

/**
 * The counting round with the phone going ROUND the table.
 *
 * The slider round assumes one person holding the phone and eyeballing six piles at
 * once. This one assumes the opposite: the phone is put down, picked up by whoever
 * feels like it, and handed on. So it never says "give it to Ben" — it asks "who has
 * the phone?", every name is a button, and a counted name is ticked off but stays
 * tappable, because the wrong one gets picked.
 *
 * One player fills the screen at a time, and their bar takes from the pool nobody has
 * counted yet, so the running table stays honest while the round is going. The last
 * player is NOT silently handed the remainder — they count like everybody else, and
 * whatever gap that leaves is shown at the end rather than swallowed (see
 * lib/passRound.ts).
 */
export default function PassAroundRound({
  levelIdx,
  onClose,
  onUndoable,
  onSwitchStyle,
}: {
  levelIdx?: number | null;
  onClose: () => void;
  onUndoable?: (previous: LedgerSnapshot) => void;
  /** back to the one-person slider round */
  onSwitchStyle: () => void;
}) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { ledger, settings } = state;
  const { unitValue, currency } = settings;

  const players = useMemo(() => ledger.filter((p) => !p.out && !(p.cashOut > 0)), [ledger]);
  const order = useMemo(() => players.map((p) => p.id), [players]);

  const total = moneyToUnits(
    ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0),
    unitValue,
  );
  const step = shareStep(total, unitValue);

  /** what each player said their own pile is worth */
  const [entered, setEntered] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState(0);
  const [exact, setExact] = useState(false);
  const [finishing, setFinishing] = useState(false);
  /** the tick that flashes as the phone changes hands */
  const [flash, setFlash] = useState<string | null>(null);
  const [hintSeen, setHintSeen] = useState(!!settings.countPassHintSeen);

  const stage: 'pick' | 'player' | 'done' = current ? 'player' : finishing ? 'done' : 'pick';
  useBackHandler(stage === 'player', () => setCurrent(null));
  useBackHandler(stage === 'done', () => setFinishing(false));
  useBackHandler(true, onClose);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => () => { dispatch({ type: 'COUNTING_SET', progress: null }); }, [dispatch]);

  const countedSet = useMemo(() => new Set(counted), [counted]);
  /** what is still unclaimed, not counting whatever the player at the machine said last time */
  const pool = poolLeft(total, entered, counted, current ?? undefined);
  /** including the one holding the phone right now */
  const stillToCount = players.filter((p) => !countedSet.has(p.id) || p.id === current).length;

  const open = (id: string) => {
    const before = poolLeft(total, entered, counted, id);
    const left = players.filter((p) => !countedSet.has(p.id) || p.id === id).length;
    setDraft(entered[id] ?? suggestedShare(before, left, step));
    setCurrent(id);
  };

  const take = () => {
    const id = current;
    if (!id) return;
    const p = players.find((x) => x.id === id);
    const nextCounted = counted.includes(id) ? counted : [...counted, id];
    setEntered((e) => ({ ...e, [id]: draft }));
    setCounted(nextCounted);
    setCurrent(null);
    setFlash(p?.name || 'Player');
    haptic([14, 60, 22]);
    // the big screen follows the round: who just counted, and how far it has got
    dispatch({
      type: 'COUNTING_SET',
      progress: {
        index: nextCounted.length,
        total: players.length,
        name: p?.name || 'Player',
        emoji: p?.emoji,
        at: Date.now(),
      },
    });
    if (nextCounted.length >= players.length) setFinishing(true);
  };

  const dismissHint = () => {
    if (hintSeen) return;
    setHintSeen(true);
    dispatch({ type: 'UPDATE_SETTINGS', patch: { countPassHintSeen: true } });
  };

  const commit = (values: Record<string, number>) => {
    const ids = Object.keys(values);
    if (ids.length > 0) {
      onUndoable?.(ledger);
      dispatch({
        type: 'LEDGER_SET_CHIPS_MANY',
        entries: ids.map((id) => ({ id, chips: values[id] > 0 ? values[id] : undefined })),
      });
    }
    onClose();
  };

  const diff = difference(total, entered);
  /** the entry the phone made last — the one a misplaced tap would have ruined */
  const justCounted = counted.length > 0 ? players.find((p) => p.id === counted[counted.length - 1]) : undefined;

  if (players.length === 0 || total <= 0) {
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-body">
          <div className="empty">{players.length === 0 ? t('count.noPlayers') : t('count.nothingOnTable')}</div>
          <button className="btn btn-primary btn-block" onClick={onClose}>{t('count.close')}</button>
        </div>
      </div>
    );
  }

  /* --- one player, the whole screen --- */
  if (stage === 'player' && current) {
    const p = players.find((x) => x.id === current);
    const name = p?.name || 'Player';
    /* The bar runs over the WHOLE table, not just over what is left: everybody counts
       their own pile here, so a player who really is holding more than the pool must
       be able to say so — that gap is the whole point of the card at the end. */
    const barMax = Math.max(step, total, draft);
    const over = draft - pool;
    const pct = barMax > 0 ? (draft / barMax) * 100 : 0;
    const alone = stillToCount <= 1;
    return (
      <div className="cr-sheet pass-sheet" role="dialog" aria-modal="true">
        <div className="cr-head">
          <div className="cr-step">{t('count.passTable')} · {money(total * unitValue, currency)}</div>
          <div className="cr-title pass-who">
            {p?.emoji && <span className="pass-emoji">{p.emoji}</span>}
            {name}
          </div>
          <button className="cr-x icon-btn" onClick={() => setCurrent(null)} aria-label={t('count.close')}>✕</button>
        </div>

        <div className="cr-body pass-body">
          <div className="pass-amount">{money(draft * unitValue, currency)}</div>
          <input
            type="range"
            className="range pass-bar"
            min={0}
            max={barMax}
            step={step}
            value={draft}
            style={{ ['--pct' as string]: `${pct}%` }}
            onChange={(e) => { setDraft(+e.target.value); dismissHint(); }}
            aria-label={t('count.stackOf', { name })}
          />
          <p className={`pass-from ${over > 0 ? 'over' : 'faint'}`}>
            {over > 0
              ? t('count.passOver', { money: money(over * unitValue, currency) })
              : alone
                ? t('count.passRest', { money: money(Math.max(0, pool) * unitValue, currency) })
                : t('count.passFromPool', {
                    money: money(Math.max(0, pool - draft) * unitValue, currency),
                    n: String(stillToCount - 1),
                  })}
          </p>
          {alone && <p className="pass-last faint">{t('count.passLast')}</p>}

          <button className="btn btn-ghost btn-block pass-exact" onClick={() => setExact(true)}>
            📏 {t('count.passExact')}
          </button>

          {!hintSeen && (
            <div className="pass-hint">
              <span>{t('count.passHint')}</span>
              <button className="btn btn-ghost btn-sm" onClick={dismissHint}>{t('count.passHintGot')}</button>
            </div>
          )}
        </div>

        <div className="cr-bar">
          <button className="btn btn-primary btn-block pass-take" onClick={take}>
            {t('count.passTake')}
          </button>
        </div>

        {exact && (
          <CountStack
            playerId={current}
            levelIdx={levelIdx}
            onResult={(units) => { setDraft(units); dismissHint(); }}
            onClose={() => setExact(false)}
          />
        )}
      </div>
    );
  }

  /* --- everybody counted: what the table holds against what was counted --- */
  if (stage === 'done') {
    const countedUnits = total + diff;
    return (
      <div className="cr-sheet pass-sheet" role="dialog" aria-modal="true">
        <div className="cr-head">
          <div className="cr-step">
            {t('count.passProgress', { done: String(counted.length), total: String(players.length) })}
          </div>
          <div className="cr-title">{t('count.passAllDone')}</div>
          <button className="cr-x icon-btn" onClick={() => setFinishing(false)} aria-label={t('count.close')}>✕</button>
        </div>

        <div className="cr-body">
          <div className="pass-sums">
            <div><span>{t('count.passTable')}</span><b>{money(total * unitValue, currency)}</b></div>
            <div><span>{t('count.passCounted')}</span><b>{money(countedUnits * unitValue, currency)}</b></div>
            <div className={`pass-diff ${diff === 0 ? 'ok' : diff > 0 ? 'pos' : 'neg'}`}>
              <span>{t('count.passDiff')}</span>
              <b>{diff === 0 ? '—' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff) * unitValue, currency)}`}</b>
            </div>
          </div>
          {diff !== 0 && <p className="faint cr-note">{t('count.passSpreadNote')}</p>}
        </div>

        <div className="cr-bar">
          {diff !== 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => commit(settleDifference(entered, order, total, step))}
            >
              {t('count.passSpread')}
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => commit(entered)}>
            {diff === 0 ? t('count.finish') : t('count.passKeep')}
          </button>
        </div>
      </div>
    );
  }

  /* --- who has the phone now --- */
  return (
    <div className="cr-sheet pass-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-step">
          {t('count.passProgress', { done: String(counted.length), total: String(players.length) })}
        </div>
        <div className="cr-title">{t('count.whoAreYou')}</div>
        <div className="cr-prev">{t('count.passTable')} {money(total * unitValue, currency)}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        {/* The wrong name gets tapped, and the tap that follows is a number going into
            somebody else's stack. So the last entry stays named, priced and one tap from
            being redone — without moving any of the name buttons under the next thumb. */}
        {justCounted && (
          <button className="pass-recent" onClick={() => open(justCounted.id)}>
            <span className="pass-recent-tick">✓</span>
            <span className="pass-recent-who">
              {t('count.passJust')}: {justCounted.emoji ? `${justCounted.emoji} ` : ''}
              <b>{justCounted.name || 'Player'}</b> · {money((entered[justCounted.id] || 0) * unitValue, currency)}
            </span>
            <span className="pass-recent-edit">{t('count.passChange')}</span>
          </button>
        )}

        <div className="pass-grid">
          {players.map((p) => {
            const done = countedSet.has(p.id);
            return (
              <button
                key={p.id}
                className={`pass-card ${done ? 'done' : ''} ${justCounted?.id === p.id ? 'just' : ''}`}
                onClick={() => open(p.id)}
              >
                <span className="pass-card-emoji">{p.emoji || '🙂'}</span>
                <b>{p.name || 'Player'}</b>
                {done && (
                  <span className="pass-card-state">
                    ✓ {money((entered[p.id] || 0) * unitValue, currency)} · {t('count.passAgain')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button className="mins-toggle cr-all" onClick={onSwitchStyle}>
          <span>{t('count.styleSolo')}</span>
        </button>
      </div>

      <div className="cr-bar">
        <button className="btn btn-ghost" onClick={onClose}>{t('count.close')}</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={counted.length === 0}
          onClick={() => (counted.length >= players.length ? setFinishing(true) : commit(entered))}
        >
          {counted.length >= players.length ? t('count.finish') : t('count.passExit')}
        </button>
      </div>

      {flash && (
        <div className="pass-flash" role="status">
          <span className="pass-flash-tick">✓</span>
          <b>{flash}</b>
        </div>
      )}
    </div>
  );
}
