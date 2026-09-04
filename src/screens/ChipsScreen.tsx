import { useState } from 'react';
import { useStore } from '../store';
import Chip from '../components/Chip';
import { IconPlus, IconTrash } from '../components/Icons';
import { useT, useFmt } from '../lib/i18n';
import { Toggle } from '../components/Toggle';
import { useConfirm } from '../components/Confirm';
import { CHIP_SET_PRESETS, denomsFromPreset } from '../lib/chipSetPresets';

export default function ChipsScreen() {
  const { state, dispatch } = useStore();
  const { denominations, settings, chipSets, activeChipSetId } = state;
  const t = useT();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const activeSet = chipSets.find((c) => c.id === activeChipSetId) ?? chipSets[0];
  // One translatable sentence with a {settings} placeholder, split so the bold word
  // lands wherever that language puts it rather than where the markup does.
  const [unitHintBefore, unitHintAfter = ''] = t('chips.unitHint').split('{settings}');
  const { money: fmtMoney } = useFmt();

  const sorted = [...denominations].sort((a, b) => a.value - b.value);
  const active = denominations.filter((d) => d.enabled);
  const totalChips = active.reduce((s, d) => s + d.count, 0);
  const totalValueUnits = active.reduce((s, d) => s + d.count * d.value, 0);
  const totalMoney = totalValueUnits * settings.unitValue;

  return (
    <div>
      <div className="section-label">
        {t('chips.title')}
        <span className="hint">{t('chips.hint')}</span>
      </div>

      {/* A box that came out of a shop has a known contents list — no reason to make
          anyone type nine values, colours and counts before the app can answer. */}
      {presetsOpen && (
        <div className="card preset-sets">
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('chips.presets')}</div>
          <div className="faint" style={{ fontSize: 12, margin: '3px 0 10px' }}>{t('chips.presetHint')}</div>
          {CHIP_SET_PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset-set-row"
              onClick={() => {
                dispatch({
                  type: 'CHIPSET_ADD',
                  name: p.name,
                  denominations: denomsFromPreset(p, () => Math.random().toString(36).slice(2, 9)),
                });
                setPresetsOpen(false);
              }}
            >
              <span className="preset-set-swatches">
                {p.chips.slice(0, 6).map((c, i) => (
                  <i key={i} style={{ background: c.color, borderColor: c.accent }} />
                ))}
              </span>
              <span className="preset-set-text">
                <b>{p.name}</b>
                <span>{p.note}</span>
              </span>
            </button>
          ))}
          <button
            className="btn btn-ghost btn-block btn-sm mt8"
            onClick={() => {
              dispatch({ type: 'CHIPSET_ADD', name: t('chips.newSet') });
              setPresetsOpen(false);
            }}
          >
            {t('chips.newSet')}
          </button>
        </div>
      )}

      {/* More than one box of chips: the Nash set at home, the travel case, a
          friend's set. `denominations` is always the active one — see ChipSet. */}
      <div className="set-bar">
        <div className="set-list">
          {chipSets.map((c) => (
            <button
              key={c.id}
              className={`set-chip ${c.id === activeSet?.id ? 'active' : ''}`}
              onClick={() => {
                dispatch({ type: 'CHIPSET_SELECT', id: c.id });
                setRenaming(false);
              }}
            >
              {c.name}
            </button>
          ))}
          <button className="set-chip add" onClick={() => setPresetsOpen((v) => !v)}>
            <IconPlus size={13} /> {t('chips.newSet')}
          </button>
        </div>
        {activeSet && (
          <div className="set-actions">
            {renaming ? (
              <input
                className="input set-rename"
                defaultValue={activeSet.name}
                autoFocus
                placeholder={t('chips.setNamePlaceholder')}
                onBlur={(e) => {
                  dispatch({ type: 'CHIPSET_RENAME', id: activeSet.id, name: e.target.value });
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                }}
              />
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>{t('chips.renameSet')}</button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => dispatch({ type: 'CHIPSET_ADD', name: `${activeSet.name} 2`, copyActive: true })}
                >
                  {t('chips.copySet')}
                </button>
                {chipSets.length > 1 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      confirm.ask({
                        text: t('chips.removeSetConfirm', { name: activeSet.name }),
                        confirmLabel: t('common.remove'),
                        danger: true,
                        onYes: () => dispatch({ type: 'CHIPSET_REMOVE', id: activeSet.id }),
                      })
                    }
                  >
                    <IconTrash size={13} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex-between">
          <div>
            <div className="faint" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('chips.onTable')}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>
              {fmtMoney(totalMoney, settings.currency)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{totalChips} {t('plan.chips')}</div>
            <div className="faint" style={{ fontSize: 12, fontWeight: 600 }}>
              {t('chips.active', { a: active.length, t: denominations.length })}
            </div>
          </div>
        </div>
      </div>

      {/* Wrapped, so the list can become two columns on a screen with room for
          them — nine cards is a long scroll on a panel that is mostly empty to
          the right. One column everywhere else; see `.denom-list` in
          styles.css. */}
      <div className="denom-list">
        {sorted.map((d) => {
        const chipMoney = d.value * settings.unitValue;
        return (
          <div className={`denom-row ${d.enabled ? '' : 'disabled'}`} key={d.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <Chip value={d.value} color={d.color} accent={d.accent} size={46} shape={d.shape} />
              <button
                className={`shape-pill ${d.shape === 'plaque' ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { shape: d.shape === 'plaque' ? 'chip' : 'plaque' } })}
              >
                {t(d.shape === 'plaque' ? 'chips.plaque' : 'chips.chip')}
              </button>
            </div>

            <div className="grow">
              <div className="row" style={{ gap: 8 }}>
                <div className="field-inline" style={{ width: 70 }}>
                  <label>{t('chips.value')}</label>
                  <input
                    className="mini-input"
                    type="number"
                    inputMode="numeric"
                    value={d.value || ''}
                    onChange={(e) =>
                      dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { value: Math.max(0, +e.target.value) } })
                    }
                  />
                </div>
                <div className="field-inline" style={{ width: 80 }}>
                  <label>{t('chips.owned')}</label>
                  <input
                    className="mini-input"
                    type="number"
                    inputMode="numeric"
                    value={d.count || ''}
                    onChange={(e) =>
                      dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { count: Math.max(0, +e.target.value) } })
                    }
                  />
                </div>
                <div className="field-inline">
                  <label>{t('chips.colour')}</label>
                  <input
                    type="color"
                    value={d.color}
                    onChange={(e) => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { color: e.target.value } })}
                    style={{
                      width: 34,
                      height: 30,
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      background: 'none',
                      padding: 2,
                    }}
                  />
                </div>
              </div>
              <div className="denom-meta">
                {t('chips.eachTotal', {
                  each: fmtMoney(chipMoney, settings.currency),
                  total: fmtMoney(d.count * chipMoney, settings.currency),
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Toggle
                on={d.enabled}
                label={`${d.value}`}
                onChange={() => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { enabled: !d.enabled } })}
              />
              <button className="icon-btn danger" onClick={() => dispatch({ type: 'REMOVE_DENOM', id: d.id })} aria-label={t('common.delete')}>
                <IconTrash size={17} />
              </button>
            </div>
          </div>
        );
        })}
      </div>

      <button className="btn btn-ghost btn-block mt8" onClick={() => dispatch({ type: 'ADD_DENOM' })}>
        <IconPlus size={18} /> {t('chips.addDenom')}
      </button>

      <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
        {t('chips.toggleHint')}
        <br />
        {/* The bold word is placed by the translation, not by the layout: German
            puts "Einstellungen" at a different point in the sentence. */}
        {unitHintBefore}
        <b>{t('nav.settings')}</b>
        {unitHintAfter}
      </p>
      {confirm.node}
    </div>
  );
}
