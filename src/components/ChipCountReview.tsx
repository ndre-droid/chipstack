import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT, useFmt } from '../lib/i18n.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [rows, setRows] = useState<Row[]>(
    () => result.totals.map((x) => ({ value: x.value, count: x.count, confidence: x.confidence })),
  );

  // Paint the captured frame for context.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = shot.width; c.height = shot.height;
    c.getContext('2d')!.drawImage(shot, 0, 0);
  }, [shot]);

  const colorOf = useMemo(() => {
    const m = new Map<number, string>();
    denoms.forEach((d) => m.set(d.value, d.color));
    return m;
  }, [denoms]);

  const total = rows.reduce((s, r) => s + r.value * r.count, 0);
  const blocking = result.anomalies.filter((a) => a.severity === 'blocking');

  const setCount = (value: number, delta: number) =>
    setRows((rs) => rs.map((r) => (r.value === value ? { ...r, count: Math.max(0, r.count + delta) } : r)));

  const save = () => {
    dispatch({ type: 'LEDGER_UPDATE', id: playerId, patch: { chips: Math.max(0, Math.round(total)) || undefined } });
    onClose();
  };

  return (
    <div className="cc-sheet">
      <div className="cc-review">
        <canvas ref={canvasRef} className="cc-canvas" />

        {result.anomalies.length > 0 && (
          <div className="cc-anoms">
            {result.anomalies.map((a, i) => (
              <div key={i} className={`cc-anom${a.severity === 'blocking' ? ' blocking' : ''}`}>
                {t(`chipcount.anom.${a.code}`)}
              </div>
            ))}
          </div>
        )}

        {rows.map((r) => (
          <div key={r.value} className={`cc-row${r.confidence < 0.5 ? ' low' : ''}`}>
            <span className="cc-swatch" style={{ background: colorOf.get(r.value) ?? '#888' }} />
            <span style={{ flex: 1 }}>{r.value}</span>
            <button className="cc-step" onClick={() => setCount(r.value, -1)}>−</button>
            <span style={{ minWidth: 32, textAlign: 'center' }}>{r.count}</span>
            <button className="cc-step" onClick={() => setCount(r.value, +1)}>+</button>
            <span style={{ minWidth: 64, textAlign: 'right' }}>{num(r.value * r.count)}</span>
          </div>
        ))}

        <div className="cc-total"><span>{t('chipcount.total')}</span><span>{num(total)}</span></div>
      </div>

      <div className="cc-bar">
        <button className="btn btn-ghost" onClick={onRetake}>↺ {t('chipcount.retake')}</button>
        <button className="btn btn-primary" disabled={blocking.length > 0} onClick={save}>{t('chipcount.save')}</button>
      </div>
    </div>
  );
}
