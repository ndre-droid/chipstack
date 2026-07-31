import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { useDeviceTilt, TILT_MIN_DEG, TILT_MAX_DEG } from '../lib/useDeviceTilt.ts';
import { analyzeFrames, type Box } from '../lib/chipVision/index.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
import { ChipCountReview } from './ChipCountReview.tsx';

export interface ChipCountSheetProps { playerId: string; playerName: string; onClose: () => void }

export function ChipCountSheet({ playerId, onClose }: ChipCountSheetProps) {
  const t = useT();
  const { state } = useStore();
  const cam = useCameraCapture();
  const tilt = useDeviceTilt();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Request tilt permission once the sheet mounts.
  useEffect(() => { tilt.request(); cam.setAutoTorch(true); }, []);

  const guideBox = (canvas: HTMLCanvasElement): Box => {
    // Guide inset matches .cc-guidebox (12% vertical, 8% horizontal).
    const w = canvas.width, h = canvas.height;
    return { x0: w * 0.08, y0: h * 0.12, x1: w * 0.92, y1: h * 0.88 };
  };

  const onCapture = async () => {
    setBusy(true);
    try {
      const frames = await cam.captureBurst(3);
      if (frames.length === 0) return;
      const box = guideBox(frames[0]);
      const res = await analyzeFrames(frames, box, state.denominations, state.settings.chipCalibration, []);
      setShot(frames[0]);
      setResult(res);
    } finally { setBusy(false); }
  };

  if (result && shot) {
    return (
      <ChipCountReview
        playerId={playerId} shot={shot} result={result}
        denoms={state.denominations}
        onRetake={() => { setResult(null); setShot(null); }}
        onClose={onClose}
      />
    );
  }

  const hint = tilt.pitchDeg == null ? t('chipcount.guide')
    : tilt.pitchDeg > TILT_MAX_DEG ? t('chipcount.tiltHigh')
    : tilt.pitchDeg < TILT_MIN_DEG ? t('chipcount.tiltLow')
    : t('chipcount.tiltOk');

  // Bubble dot position: map pitch (0..50°) to 10%..90% of the track.
  const dotTop = tilt.pitchDeg == null ? 50
    : Math.max(10, Math.min(90, 90 - (tilt.pitchDeg / 50) * 80));

  const camMsg = cam.error === 'NotAllowedError' || cam.error === 'SecurityError' ? t('chipcount.cameraDenied')
    : cam.error === 'NotReadableError' || cam.error === 'AbortError' ? t('chipcount.cameraBusy')
    : t('chipcount.noCamera');

  return (
    <div className="cc-sheet">
      <div className="cc-stage" ref={stageRef}>
        <video className="cc-video" ref={cam.videoRef} playsInline muted />
        <div className="cc-guidebox" />
        <div className="cc-hint">{cam.ready ? hint : camMsg}</div>
        {!cam.ready && (
          <button className="btn btn-primary cc-enable" onClick={cam.retry}>📷 {t('chipcount.cameraRetry')}</button>
        )}
        <div className="cc-bubble"><div className={`cc-bubble-dot${tilt.inRange ? ' ok' : ''}`} style={{ top: `${dotTop}%` }} /></div>
      </div>
      <div className="cc-bar">
        {cam.torchAvailable && (
          <button className="btn btn-ghost" onClick={cam.toggleTorch}>💡 {t('chipcount.torch')}</button>
        )}
        <button className="cc-shutter" disabled={busy || !cam.ready} onClick={onCapture} aria-label={t('chipcount.capture')} />
        <button className="btn btn-ghost" onClick={() => { cam.stop(); onClose(); }}>✕</button>
      </div>
      {busy && <div className="cc-hint" style={{ top: 'auto', bottom: 90 }}>{t('chipcount.analyzing')}</div>}
    </div>
  );
}
