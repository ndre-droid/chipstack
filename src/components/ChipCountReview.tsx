import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT, useFmt } from '../lib/i18n.ts';
import { ChipSeamEditor } from './ChipSeamEditor.tsx';
import { FLAG_THRESHOLD } from '../lib/chipVision/fuse.ts';
import type { CountResult, StackResult } from '../lib/chipVision/types.ts';
import type { Denomination } from '../types.ts';

interface Row { value: number; count: number; confidence: number; }

export interface ChipCountReviewProps {
  playerId: string;
  shot: HTMLCanvasElement;
  result: CountResult;
  denoms: Denomination[];
  onRetake: () => void;
  onClose: () => void;
}

export function ChipCountReview({ playerId, shot, result, denoms, onRetake, onClose }: ChipCountReviewProps) {
  const t = useT();
  const { num } = useFmt();
  const { dispatch } = useStore();

  // Fallback-path rows (whole-image path, no per-stack detections): mutated directly by the +/- stepper.
  const [rows, setRows] = useState<Row[]>(
    () => result.totals.map((x) => ({ value: x.value, count: x.count, confidence: x.confidence })),
  );

  // Detection path: per-stack state, corrected via the seam editor.
  const [stacks, setStacks] = useState<StackResult[]>(() => result.stacks);
  const [editing, setEditing] = useState<StackResult | null>(null);

  // Paint the captured frame for context. Callback ref (not useEffect keyed on `shot`) so the
  // canvas repaints immediately whenever it (re)mounts — e.g. returning from the seam editor,
  // which remounts this subtree without `shot` itself changing.
  const paintShot = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return;
    c.width = shot.width; c.height = shot.height;
    c.getContext('2d')!.drawImage(shot, 0, 0);
  }, [shot]);

  const colorOf = useMemo(() => {
    const m = new Map<number, string>();
    denoms.forEach((d) => m.set(d.value, d.color));
    return m;
  }, [denoms]);

  // Applies a seam-editor correction to the stack it was opened for, marks it resolved, and closes the editor.
  const applyEdit = (id: string, count: number) => {
    setStacks((ss) => ss.map((s) => (s.id === id ? { ...s, count, confidence: 1, flagged: false } : s)));
    setEditing(null);
  };

  // Full-screen replacement while correcting a flagged stack. Wrapped in the same
  // fixed, full-viewport `.cc-sheet` this component itself renders into below, so
  // the editor's `position: absolute; inset: 0` (Task 6) has a containing block.
  if (editing) {
    return (
      <div className="cc-sheet">
        <ChipSeamEditor stack={editing} onDone={(c) => applyEdit(editing.id, c)} />
      </div>
    );
  }

  const hasStacks = result.stacks.length > 0;

  // Denom rows: summed per value from the live stacks when detection produced any,
  // else the unchanged totals-based fallback rows.
  const derivedRows: Row[] = hasStacks
    ? [...new Set(stacks.map((s) => s.value))].sort((a, b) => a - b).map((value) => {
        const group = stacks.filter((s) => s.value === value);
        return { value, count: group.reduce((n, s) => n + s.count, 0), confidence: Math.min(...group.map((s) => s.confidence)) };
      })
    : rows;

  const total = derivedRows.reduce((s, r) => s + r.value * r.count, 0);
  const blocking = result.anomalies.filter((a) => a.severity === 'blocking');

  const step = (value: number, delta: number) => {
    if (hasStacks) {
      // A manual +/- is the user confirming that stack — clear its flag so the row stops
      // reading as uncertain (prefer the flagged stack of this denom if there is one).
      setStacks((ss) => {
        const idx = ss.findIndex((s) => s.value === value && s.flagged);
        const at = idx >= 0 ? idx : ss.findIndex((s) => s.value === value);
        if (at < 0) return ss;
        const copy = [...ss];
        copy[at] = { ...copy[at], count: Math.max(0, copy[at].count + delta), confidence: 1, flagged: false };
        return copy;
      });
      return;
    }
    setRows((rs) => rs.map((r) => (r.value === value ? { ...r, count: Math.max(0, r.count + delta) } : r)));
  };

  const checkStack = (value: number) => {
    const target = stacks.find((s) => s.value === value && s.flagged) ?? stacks.find((s) => s.value === value);
    if (target) setEditing(target);
  };

  const save = () => {
    dispatch({ type: 'LEDGER_UPDATE', id: playerId, patch: { chips: Math.max(0, Math.round(total)) || undefined } });
    onClose();
  };

  return (
    <div className="cc-sheet">
      <div className="cc-review">
        <canvas ref={paintShot} className="cc-canvas" />

        {result.anomalies.length > 0 && (
          <div className="cc-anoms">
            {result.anomalies.map((a, i) => (
              <div key={i} className={`cc-anom${a.severity === 'blocking' ? ' blocking' : ''}`}>
                {t(`chipcount.anom.${a.code}`)}
              </div>
            ))}
          </div>
        )}

        {derivedRows.map((r) => {
          const uncertain = r.confidence < FLAG_THRESHOLD;
          return (
            <div key={r.value} className={`cc-row${uncertain ? ' low' : ''}`}>
              <span className="cc-swatch" style={{ background: colorOf.get(r.value) ?? '#888' }} />
              <span style={{ flex: 1 }}>
                {r.value}
                {uncertain && hasStacks && (
                  <button className="cc-check-btn" onClick={() => checkStack(r.value)}>⚠ {t('chipcount.checkThis')}</button>
                )}
                {uncertain && !hasStacks && <span className="cc-check">⚠ {t('chipcount.checkThis')}</span>}
              </span>
              <button className="cc-step" onClick={() => step(r.value, -1)}>−</button>
              <span style={{ minWidth: 32, textAlign: 'center' }}>{r.count}</span>
              <button className="cc-step" onClick={() => step(r.value, +1)}>+</button>
              <span style={{ minWidth: 64, textAlign: 'right' }}>{num(r.value * r.count)}</span>
            </div>
          );
        })}

        <div className="cc-total"><span>{t('chipcount.total')}</span><span>{num(total)}</span></div>
      </div>

      <div className="cc-bar">
        <button className="btn btn-ghost" onClick={onRetake}>↺ {t('chipcount.retake')}</button>
        <button className="btn btn-primary" disabled={blocking.length > 0} onClick={save}>{t('chipcount.save')}</button>
      </div>
    </div>
  );
}
