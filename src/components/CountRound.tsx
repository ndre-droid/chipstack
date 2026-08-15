import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { computeStack, moneyToUnits } from '../lib/distribution';
import type { Denomination, LedgerPlayer } from '../types';

/**
 * The counting round: walk the table player by player and tally each stack by
 * COLOUR (how many of each denomination), so nobody has to add up chip values in
 * their head. Input is chip pieces, the running total is shown in money.
 *
 * Deliberately an overview tool, not an audit — the closing summary compares the
 * counted total against the money on the table and shows the difference as a
 * hint; it never blocks. Everything commits in ONE dispatch at the end, so the
 * live TV gets a single push instead of one per player.
 *
 * Pass `only` to count a single player (the stack value tapped in the roster).
 */
export default function CountRound({ only, onClose }: { only?: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const { denominations, ledger, session, settings } = state;
  const { unitValue, currency } = settings;

  // Who gets counted: still-in players, in table order (busted / cashed-out players
  // have no stack left to count).
  const players = useMemo(
    () => (only ? ledger.filter((p) => p.id === only) : ledger.filter((p) => !p.out && !(p.cashOut > 0))),
    [ledger, only],
  );

  // Default to the colours the starting stack actually uses — that's what is on the
  // table. "Show all colours" falls back to the whole owned inventory.
  const [showAll, setShowAll] = useState(false);
  const stackDenoms = useMemo(() => {
    const stack = computeStack(moneyToUnits(session.buyIn, unitValue), denominations, {
      smallBias: session.smallBias,
      excluded: new Set<string>(),
      blind: session.blindLevels[0] ?? null,
      stacksNeeded: Math.max(1, session.playerCount),
      maxDenoms: session.maxDenoms,
      useAllChips: session.useAllChips,
    });
    return stack.denomsUsed;
  }, [denominations, session, unitValue]);

  const denoms: Denomination[] = showAll || stackDenoms.length === 0
    ? denominations.filter((d) => d.count > 0).slice().sort((a, b) => a.value - b.value)
    : stackDenoms;

  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // playerId → new chip-unit total; only players actually counted appear here
  const [results, setResults] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  const player: LedgerPlayer | undefined = players[idx];
  const currentUnits = denoms.reduce((s, d) => s + (counts[d.id] || 0) * d.value, 0);
  const isLast = idx >= players.length - 1;

  const bump = (id: string, by: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + by) }));

  const goNext = (units: number | null) => {
    const next = units === null ? results : { ...results, [player!.id]: units };
    setResults(next);
    setCounts({});
    if (isLast) setDone(true);
    else setIdx((i) => i + 1);
  };

  /** Money that must be on the table right now = bought in − cashed out. */
  const tableUnits = moneyToUnits(
    ledger.reduce((s, p) => s + (p.buyIn || 0) - (p.cashOut || 0), 0),
    unitValue,
  );

  /** Last player shortcut: whatever the others aren't holding. */
  const restUnits = Math.max(
    0,
    tableUnits -
      ledger
        .filter((p) => p.id !== player?.id && !p.out)
        .reduce((s, p) => s + (results[p.id] ?? p.chips ?? 0), 0),
  );

  const commit = () => {
    const entries = Object.entries(results).map(([id, chips]) => ({ id, chips: chips > 0 ? chips : undefined }));
    if (entries.length) dispatch({ type: 'LEDGER_SET_CHIPS_MANY', entries });
    onClose();
  };

  if (players.length === 0) {
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-body">
          <div className="empty">{t('count.noPlayers')}</div>
          <button className="btn btn-primary btn-block" onClick={onClose}>{t('count.close')}</button>
        </div>
      </div>
    );
  }

  // ---- closing summary: what changed, and does it add up? ----
  if (done) {
    const countedUnits = ledger
      .filter((p) => !p.out)
      .reduce((s, p) => s + (results[p.id] ?? p.chips ?? 0), 0);
    const diff = (countedUnits - tableUnits) * unitValue;
    return (
      <div className="cr-sheet" role="dialog" aria-modal="true">
        <div className="cr-head">
          <div className="cr-title">{t('count.summary')}</div>
        </div>
        <div className="cr-body">
          <div className="cr-sum-list">
            {players.map((p) => {
              const nu = results[p.id];
              return (
                <div className="cr-sum-row" key={p.id}>
                  <span className="cr-sum-name">{p.emoji ? p.emoji + ' ' : ''}{p.name || 'Player'}</span>
                  {nu === undefined ? (
                    <span className="faint">{t('count.skipped')}</span>
                  ) : (
                    <span className="cr-sum-val">
                      <span className="faint">{money((p.chips || 0) * unitValue, currency)} → </span>
                      <b>{money(nu * unitValue, currency)}</b>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cr-check">
            <span>{t('count.onTable')} <b>{money(tableUnits * unitValue, currency)}</b></span>
            <span>{t('count.counted')} <b>{money(countedUnits * unitValue, currency)}</b></span>
            <span className={Math.abs(diff) < 0.005 ? 'faint' : diff > 0 ? 'pos' : 'neg'}>
              {t('count.diff')} {diff > 0 ? '+' : ''}{money(diff, currency)}
            </span>
          </div>
          <p className="faint cr-note">{t('count.diffHint')}</p>
        </div>
        <div className="cr-bar">
          <button className="btn btn-ghost" onClick={() => { setDone(false); setIdx(players.length - 1); }}>
            {t('count.back')}
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={commit}>{t('count.finish')}</button>
        </div>
      </div>
    );
  }

  // ---- one player's stack, tallied by colour ----
  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        {players.length > 1 && (
          <div className="cr-step">{t('count.playerOf', { i: idx + 1, n: players.length })}</div>
        )}
        <div className="cr-title">
          {player!.emoji ? player!.emoji + ' ' : ''}{player!.name || 'Player'}
        </div>
        <div className="cr-prev">
          {t('count.before')} {money((player!.chips || 0) * unitValue, currency)}
        </div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        {denoms.map((d) => (
          <div className="cr-denom" key={d.id}>
            <span className="cr-swatch" style={{ background: d.color, borderColor: d.accent }} />
            <span className="cr-denom-v">{num(d.value)}</span>
            <button className="cr-btn" onClick={() => bump(d.id, -1)} aria-label="−1">−</button>
            <input
              className="input cr-num"
              type="number"
              inputMode="numeric"
              value={counts[d.id] || ''}
              placeholder="0"
              onChange={(e) => setCounts((c) => ({ ...c, [d.id]: Math.max(0, Math.floor(+e.target.value)) }))}
            />
            <button className="cr-btn" onClick={() => bump(d.id, 1)}>+1</button>
            <button className="cr-btn wide" onClick={() => bump(d.id, 20)}>+20</button>
            <span className="cr-denom-sum">{num((counts[d.id] || 0) * d.value)}</span>
          </div>
        ))}

        <button className="mins-toggle cr-all" onClick={() => setShowAll((v) => !v)}>
          <span>{showAll ? t('count.stackColours') : t('count.allColours')}</span>
        </button>

        <div className="cr-total">
          <span>{num(currentUnits)} {t('plan.chips').toLowerCase()}</span>
          <b>{money(currentUnits * unitValue, currency)}</b>
        </div>

        {isLast && players.length > 1 && (
          <button
            className="btn btn-ghost btn-block btn-sm"
            onClick={() => goNext(restUnits)}
            title={t('count.restHint')}
          >
            {t('count.rest')} {money(restUnits * unitValue, currency)}
          </button>
        )}
      </div>

      <div className="cr-bar">
        <button className="btn btn-ghost" onClick={() => goNext(null)}>{t('count.skip')}</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={currentUnits <= 0}
          onClick={() => {
            if (only) {
              dispatch({ type: 'LEDGER_UPDATE', id: player!.id, patch: { chips: currentUnits } });
              onClose();
            } else goNext(currentUnits);
          }}
        >
          {only ? t('count.save') : isLast ? t('count.toSummary') : t('count.next')}
        </button>
      </div>
    </div>
  );
}
