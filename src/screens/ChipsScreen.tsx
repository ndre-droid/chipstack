import { useStore } from '../store';
import Chip from '../components/Chip';
import { IconPlus, IconTrash } from '../components/Icons';
import { useT, useFmt } from '../lib/i18n';

export default function ChipsScreen() {
  const { state, dispatch } = useStore();
  const { denominations, settings } = state;
  const t = useT();
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
                {d.shape === 'plaque' ? 'Plaque' : 'Chip'}
              </button>
            </div>

            <div className="grow">
              <div className="row" style={{ gap: 8 }}>
                <div className="field-inline" style={{ width: 70 }}>
                  <label>Value</label>
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
                  <label>Owned</label>
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
                  <label>Colour</label>
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
                = {fmtMoney(chipMoney, settings.currency)} each · {fmtMoney(d.count * chipMoney, settings.currency)} total
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div
                className={`toggle ${d.enabled ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'UPDATE_DENOM', id: d.id, patch: { enabled: !d.enabled } })}
                role="switch"
                aria-checked={d.enabled}
              />
              <button className="icon-btn danger" onClick={() => dispatch({ type: 'REMOVE_DENOM', id: d.id })} aria-label="Delete">
                <IconTrash size={17} />
              </button>
            </div>
          </div>
        );
      })}

      <button className="btn btn-ghost btn-block mt8" onClick={() => dispatch({ type: 'ADD_DENOM' })}>
        <IconPlus size={18} /> {t('chips.addDenom')}
      </button>

      <p className="faint" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
        The toggle includes / excludes a chip from stacks by default.
        <br />
        Set what 1 chip point is worth in <b>Settings</b>.
      </p>
    </div>
  );
}
