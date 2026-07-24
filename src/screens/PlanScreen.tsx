import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { computeStack, moneyToUnits, rebalance } from '../lib/distribution';
import type { StackResult } from '../lib/distribution';
import { suggestBlindLadder, colorUpEvents } from '../lib/planning';
import type { ColorUpEvent } from '../lib/planning';
import type { Denomination, BlindLevel } from '../types';
import Chip from '../components/Chip';
import { Chip3DStacks } from '../components/chip3d';
import { IconPlus, IconTrash, IconCheck, IconAlert, IconSpark, IconChevron, IconLock, IconShare } from '../components/Icons';
import ShareSheet from '../components/ShareSheet';
import { fmtMoney } from '../lib/money';
import { useT } from '../lib/i18n';

export default function PlanScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { denominations, settings, session, presets } = state;
  const { playerCount, buyIn, earlyRebuys, lateRebuyAmount, blindLevels, smallBias, maxDenoms, useAllChips } = session;

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [startIdx, setStartIdx] = useState(0);
  const [showMins, setShowMins] = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const unit = settings.unitValue;
  const cur = settings.currency;
  const buyInUnits = moneyToUnits(buyIn, unit);
  const lateRebuyUnits = moneyToUnits(lateRebuyAmount || buyIn, unit);
  const numPlayers = playerCount;
  // early rebuys happen at the starting blinds, so the small chips must stretch to cover them too
  const startingStacks = numPlayers + Math.max(0, earlyRebuys);

  const enabledDenoms = useMemo(
    () => [...denominations].filter((d) => d.enabled).sort((a, b) => a.value - b.value),
    [denominations],
  );

  // every owned chip that could go in a stack — the fine-tune editor lets you add any of these
  const editorDenoms = useMemo(
    () =>
      [...denominations]
        .filter((d) => d.enabled && !excluded.has(d.id) && d.value > 0 && d.value <= buyInUnits && d.maxPerPlayer !== 0)
        .sort((a, b) => a.value - b.value),
    [denominations, excluded, buyInUnits],
  );

  const startBlind = blindLevels[Math.min(startIdx, blindLevels.length - 1)] ?? null;

  const starting: StackResult = useMemo(
    () =>
      computeStack(buyInUnits, denominations, {
        smallBias,
        excluded,
        blind: startBlind,
        stacksNeeded: startingStacks,
        maxDenoms,
        useAllChips,
      }),
    [buyInUnits, denominations, smallBias, excluded, startBlind, startingStacks, maxDenoms, useAllChips],
  );

  const laterStages = useMemo(() => {
    const stages: { blind: BlindLevel; stack: StackResult; offset: number }[] = [];
    const later = blindLevels.slice(startIdx + 1);
    let floor = starting.baseValue; // never introduce a chip smaller than an earlier stage used
    later.forEach((bl, i) => {
      const bias = Math.max(0.05, smallBias - 0.22 * (i + 1)); // progressively colour up
      const stack = computeStack(lateRebuyUnits, denominations, {
        smallBias: bias,
        excluded,
        blind: bl,
        stacksNeeded: numPlayers,
        maxDenoms,
        minDenomValue: floor,
        useAllChips,
      });
      floor = Math.max(floor, stack.baseValue);
      stages.push({ blind: bl, offset: i + 1, stack });
    });
    return stages;
  }, [blindLevels, startIdx, smallBias, lateRebuyUnits, denominations, excluded, numPlayers, maxDenoms, starting.baseValue, useAllChips]);

  // ---- Live-adjust editor state ----
  // `edit` holds manual per-denomination counts + which denoms are pinned.
  // Reset back to the auto stack whenever the auto result changes.
  const [edit, setEdit] = useState<{ counts: Record<string, number>; locked: Set<string> } | null>(null);
  useEffect(() => setEdit(null), [starting]);

  const displayCounts = edit?.counts ?? starting.counts;
  const locked = edit?.locked ?? new Set<string>();
  const capOf = (d: Denomination) =>
    Math.min(Math.floor(d.count / Math.max(1, startingStacks)), d.maxPerPlayer ?? Infinity);

  const effUsed = useMemo(
    () => editorDenoms.filter((d) => (displayCounts[d.id] ?? 0) > 0).sort((a, b) => a.value - b.value),
    [editorDenoms, displayCounts],
  );
  const effTotal = editorDenoms.reduce((s, d) => s + (displayCounts[d.id] ?? 0) * d.value, 0);
  const effChips = effUsed.reduce((s, d) => s + displayCounts[d.id], 0);

  const stepDenom = (id: string, delta: number) => {
    const denom = editorDenoms.find((d) => d.id === id);
    if (!denom) return;
    setEdit((prev) => {
      const base = prev
        ? { counts: { ...prev.counts }, locked: new Set(prev.locked) }
        : { counts: { ...starting.counts }, locked: new Set<string>() };
      const cap = capOf(denom);
      base.counts[id] = Math.max(0, Math.min(cap, (base.counts[id] ?? 0) + delta));
      rebalance(base.counts, editorDenoms, buyInUnits, (x) => !base.locked.has(x) && x !== id, capOf);
      return base;
    });
  };

  const toggleLock = (id: string) => {
    setEdit((prev) => {
      const base = prev
        ? { counts: { ...prev.counts }, locked: new Set(prev.locked) }
        : { counts: { ...starting.counts }, locked: new Set<string>() };
      base.locked.has(id) ? base.locked.delete(id) : base.locked.add(id);
      return base;
    });
  };

  const colorUps: ColorUpEvent[] = useMemo(
    () => colorUpEvents(displayCounts, denominations, blindLevels, startIdx, numPlayers),
    [displayCounts, denominations, blindLevels, startIdx, numPlayers],
  );

  const applySuggestedLadder = () => {
    const ladder = suggestBlindLadder(denominations, buyInUnits, {
      targetStartBB: 100,
      // start at the user's preferred default blind if it fits
    });
    if (ladder.length) {
      dispatch({ type: 'UPDATE_SESSION', patch: { blindLevels: ladder } });
      setStartIdx(0);
    }
  };

  const savePreset = () => {
    const sb = startBlind ? ` · ${startBlind.smallBlind}/${startBlind.bigBlind}` : '';
    const name = `${cur}${buyIn} · ${numPlayers}p${sb}`;
    dispatch({ type: 'SAVE_PRESET', name });
  };

  const toggleExcluded = (id: string) => {
    setExcluded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const bb = startBlind?.bigBlind ?? 1;
  const bbCount = bb > 0 ? (effTotal / bb).toFixed(0) : '—';
  const baseDenom = denominations.find((d) => d.value === starting.baseValue);
  const edited = edit !== null;

  return (
    <div>
      {/* ---------------- Top bar: save / share / presets ---------------- */}
      <div className="preset-bar">
        <button className="preset-save" onClick={savePreset}>
          <IconSpark size={14} /> {t('plan.save')}
        </button>
        <button className="preset-save" onClick={() => setShareOpen(true)}>
          <IconShare size={14} /> {t('plan.share')}
        </button>
        <div className="preset-list">
          {presets.length === 0 && <span className="faint" style={{ fontSize: 12, fontWeight: 500 }}>{t('plan.noSavedSetups')}</span>}
          {presets.map((p) => (
            <div className="preset-chip" key={p.id}>
              <button onClick={() => dispatch({ type: 'LOAD_PRESET', id: p.id })}>{p.name}</button>
              <button className="preset-x" onClick={() => dispatch({ type: 'DELETE_PRESET', id: p.id })} aria-label="Delete preset">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ================ RESULT HERO — the answer ================ */}
      <div className="result-hero">
        <div className="hero-eyebrow">{t('plan.eachPlayer')}</div>
        <div className="flex-between" style={{ alignItems: 'flex-end' }}>
          <div className="big-num">
            {effChips} <small>{t('plan.chips')}</small>
          </div>
          <div className="hero-depth">
            <div className="n">
              {bbCount}
              <span> BB</span>
            </div>
            <div className="l">{t('plan.bbDeep')}</div>
          </div>
        </div>
        <div className="hero-sub">
          {fmtMoney(effTotal * unit, cur)} · {effTotal.toLocaleString()} pts · {effUsed.length} {effUsed.length === 1 ? 'denomination' : 'denominations'}
          {edited && <span className="badge-soft" style={{ marginLeft: 8 }}>edited</span>}
        </div>

        <Chip3DStacks denoms={effUsed} counts={displayCounts} />

        {/* small-chip slider — lives with the visual it controls */}
        <div className="hero-slider">
          <div className="hero-slider-head">
            <span>{t('plan.chipMix')}</span>
            <span className="badge-soft">{Math.round(smallBias * 100)}% small</span>
          </div>
          <input
            type="range"
            className="range"
            min={0}
            max={1}
            step={0.05}
            value={smallBias}
            style={{ ['--pct' as string]: `${smallBias * 100}%` }}
            onChange={(e) => dispatch({ type: 'UPDATE_SESSION', patch: { smallBias: +e.target.value } })}
            aria-label="Small-chip emphasis"
          />
          <div className="slider-ends">
            <span>{t('plan.fewerBigger')}</span>
            <span>{t('plan.moreSmall')}</span>
          </div>
        </div>

        {effUsed.length > 0 && effTotal > 0 && (
          <div className="valbar" aria-hidden>
            {effUsed.map((d) => (
              <i
                key={d.id}
                style={{ flexGrow: (displayCounts[d.id] * d.value) / effTotal, background: d.color }}
                title={`${d.value}: ${fmtMoney(displayCounts[d.id] * d.value * unit, cur)}`}
              />
            ))}
          </div>
        )}

        {startBlind && (
          <div className={`blind-check ${starting.blindOk ? 'ok' : 'bad'}`}>
            {baseDenom && <Chip value={baseDenom.value} color={baseDenom.color} accent={baseDenom.accent} size={30} shape={baseDenom.shape} />}
            <div>
              <b>Smallest chip {starting.baseValue}</b>
              <span>
                {starting.blindOk
                  ? ` posts the ${startBlind.smallBlind}/${startBlind.bigBlind} blinds and makes change.`
                  : ` can’t post the ${startBlind.smallBlind}/${startBlind.bigBlind} blinds — add a smaller chip or raise the blinds.`}
              </span>
            </div>
            {starting.blindOk ? <IconCheck size={18} /> : <IconAlert size={18} />}
          </div>
        )}
      </div>

      {/* feasibility */}
      {starting.feasible ? (
        <div className="feas ok">
          <IconCheck size={18} /> {t('plan.enoughChips', { n: numPlayers })}
        </div>
      ) : (
        <div className="feas warn">
          <IconAlert size={18} /> {t('plan.notEnoughChips', { n: numPlayers })}
        </div>
      )}
      {starting.warnings.length > 0 && (
        <ul className="warn-list">
          {starting.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {starting.notes.length > 0 && (
        <ul className="note-list">
          {starting.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {/* live-adjust editor */}
      <div className="section-label">
        {t('plan.fineTune')}
        <span className="hint">{t('plan.fineTuneHint')}</span>
      </div>
      <div className="card adjust-card">
        {editorDenoms.map((d) => {
          const c = displayCounts[d.id] ?? 0;
          const isLocked = locked.has(d.id);
          return (
            <div className={`adjust-row ${isLocked ? 'locked' : ''} ${c === 0 ? 'zero' : ''}`} key={d.id}>
              <button className={`lock-btn ${isLocked ? 'on' : ''}`} onClick={() => toggleLock(d.id)} aria-label="Pin count">
                <IconLock size={14} />
              </button>
              <Chip value={d.value} color={d.color} accent={d.accent} size={28} shape={d.shape} />
              <span className="adjust-val">{d.value}</span>
              <div className="spacer" />
              <div className="stepper sm">
                <button onClick={() => stepDenom(d.id, -1)}>−</button>
                <span className="val">{c}</span>
                <button onClick={() => stepDenom(d.id, 1)}>+</button>
              </div>
            </div>
          );
        })}
        <div className="adjust-foot">
          <span className={effTotal === buyInUnits ? 'bal-ok' : 'bal-bad'}>
            {effTotal === buyInUnits
              ? t('plan.balances')
              : `${effTotal > buyInUnits ? '+' : ''}${(effTotal - buyInUnits).toLocaleString()} pts vs buy-in`}
          </span>
          {edited && (
            <button className="link-btn" onClick={() => setEdit(null)}>
              {t('plan.resetToAuto')}
            </button>
          )}
        </div>
      </div>

      {/* breakdown table */}
      <div className="card mt12">
        <StackTable
          stack={{ ...starting, counts: displayCounts, denomsUsed: effUsed, chipCount: effChips, totalValue: effTotal }}
          stacks={startingStacks}
          unit={unit}
          cur={cur}
        />
      </div>

      {/* later levels & colour-up — collapsed by default (secondary to the starting stack) */}
      {(laterStages.length > 0 || colorUps.length > 0) && (
        <>
          <button className="section-label collapsible-head" onClick={() => setShowLater((v) => !v)}>
            {t('plan.laterColorUp')}
            <span className="hint">{laterStages.length === 1 ? t('plan.laterLevel') : t('plan.laterLevels', { n: laterStages.length })}</span>
            <span className={`chevron ${showLater ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
              <IconChevron size={16} />
            </span>
          </button>
          {showLater && (
            <>
              {laterStages.length > 0 && (
                <>
                  <div className="stage-scroll">
                    {laterStages.map((s) => (
                      <StageCard key={s.blind.id} blind={s.blind} level={startIdx + s.offset + 1} stack={s.stack} />
                    ))}
                  </div>
                  <p className="faint" style={{ fontSize: 12, textAlign: 'center', margin: '6px 8px 0' }}>
                    Rebuys at higher blinds use fewer little chips and more high-value chips.
                  </p>
                </>
              )}
              {colorUps.length > 0 && (
                <>
                  <div className="section-label">
                    {t('plan.colorUpGuide')}
                    <span className="hint">{t('plan.racingOff')}</span>
                  </div>
                  {colorUps.map((e) => (
            <div className="card colorup-card" key={e.blind.id}>
              <div className="colorup-head">
                <span className="lvl">Level {e.levelIndex + 1}</span>
                <span className="blinds">blinds reach {e.blind.smallBlind}/{e.blind.bigBlind}</span>
              </div>
              {e.retirements.map((r) => {
                const fromD = denominations.find((d) => d.id === r.fromId);
                const toD = r.toId ? denominations.find((d) => d.id === r.toId) : undefined;
                return (
                  <div className="retire-row" key={r.fromId}>
                    <div className="retire-trade">
                      {fromD && <Chip value={fromD.value} color={fromD.color} accent={fromD.accent} size={30} shape={fromD.shape} />}
                      <IconChevron size={16} />
                      {toD && <Chip value={toD.value} color={toD.color} accent={toD.accent} size={30} shape={toD.shape} />}
                    </div>
                    <div className="retire-text">
                      <b>Retire the {r.fromValue}s</b>
                      <span>
                        {r.ratioClean
                          ? `trade every ${r.ratio} × ${r.fromValue} for one ${r.toValue}`
                          : `exchange for ${r.toValue} chips`}
                      </span>
                      <div className="retire-nums">
                        {r.tableCount} × {r.fromValue} → <b>{r.bigOut} × {r.toValue}</b>
                        {r.raceChips > 0 && <span className="race-tag">race {r.raceChips} odd</span>}
                      </div>
                      {!r.feasible && r.toId && (
                        <div className="race-warn">You own only {r.bankHave} × {r.toValue} — may fall short.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
                  ))}
                  <p className="faint" style={{ fontSize: 12, textAlign: 'center', margin: '6px 8px 0', lineHeight: 1.5 }}>
                    The race: deal one card per leftover chip; the highest card rounds up to the next chip.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ================ SESSION SETUP — the inputs ================ */}
      <div className="section-label" style={{ marginTop: 26 }}>
        {t('plan.sessionSetup')}
        <span className="hint">{t('plan.updatesLive')}</span>
      </div>

      {/* Players */}
      <div className="card">
        <div className="row">
          <div>
            <div style={{ fontWeight: 600 }}>{t('plan.playersAtTable')}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{t('plan.playersDesc')}</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: numPlayers - 1 })}>−</button>
            <span className="val">{numPlayers}</span>
            <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: numPlayers + 1 })}>+</button>
          </div>
        </div>
      </div>

      {/* Buy-in & rebuys */}
      <div className="card">
        <div className="row">
          <div className="field">
            <label>{t('plan.buyIn')}</label>
            <div className="input-affix">
              <span className="affix">{cur}</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={buyIn || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_SESSION', patch: { buyIn: Math.max(0, +e.target.value) } })}
              />
            </div>
          </div>
          <div className="field">
            <label>{t('plan.laterRebuy')}</label>
            <div className="input-affix">
              <span className="affix">{cur}</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={lateRebuyAmount || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_SESSION', patch: { lateRebuyAmount: Math.max(0, +e.target.value) } })}
              />
            </div>
          </div>
        </div>
        <div className="row mt12">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('plan.earlyRebuys')}</div>
            <div className="faint" style={{ fontSize: 12 }}>Same {fmtMoney(buyIn, cur)} at the starting blinds — they need small chips too.</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => dispatch({ type: 'UPDATE_SESSION', patch: { earlyRebuys: Math.max(0, earlyRebuys - 1) } })}>−</button>
            <span className="val">{earlyRebuys}</span>
            <button onClick={() => dispatch({ type: 'UPDATE_SESSION', patch: { earlyRebuys: earlyRebuys + 1 } })}>+</button>
          </div>
        </div>
        <p className="faint" style={{ fontSize: 12, margin: '12px 2px 0' }}>
          {fmtMoney(buyIn, cur)} = <b style={{ color: 'var(--acc)' }}>{buyInUnits.toLocaleString()} pts</b> · later rebuy {lateRebuyUnits.toLocaleString()} pts · dealing {startingStacks} starting stacks
        </p>
      </div>

      {/* Blinds */}
      <div className="section-label">
        {t('plan.blindLevels')}
        <span className="hint">{t('plan.tapToStart')}</span>
      </div>
      <div className="card">
        {blindLevels.map((b, i) => (
          <div
            className={`blind-row ${i === startIdx ? 'start' : ''}`}
            key={b.id}
            style={{ opacity: i < startIdx ? 0.4 : 1 }}
            onClick={() => setStartIdx(i)}
          >
            <div className="lvl-badge">{i + 1}</div>
            <div className="blind-inputs" onClick={(e) => e.stopPropagation()}>
              <input
                className="mini-input"
                type="number"
                value={b.smallBlind || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { smallBlind: Math.max(0, +e.target.value) } })}
              />
              <span className="x">/</span>
              <input
                className="mini-input"
                type="number"
                value={b.bigBlind || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_BLIND', id: b.id, patch: { bigBlind: Math.max(0, +e.target.value) } })}
              />
              {i === startIdx && <span className="badge-soft" style={{ marginLeft: 6 }}>start</span>}
            </div>
            <button
              className="icon-btn danger"
              style={{ width: 32, height: 32 }}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'REMOVE_BLIND', id: b.id });
              }}
            >
              <IconTrash size={15} />
            </button>
          </div>
        ))}
        <div className="row mt8" style={{ gap: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={applySuggestedLadder}>
            <IconSpark size={15} /> {t('plan.suggest')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'ADD_BLIND' })}>
            <IconPlus size={16} /> {t('plan.level')}
          </button>
        </div>
      </div>

      {/* Distribution options */}
      <div className="section-label">
        <IconSpark size={14} /> {t('plan.distOptions')}
      </div>
      <div className="card">
        <button className="mins-toggle" onClick={() => setShowChips((v) => !v)}>
          <span>
            {t('plan.chipsToUse')}{' '}
            <span className="faint" style={{ fontWeight: 500 }}>· {t('plan.active', { n: enabledDenoms.length - excluded.size })}</span>
          </span>
          <span className={`chevron ${showChips ? 'rot90' : ''}`}>
            <IconChevron size={16} />
          </span>
        </button>
        {showChips && (
          <div className="chip-toggle-row mt8">
            {enabledDenoms.map((d) => (
              <button
                key={d.id}
                className={`chip-toggle ${excluded.has(d.id) ? 'off' : ''}`}
                onClick={() => toggleExcluded(d.id)}
              >
                <Chip value={d.value} color={d.color} accent={d.accent} size={26} shape={d.shape} />
                {d.value}
              </button>
            ))}
          </div>
        )}

        <div className="divider" />
        <div className="row">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('plan.useAllChips')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('plan.useAllDesc')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${useAllChips ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'UPDATE_SESSION', patch: { useAllChips: !useAllChips } })}
            role="switch"
            aria-checked={useAllChips}
          />
        </div>

        <div className="divider" />
        <div className="flex-between">
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>{t('plan.upToTypes')}</label>
            <div className="faint" style={{ fontSize: 12 }}>{t('plan.upToDesc')}</div>
          </div>
          <div className="stepper">
            <button
              onClick={() =>
                dispatch({
                  type: 'UPDATE_SESSION',
                  patch: { maxDenoms: maxDenoms === 0 ? Math.max(2, enabledDenoms.length - 1) : Math.max(2, maxDenoms - 1) },
                })
              }
            >
              −
            </button>
            <span className="val" style={{ fontSize: 15, minWidth: 46 }}>{maxDenoms === 0 ? 'All' : maxDenoms}</span>
            <button
              onClick={() =>
                dispatch({
                  type: 'UPDATE_SESSION',
                  patch: { maxDenoms: maxDenoms === 0 || maxDenoms >= enabledDenoms.length - 1 ? 0 : maxDenoms + 1 },
                })
              }
            >
              +
            </button>
          </div>
        </div>

        <div className="divider" />
        <button className="mins-toggle" onClick={() => setShowMins((v) => !v)}>
          <span>{t('plan.perChipLimits')}</span>
          <span className={`chevron ${showMins ? 'rot90' : ''}`}>
            <IconChevron size={16} />
          </span>
        </button>
        {showMins && (
          <div className="limits-list">
            {enabledDenoms.map((d) => {
              const min = d.minPerPlayer ?? 0;
              const max = d.maxPerPlayer; // undefined = unlimited
              const inStack = displayCounts[d.id] ?? 0;
              const invCap = Math.floor(d.count / Math.max(1, startingStacks));
              const setMax = (nv: number | undefined) =>
                dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { maxPerPlayer: nv, minPerPlayer: nv === undefined ? min : Math.min(min, nv) } });
              return (
                <div className="limit-row" key={d.id}>
                  <Chip value={d.value} color={d.color} accent={d.accent} size={26} shape={d.shape} />
                  <div className="limit-name">
                    <b>{d.value}</b>
                    <small>in stack: {inStack}</small>
                  </div>
                  <div className="spacer" />
                  <div className="limit-ctl">
                    <label>min</label>
                    <div className="min-stepper">
                      <button onClick={() => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { minPerPlayer: Math.max(0, min - 1) } })}>−</button>
                      <span>{min}</span>
                      <button onClick={() => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { minPerPlayer: Math.min(min + 1, max ?? Infinity) } })}>+</button>
                    </div>
                  </div>
                  <div className="limit-ctl">
                    <label>max</label>
                    <div className="min-stepper">
                      <button onClick={() => setMax(max === undefined ? inStack : Math.max(0, max - 1))}>−</button>
                      <span>{max === undefined ? '∞' : max}</span>
                      <button onClick={() => setMax(max === undefined ? undefined : max + 1 >= invCap ? undefined : max + 1)}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {shareOpen && (
        <ShareSheet
          onClose={() => setShareOpen(false)}
          imageRows={effUsed.map((d) => ({ value: d.value, color: d.color, count: displayCounts[d.id], shape: d.shape }))}
          title={`${cur}${buyIn} buy-in`}
          subtitle={`${numPlayers} players${startBlind ? ` · blinds ${startBlind.smallBlind}/${startBlind.bigBlind}` : ''}`}
          totalChips={effChips}
          totalLabel={`${fmtMoney(effTotal * unit, cur)}`}
        />
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StackTable({ stack, stacks, unit, cur }: { stack: StackResult; stacks: number; unit: number; cur: string }) {
  return (
    <table className="dist-table">
      <thead>
        <tr>
          <th>Chip</th>
          <th>Each</th>
          <th>All {stacks}</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {stack.denomsUsed.map((d) => (
          <tr key={d.id}>
            <td>
              <div className="denom-cell">
                <Chip value={d.value} color={d.color} accent={d.accent} size={30} shape={d.shape} />
                <span>{d.value}</span>
              </div>
            </td>
            <td><span className="pill-count">{stack.counts[d.id]}</span></td>
            <td className="muted">{stack.counts[d.id] * stacks}</td>
            <td>{fmtMoney(stack.counts[d.id] * d.value * unit, cur)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{stack.chipCount}</td>
          <td>{stack.chipCount * stacks}</td>
          <td>{fmtMoney(stack.totalValue * unit, cur)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function StageCard({ blind, level, stack }: { blind: BlindLevel; level: number; stack: StackResult }) {
  return (
    <div className="stage-card">
      <div className="stage-head">
        <span className="lvl">Level {level}</span>
        <span className="blinds">{blind.smallBlind}/{blind.bigBlind}</span>
      </div>
      <div className="stage-rows">
        {stack.denomsUsed.length === 0 ? (
          <div className="faint" style={{ fontSize: 12 }}>No stack.</div>
        ) : (
          stack.denomsUsed
            .slice()
            .reverse()
            .map((d: Denomination) => (
              <div className="mini-row" key={d.id}>
                <Chip value={d.value} color={d.color} accent={d.accent} size={24} shape={d.shape} />
                <span>{d.value}</span>
                <span className="m-count">×{stack.counts[d.id]}</span>
              </div>
            ))
        )}
      </div>
      <div className="divider" style={{ margin: '8px 0 0' }} />
      <div className="mini-row stage-total">
        <span>{stack.chipCount} chips</span>
        <span className="m-count">{stack.totalValue.toLocaleString()} pts</span>
      </div>
    </div>
  );
}
