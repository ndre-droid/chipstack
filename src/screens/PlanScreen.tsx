import { useEffect, useMemo, useState, useTransition } from 'react';
import { useStore } from '../store';
import { computeStack, moneyToUnits, rebalance } from '../lib/distribution';
import type { StackResult } from '../lib/distribution';
import { autoStartingStack, activeOverride, excludedSetOf, handoutAmountOf, handoutLevelOf, handoutStack, stackBasisKey, stacksNeededOf } from '../lib/startingStack';
import { suggestBlindLadder, colorUpEvents, ladderForDuration } from '../lib/planning';
import type { ColorUpEvent } from '../lib/planning';
import type { Denomination, BlindLevel } from '../types';
import Chip from '../components/Chip';
import ChipStackViz from '../components/ChipStackViz';
import { IconPlus, IconTrash, IconCheck, IconAlert, IconSpark, IconChevron, IconLock, IconShare } from '../components/Icons';
import ShareSheet from '../components/ShareSheet';
import Panes from '../components/Panes';
import { useT, useFmt } from '../lib/i18n';
import { Toggle } from '../components/Toggle';
import MoneyInput from '../components/MoneyInput';
import StackTuner from '../components/StackTuner';

export default function PlanScreen() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money: fmtMoney, num } = useFmt();
  const { denominations, settings, session, presets } = state;
  const { playerCount, buyIn, earlyRebuys, lateRebuyAmount, blindLevels, smallBias, maxDenoms, useAllChips } = session;

  // Stack shaping lives in `session` (and therefore in LiveData), not in local
  // state — otherwise the tuned stack never reaches the TV. See lib/startingStack.ts.
  const excluded = useMemo(() => excludedSetOf(session), [session]);
  const startIdx = Math.min(session.startLevelIdx, Math.max(0, session.blindLevels.length - 1));
  const setStartIdx = (i: number) => dispatch({ type: 'UPDATE_SESSION', patch: { startLevelIdx: i } });
  /* The chip-mix slider drives the whole screen — the stacks, the table, the later
     stages — so it keeps its own draft value and lives in its own component (see
     ChipMixSlider at the bottom of this file). All this screen does is take the value
     once the finger has spoken. */
  const moveBias = (v: number) => dispatch({ type: 'UPDATE_SESSION', patch: { smallBias: v } });

  const [showMins, setShowMins] = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [durationPick, setDurationPick] = useState<number | null>(null);

  const unit = settings.unitValue;
  const cur = settings.currency;
  // Cash game: blinds are fixed, so there's no ladder to climb or colour-up to plan.
  const isCash = settings.gameMode === 'cash';
  const buyInUnits = moneyToUnits(buyIn, unit);
  const lateRebuyUnits = moneyToUnits(lateRebuyAmount || buyIn, unit);
  const numPlayers = playerCount;
  const rosterSeated = state.ledger.length > 0;
  // early rebuys happen at the starting blinds, so the small chips must stretch to cover them too
  const startingStacks = stacksNeededOf(session);

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
    () => autoStartingStack(denominations, session, unit),
    [denominations, session, unit],
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

  // ---- Live-adjust editor ----
  // The manual counts are persisted in `session.stackOverride` (so they sync to
  // the TV); they carry a signature of the inputs they were tuned against and
  // are ignored once those change, which replaces the old "reset on recompute"
  // effect. Only the pin/lock marks stay local — they're an editing aid.
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const override = useMemo(() => activeOverride(denominations, session, unit), [denominations, session, unit]);
  const displayCounts = override ?? starting.counts;

  const setOverride = (counts: Record<string, number> | null) =>
    dispatch({
      type: 'UPDATE_SESSION',
      patch: { stackOverride: counts ? { key: stackBasisKey(denominations, session, unit), counts } : null },
    });

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
    const counts = { ...displayCounts };
    const cap = capOf(denom);
    counts[id] = Math.max(0, Math.min(cap, (counts[id] ?? 0) + delta));
    rebalance(counts, editorDenoms, buyInUnits, (x) => !locked.has(x) && x !== id, capOf);
    setOverride(counts);
  };

  const toggleLock = (id: string) => {
    setLocked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const colorUps: ColorUpEvent[] = useMemo(
    () => colorUpEvents(displayCounts, denominations, blindLevels, startIdx, numPlayers),
    [displayCounts, denominations, blindLevels, startIdx, numPlayers],
  );

  /* The other way round: say how long the night should run and let the app pick both
     the ladder and the level length. The onboarding asks this once; this is where it
     lives afterwards, because "we have until midnight" is a thing that changes. */
  const applyDuration = (hours: number) => {
    const plan = ladderForDuration(denominations, buyInUnits, hours * 60, {
      breakMinutes: settings.breakMinutes,
      breakEvery: settings.breakEvery,
    });
    if (!plan.levels.length) return;
    dispatch({ type: 'UPDATE_SESSION', patch: { blindLevels: plan.levels, startLevelIdx: 0, stackOverride: null } });
    dispatch({ type: 'UPDATE_SETTINGS', patch: { minutesPerLevel: plan.minutesPerLevel } });
    setDurationPick(hours);
  };

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
    const n = new Set(excluded);
    n.has(id) ? n.delete(id) : n.add(id);
    dispatch({ type: 'UPDATE_SESSION', patch: { excludedDenoms: [...n] } });
  };

  /* ---- The one stack card, tuned ----
     The Plan tab used to show exactly one thing: the buy-in stack at the starting
     blinds. The Table tab showed a second, differently-built one for mid-game
     handouts, and the two drifted apart in the user's head as "two chip stacks".
     They are one card now (see `StackTuner`, shared with components/StartingStack),
     and this is the Plan tab's half of it: dial the amount up to €45 and the level
     up to 7 and the hero shows THAT stack, built for those blinds.

     The plan itself does not move. Everything below the hero — the fine-tune editor,
     the feasibility check, the colour-up guide — is about the night as planned, so
     while the card is tuned to something else it is folded away behind one line
     rather than left on screen answering a question nobody asked. */
  const tunedAmount = handoutAmountOf(session);
  const tunedLevelIdx = handoutLevelOf(session, null);
  const tuned = Math.abs(tunedAmount - buyIn) >= 0.005 || tunedLevelIdx !== startIdx;
  const tunedStack = useMemo(
    () => (tuned ? handoutStack(denominations, session, unit, tunedAmount, null) : null),
    [tuned, denominations, session, unit, tunedAmount],
  );
  const heroUsed = tunedStack ? tunedStack.denomsUsed : effUsed;
  const heroCounts = tunedStack ? tunedStack.counts : displayCounts;
  const heroTotal = tunedStack ? tunedStack.totalValue : effTotal;
  const heroChips = tunedStack ? tunedStack.chipCount : effChips;
  const heroBlind = blindLevels[Math.min(tunedLevelIdx, Math.max(0, blindLevels.length - 1))] ?? startBlind;
  const heroBaseValue = tunedStack ? tunedStack.baseValue : starting.baseValue;
  const heroBlindOk = tunedStack ? tunedStack.blindOk : starting.blindOk;

  const bb = heroBlind?.bigBlind ?? 1;
  const bbCount = bb > 0 ? (heroTotal / bb).toFixed(0) : '—';
  const baseDenom = denominations.find((d) => d.value === heroBaseValue);
  const edited = override !== null;

  return (
    <div>
      {/* The answer on the left, the questions on the right — a plan and the
          inputs that made it, side by side once there is room. Contiguous, so
          a phone still reads result-then-inputs top to bottom. */}
      <Panes
        left={
          <>
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
                  <button className="preset-x" onClick={() => dispatch({ type: 'DELETE_PRESET', id: p.id })} aria-label={t('plan.deletePreset')}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* ================ RESULT HERO — the answer ================ */}
          <div className="result-hero">
            <div className="hero-eyebrow">
              {tuned ? t('table.handoutTitle') : t('plan.eachPlayer')}
            </div>
            <div className="flex-between" style={{ alignItems: 'flex-end' }}>
              <div className="big-num">
                {heroChips} <small>{t('plan.chips')}</small>
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
              {fmtMoney(heroTotal * unit, cur)} · {num(heroTotal)} pts · {heroUsed.length}{' '}
              {t(heroUsed.length === 1 ? 'plan.denomOne' : 'plan.denomMany')}
              {edited && !tuned && <span className="badge-soft" style={{ marginLeft: 8 }}>{t('plan.edited')}</span>}
            </div>

            <ChipStackViz denoms={heroUsed} counts={heroCounts} surface="plan" roomyChipSize={104} />

            {/* small-chip slider — lives with the visual it controls. It shapes the PLAN,
                so it steps aside while the card is showing some other amount: a mid-game
                handout is deliberately built with the fewest chips, not with this. */}
            {!tuned && <ChipMixSlider value={smallBias} onChange={moveBias} />}

            {heroUsed.length > 0 && heroTotal > 0 && (
              <div className="valbar" aria-hidden>
                {heroUsed.map((d) => (
                  <i
                    key={d.id}
                    style={{ flexGrow: ((heroCounts[d.id] ?? 0) * d.value) / heroTotal, background: d.color }}
                    title={`${d.value}: ${fmtMoney((heroCounts[d.id] ?? 0) * d.value * unit, cur)}`}
                  />
                ))}
              </div>
            )}

            {/* How much, and for which blinds — the same control the Table tab carries. */}
            <StackTuner />

            {heroBlind && (
              <div className={`blind-check ${heroBlindOk ? 'ok' : 'bad'}`}>
                {baseDenom && <Chip value={baseDenom.value} color={baseDenom.color} accent={baseDenom.accent} size={30} shape={baseDenom.shape} />}
                <div>
                  <b>{t('plan.smallestChip', { v: heroBaseValue })}</b>
                  <span>
                    {t(heroBlindOk ? 'plan.blindOk' : 'plan.blindBad', {
                      sb: heroBlind.smallBlind,
                      bb: heroBlind.bigBlind,
                    })}
                  </span>
                </div>
                {heroBlindOk ? <IconCheck size={18} /> : <IconAlert size={18} />}
              </div>
            )}
          </div>

          {/* The card is showing something other than the plan's own stack: say so once,
              and keep the plan's analysis out of the way until it comes back. */}
          {tuned && (
            <div className="tuned-note">
              {t('plan.tunedNote', { amount: fmtMoney(tunedAmount, cur), n: tunedLevelIdx + 1 })}
            </div>
          )}

          {/* Plan-only from here down: it all describes the buy-in stack at the starting
              blinds, so a card tuned to a €45 top-up folds it away rather than pairing a
              €45 picture with a €20 analysis. */}
          {!tuned && (
            <>
          {/* feasibility */}
          {/* Not "you can't do this" but "here is the shopping list" — the number of
              chips to buy is a question the app can answer and the user cannot. */}
          {!starting.feasible && starting.shortfall.length > 0 && (
            <div className="card missing-card">
              <div className="section-label" style={{ margin: '0 0 8px' }}>
                {t('plan.missing')}
                <span className="hint">{t('plan.missingHint', { n: startingStacks })}</span>
              </div>
              {starting.shortfall.map((sf) => {
                const d = denominations.find((x) => x.id === sf.denomId);
                return (
                  <div className="missing-row" key={sf.denomId}>
                    {d && <Chip value={d.value} color={d.color} accent={d.accent} shape={d.shape} size={26} />}
                    <span className="missing-txt">{t('plan.missingRow', { n: sf.missing, value: num(sf.value) })}</span>
                    <span className="missing-have">{sf.have} / {sf.needed}</span>
                  </div>
                );
              })}
              <p className="faint" style={{ fontSize: 12, margin: '10px 2px 0' }}>
                {t('plan.missingBuy', { n: starting.shortfall.reduce((s2, sf) => s2 + sf.missing, 0) })}
              </p>
            </div>
          )}

          {starting.feasible ? (
            <div className="feas ok">
              <IconCheck size={18} /> {t('plan.enoughChips', { n: startingStacks })}
            </div>
          ) : (
            <div className="feas warn">
              <IconAlert size={18} /> {t('plan.notEnoughChips', { n: startingStacks })}
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
                  <button className={`lock-btn ${isLocked ? 'on' : ''}`} onClick={() => toggleLock(d.id)} aria-label={t('plan.pinCount')}>
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
                  : `${effTotal > buyInUnits ? '+' : ''}${num(effTotal - buyInUnits)} pts vs buy-in`}
              </span>
              {edited && (
                <button className="link-btn" onClick={() => setOverride(null)}>
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
          {!isCash && (laterStages.length > 0 || colorUps.length > 0) && (
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
            </>
          )}

          </>
        }
        right={
          <>
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
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {rosterSeated ? t('plan.playersFromRoster') : t('plan.playersDesc')}
                </div>
              </div>
              <div className="spacer" />
              {/* Once people are actually seated the roster owns this number — two places
                  to edit it meant planning chips for four while six played. */}
              {rosterSeated ? (
                <div className="plan-count-locked">
                  <b>{numPlayers}</b>
                  <span>{t('plan.atTable')}</span>
                </div>
              ) : (
                <div className="stepper">
                  <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: numPlayers - 1 })}>−</button>
                  <span className="val">{numPlayers}</span>
                  <button onClick={() => dispatch({ type: 'SET_PLAYER_COUNT', n: numPlayers + 1 })}>+</button>
                </div>
              )}
            </div>
          </div>

          {/* Buy-in & rebuys */}
          <div className="card">
            <div className="row">
              <div className="field">
                <label>{t('plan.buyIn')}</label>
                <div className="input-affix">
                  <span className="affix">{cur}</span>
                  <MoneyInput
                    value={buyIn || 0}
                    ariaLabel={t('plan.buyIn')}
                    onCommit={(v) => dispatch({ type: 'UPDATE_SESSION', patch: { buyIn: Math.max(0, v) } })}
                  />
                </div>
              </div>
              <div className="field">
                <label>{t('plan.laterRebuy')}</label>
                <div className="input-affix">
                  <span className="affix">{cur}</span>
                  <MoneyInput
                    value={lateRebuyAmount || 0}
                    ariaLabel={t('plan.laterRebuy')}
                    onCommit={(v) => dispatch({ type: 'UPDATE_SESSION', patch: { lateRebuyAmount: Math.max(0, v) } })}
                  />
                </div>
              </div>
            </div>
            <div className="row mt12">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t('plan.earlyRebuys')}</div>
                <div className="faint" style={{ fontSize: 12 }}>{t('plan.earlyRebuysHint', { amount: fmtMoney(buyIn, cur) })}</div>
              </div>
              <div className="spacer" />
              <div className="stepper">
                <button onClick={() => dispatch({ type: 'UPDATE_SESSION', patch: { earlyRebuys: Math.max(0, earlyRebuys - 1) } })}>−</button>
                <span className="val">{earlyRebuys}</span>
                <button onClick={() => dispatch({ type: 'UPDATE_SESSION', patch: { earlyRebuys: earlyRebuys + 1 } })}>+</button>
              </div>
            </div>
            <p className="faint" style={{ fontSize: 12, margin: '12px 2px 0' }}>
              {t('plan.buyInSummary', {
                amount: fmtMoney(buyIn, cur),
                units: num(buyInUnits),
                rebuy: num(lateRebuyUnits),
                stacks: startingStacks,
              })}
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
                  {i === startIdx && <span className="badge-soft" style={{ marginLeft: 6 }}>{t('plan.startBadge')}</span>}
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
            {/* Length-first: the question a host actually has an answer to. */}
            {!isCash && (
              <div className="dur-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t('plan.forDuration')}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {durationPick
                      ? t('plan.durationResult', {
                          levels: blindLevels.length,
                          mins: settings.minutesPerLevel,
                          total: t('onboard.hours', { n: durationPick }),
                        })
                      : t('plan.forDurationHint')}
                  </div>
                </div>
                <div className="spacer" />
                <div className="dur-picks">
                  {[2, 3, 4, 5].map((h) => (
                    <button
                      key={h}
                      className={`dur-pick ${durationPick === h ? 'active' : ''}`}
                      onClick={() => applyDuration(h)}
                    >
                      {t('onboard.hours', { n: h })}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              <Toggle
                on={useAllChips}
                label={t('plan.useAllChips')}
                onChange={() => dispatch({ type: 'UPDATE_SESSION', patch: { useAllChips: !useAllChips } })}
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
          </>
        }
      />


      {shareOpen && (
        <ShareSheet
          onClose={() => setShareOpen(false)}
          imageRows={effUsed.map((d) => ({ value: d.value, color: d.color, count: displayCounts[d.id], shape: d.shape }))}
          title={t('plan.shareTitle', { amount: fmtMoney(buyIn, cur) })}
          subtitle={
            t('plan.sharePlayers', { n: numPlayers }) +
            (startBlind ? t('plan.shareBlinds', { sb: startBlind.smallBlind, bb: startBlind.bigBlind }) : '')
          }
          totalChips={effChips}
          totalLabel={`${fmtMoney(effTotal * unit, cur)}`}
        />
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StackTable({ stack, stacks, unit, cur }: { stack: StackResult; stacks: number; unit: number; cur: string }) {
  const t = useT();
  const { money: fmtMoney } = useFmt();
  return (
    <table className="dist-table">
      <thead>
        <tr>
          <th>{t('plan.tblChip')}</th>
          <th>{t('plan.tblEach')}</th>
          <th>{t('plan.tblAll', { n: stacks })}</th>
          <th>{t('plan.tblValue')}</th>
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
          <td>{t('plan.tblTotal')}</td>
          <td>{stack.chipCount}</td>
          <td>{stack.chipCount * stacks}</td>
          <td>{fmtMoney(stack.totalValue * unit, cur)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function StageCard({ blind, level, stack }: { blind: BlindLevel; level: number; stack: StackResult }) {
  const t = useT();
  const { num } = useFmt();
  return (
    <div className="stage-card">
      <div className="stage-head">
        <span className="lvl">{t('plan.stageLevel', { n: level })}</span>
        <span className="blinds">{blind.smallBlind}/{blind.bigBlind}</span>
      </div>
      <div className="stage-rows">
        {stack.denomsUsed.length === 0 ? (
          <div className="faint" style={{ fontSize: 12 }}>{t('plan.noStack')}</div>
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
        <span className="m-count">{num(stack.totalValue)} pts</span>
      </div>
    </div>
  );
}

/**
 * The chip-mix slider, holding its own draft value.
 *
 * The thumb has to answer the finger, and what it controls — the spread, the stack
 * table, every later stage — is the most expensive thing on the Plan screen to
 * redraw. Keeping the draft HERE is what separates the two: moving the thumb
 * re-renders these few elements and nothing else, while the store update that redraws
 * the rest goes out in a transition, which React is free to interrupt and to
 * coalesce. Held on the screen itself, every step of a drag re-rendered the whole
 * screen twice — once for the thumb and once for the stacks.
 *
 * The value itself still belongs in `session` (and therefore in LiveData), not in
 * local state, or the tuned mix never reaches the TV — see lib/startingStack.ts. The
 * draft is dropped once nothing is pending, so anything else that sets the mix — a
 * preset, the TV — takes the slider back.
 */
function ChipMixSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useT();
  const [draft, setDraft] = useState<number | null>(null);
  const [pending, startBias] = useTransition();
  const shown = draft ?? value;

  useEffect(() => {
    if (!pending) setDraft(null);
  }, [pending]);

  const move = (v: number) => {
    setDraft(v);
    startBias(() => onChange(v));
  };

  return (
    <div className="hero-slider">
      <div className="hero-slider-head">
        <span>{t('plan.chipMix')}</span>
        <span className="badge-soft">{t('plan.pctSmall', { n: Math.round(shown * 100) })}</span>
      </div>
      <input
        type="range"
        className="range"
        min={0}
        max={1}
        step={0.05}
        value={shown}
        style={{ ['--pct' as string]: `${shown * 100}%` }}
        onChange={(e) => move(+e.target.value)}
        aria-label={t('plan.smallEmphasis')}
      />
      <div className="slider-ends">
        <span>{t('plan.fewerBigger')}</span>
        <span>{t('plan.moreSmall')}</span>
      </div>
    </div>
  );
}
