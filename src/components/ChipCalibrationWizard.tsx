import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { calibrateDenom } from '../lib/chipCalibration.ts';
import type { Box } from '../lib/chipVision/extract.ts';
import type { ChipCalibration, Lab } from '../lib/chipVision/types.ts';

export function ChipCalibrationWizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { state, dispatch } = useStore();
  const cam = useCameraCapture();
  const denoms = useMemo(() => state.denominations.filter((d) => d.enabled), [state.denominations]);
  const [i, setI] = useState(0);
  const [colors, setColors] = useState<Record<number, Lab>>({});
  const [ratios, setRatios] = useState<number[]>([]);
  const [pendingCount, setPendingCount] = useState(5);

  useEffect(() => { cam.setAutoTorch(true); }, []);
  const denom = denoms[i];

  const guideBox = (c: HTMLCanvasElement): Box => ({ x0: c.width * 0.3, y0: c.height * 0.1, x1: c.width * 0.7, y1: c.height * 0.9 });

  const capture = async () => {
    const frames = await cam.captureBurst(1);
    if (!frames[0]) return;
    const r = await calibrateDenom(frames[0], guideBox(frames[0]), denom.color, pendingCount);
    if (r) {
      setColors((c) => ({ ...c, [denom.value]: r.lab }));
      setRatios((rs) => [...rs, r.ratio]);
    }
    if (i + 1 < denoms.length) { setI(i + 1); setPendingCount(5); }
    else finish({ ...colors, [denom.value]: r?.lab ?? colors[denom.value] }, r ? [...ratios, r.ratio] : ratios);
  };

  const finish = (cols: Record<number, Lab>, rs: number[]) => {
    const ratio = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : undefined;
    const cal: ChipCalibration = { ratio: ratio ?? 3.3 / 39, colors: cols, createdAt: Date.now() };
    dispatch({ type: 'UPDATE_SETTINGS', patch: { chipCalibration: cal } });
    cam.stop(); onClose();
  };

  if (!denom) { onClose(); return null; }

  return (
    <div className="cc-sheet">
      <div className="cc-stage">
        <video className="cc-video" ref={cam.videoRef} playsInline muted />
        <div className="cc-guidebox" style={{ inset: '10% 30%' }} />
        <div className="cc-hint">{t('chipcount.calStep').replace('{value}', String(denom.value))}</div>
      </div>
      <div className="cc-bar" style={{ flexDirection: 'column', gap: 8 }}>
        <label>{t('chipcount.calConfirm').replace('{value}', String(denom.value))}
          <input type="number" min={1} value={pendingCount}
            onChange={(e) => setPendingCount(Math.max(1, +e.target.value))} style={{ width: 64, marginLeft: 8 }} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" disabled={!cam.ready} onClick={capture}>{t('chipcount.capture')}</button>
          <button className="btn btn-ghost" onClick={() => { cam.stop(); onClose(); }}>✕</button>
        </div>
      </div>
    </div>
  );
}
