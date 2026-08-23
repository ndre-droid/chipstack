import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { useBackHandler } from '../lib/backHandler';
import { sidePots } from '../lib/sidePots';
import { raceOff, drawOrder } from '../lib/chipRace';
import MoneyInput from './MoneyInput';
import Chip from './Chip';

/**
 * The two bits of poker arithmetic a home table argues about, on the phone instead
 * of out loud: who can win which pot after an all-in, and what everybody gets back
 * when a chip colour is retired.
 *
 * Both read the roster for names, so nothing has to be typed twice.
 */
export default function TableTools({ onClose }: { onClose: () => void }) {
  const t = useT();
  useBackHandler(true, onClose);
  const [tab, setTab] = useState<'pots' | 'race'>('pots');

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">{t('tools.title')}</div>
        <div className="cr-prev">{t('tools.hint')}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>
      <div className="cr-body">
        <div className="segmented cr-mode">
          <button className={tab === 'pots' ? 'active' : ''} onClick={() => setTab('pots')}>{t('tools.sidePots')}</button>
          <button className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}>{t('tools.chipRace')}</button>
        </div>
        {tab === 'pots' ? <SidePotTool /> : <ChipRaceTool />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ side pots -- */

function SidePotTool() {
  const { state } = useStore();
  const t = useT();
  const { money } = useFmt();
  const cur = state.settings.currency;

  const players = state.ledger.filter((p) => !p.out);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [folded, setFolded] = useState<Set<string>>(new Set());

  const result = useMemo(
    () =>
      sidePots(
        players.map((p) => ({
          id: p.id,
          name: p.name || 'Player',
          committed: amounts[p.id] ?? 0,
          folded: folded.has(p.id),
        })),
      ),
    [players, amounts, folded],
  );

  const anyIn = result.total > 0;

  return (
    <>
      {players.map((p) => (
        <div className="tt-row" key={p.id}>
          <span className="tt-emoji">{p.emoji || '🙂'}</span>
          <span className="tt-name">{p.name || 'Player'}</span>
          <button
            className={`tt-fold ${folded.has(p.id) ? 'on' : ''}`}
            onClick={() =>
              setFolded((prev) => {
                const next = new Set(prev);
                next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                return next;
              })
            }
          >
            {t('tools.folded')}
          </button>
          <div className="input-affix tt-amount">
            <span className="affix">{cur}</span>
            <MoneyInput
              value={amounts[p.id] ?? 0}
              ariaLabel={t('tools.committed')}
              onCommit={(v) => setAmounts((a) => ({ ...a, [p.id]: Math.max(0, v) }))}
            />
          </div>
        </div>
      ))}

      {!anyIn ? (
        <div className="empty" style={{ marginTop: 16 }}>{t('tools.noContenders')}</div>
      ) : (
        <div className="tt-out">
          {result.pots.map((pot) => (
            <div className="tt-pot" key={pot.index}>
              <div className="tt-pot-h">
                <b>{pot.index === 0 ? t('tools.mainPot') : t('tools.sidePot', { n: pot.index })}</b>
                <span className="tt-pot-amt">{money(pot.amount, cur)}</span>
              </div>
              <div className="tt-pot-who">
                <span className="faint">{t('tools.eligible')}:</span> {pot.eligible.join(' · ') || '—'}
              </div>
            </div>
          ))}
          {result.uncalled && (
            <p className="tt-note">{t('tools.backTo', { name: result.uncalled.name, amount: money(result.uncalled.amount, cur) })}</p>
          )}
          <div className="tt-total">{t('tools.potTotal', { amount: money(result.total, cur) })}</div>
          <button className="btn btn-ghost btn-block btn-sm mt8" onClick={() => { setAmounts({}); setFolded(new Set()); }}>
            {t('tools.reset')}
          </button>
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- chip race -- */

function ChipRaceTool() {
  const { state } = useStore();
  const t = useT();
  const { money, num } = useFmt();
  const cur = state.settings.currency;
  const unit = state.settings.unitValue || 0.01;

  const denoms = useMemo(
    () => [...state.denominations].filter((d) => d.enabled && d.value > 0).sort((a, b) => a.value - b.value),
    [state.denominations],
  );
  const players = state.ledger.filter((p) => !p.out);

  const [fromId, setFromId] = useState(denoms[0]?.id ?? '');
  const from = denoms.find((d) => d.id === fromId) ?? denoms[0];
  const bigger = denoms.filter((d) => from && d.value > from.value);
  const [toId, setToId] = useState('');
  const to = bigger.find((d) => d.id === toId) ?? bigger[0];

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [seed, setSeed] = useState(0);

  const order = useMemo(() => {
    void seed; // re-drawing is the point of the button
    return drawOrder(players.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, players.length]);

  const result = useMemo(
    () =>
      from && to
        ? raceOff(
            players.map((p) => ({ id: p.id, name: p.name || 'Player', count: counts[p.id] ?? 0 })),
            from.value,
            to.value,
            order,
          )
        : null,
    [players, counts, from, to, order],
  );

  if (!from || !to) return <div className="empty" style={{ marginTop: 16 }}>{t('tools.noRace')}</div>;

  return (
    <>
      <div className="tt-pick">
        <div className="tt-pick-col">
          <label>{t('tools.retire')}</label>
          <div className="tt-chips">
            {denoms.slice(0, -1).map((d) => (
              <button
                key={d.id}
                className={`tt-chip ${d.id === from.id ? 'active' : ''}`}
                onClick={() => { setFromId(d.id); setToId(''); }}
              >
                <Chip value={d.value} color={d.color} accent={d.accent} shape={d.shape} size={26} />
                <span>{num(d.value)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="tt-pick-col">
          <label>{t('tools.into')}</label>
          <div className="tt-chips">
            {bigger.map((d) => (
              <button key={d.id} className={`tt-chip ${d.id === to.id ? 'active' : ''}`} onClick={() => setToId(d.id)}>
                <Chip value={d.value} color={d.color} accent={d.accent} shape={d.shape} size={26} />
                <span>{num(d.value)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="tt-note">
        {result?.ratioClean
          ? t('tools.ratioClean', { n: num(result.ratio), from: num(from.value), to: num(to.value) })
          : t('tools.ratioMessy', { from: num(from.value), to: num(to.value) })}
      </p>

      <div className="section-label" style={{ marginTop: 6 }}>{t('tools.holding', { value: num(from.value) })}</div>
      {players.map((p) => (
        <div className="tt-row" key={p.id}>
          <span className="tt-emoji">{p.emoji || '🙂'}</span>
          <span className="tt-name">{p.name || 'Player'}</span>
          <div className="stepper tt-step">
            <button onClick={() => setCounts((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))}>−</button>
            <input
              className="tt-count"
              inputMode="numeric"
              value={counts[p.id] ?? 0}
              onChange={(e) => setCounts((c) => ({ ...c, [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
            />
            <button onClick={() => setCounts((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}>+</button>
          </div>
        </div>
      ))}

      {result && result.totalChips > 0 && (
        <div className="tt-out">
          {result.players.map((p) => (
            <div className="tt-race-row" key={p.id}>
              <span className="tt-name">{p.name}</span>
              <span className="tt-race-get">
                {t('tools.exchange')} <b>{p.total}×{num(to.value)}</b>
              </span>
              {p.leftover > 0 && (
                <span className="tt-race-left">
                  {t('tools.race')} {p.leftover}×{num(from.value)}
                  {p.won > 0 && <b className="pos"> · {t('tools.won', { n: p.won })}</b>}
                </span>
              )}
            </div>
          ))}
          <p className="tt-note">
            {t('tools.raceSummary', { n: result.raced, left: money(result.remainderValue * unit, cur) })}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setSeed((s) => s + 1)}>
              🂠 {t('tools.redraw')}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setCounts({})}>
              {t('tools.reset')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
