import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.ts';
import { seamLines } from '../lib/chipVision/seams.ts';
import type { StackResult } from '../lib/chipVision/types.ts';

export function ChipSeamEditor({ stack, onDone }: { stack: StackResult; onDone: (count: number) => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState(Math.max(1, stack.count));
  const [span, setSpan] = useState<[number, number]>(stack.span);
  const [drag, setDrag] = useState<null | 'top' | 'bottom'>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Paint the crop once.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = stack.crop.width; c.height = stack.crop.height;
    c.getContext('2d')!.drawImage(stack.crop, 0, 0);
  }, [stack.crop]);

  const lines = seamLines(span, count);

  // Convert a pointer y within the image box to a 0..1 fraction.
  const fracFromEvent = (clientY: number): number => {
    const r = boxRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag) return;
    const y = fracFromEvent(e.clientY);
    // Near a seam line (within 3%) → remove that chip; else add a chip at the tapped gap.
    const near = lines.some((ly) => Math.abs(ly - y) < 0.03);
    if (near) setCount((c) => Math.max(1, c - 1));
    else if (y > span[0] && y < span[1]) setCount((c) => c + 1);
  };

  const onCapDown = (which: 'top' | 'bottom') => (e: React.PointerEvent) => {
    e.stopPropagation(); setDrag(which);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const y = fracFromEvent(e.clientY);
    setSpan(([tp, bt]) => drag === 'top' ? [Math.min(y, bt - 0.05), bt] : [tp, Math.max(y, tp + 0.05)]);
  };
  const onUp = () => setDrag(null);

  return (
    <div className="cc-editor">
      <div className="cc-editor-hint">{t('chipcount.editHint')}</div>
      <div className="cc-editor-stage" ref={boxRef}
        onPointerDown={onPointerDown} onPointerMove={onMove} onPointerUp={onUp}>
        <canvas ref={canvasRef} className="cc-editor-img" />
        <div className="cc-cap" style={{ top: `${span[0] * 100}%` }} onPointerDown={onCapDown('top')} />
        <div className="cc-cap" style={{ top: `${span[1] * 100}%` }} onPointerDown={onCapDown('bottom')} />
        {lines.map((ly, i) => (
          <div key={i} className="cc-seam" style={{ top: `${ly * 100}%` }} />
        ))}
      </div>
      <div className="cc-editor-bar">
        <span className="cc-editor-count">{t('chipcount.editCount')}: <b>{count}</b></span>
        <button className="btn btn-primary" onClick={() => onDone(count)}>{t('chipcount.editDone')}</button>
      </div>
    </div>
  );
}
