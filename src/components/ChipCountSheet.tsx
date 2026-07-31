import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { useDeviceTilt, TILT_MIN_DEG, TILT_MAX_DEG } from '../lib/useDeviceTilt.ts';
import { analyzeFrames, type Box } from '../lib/chipVision/index.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
import { ChipCountReview } from './ChipCountReview.tsx';

export interface ChipCountSheetProps { playerId: string; playerName: string; onClose: () => void }

// True after the first successful analysis this session, so the "first time,
// preparing the vision engine" hint only shows while the ~15 MB engine loads once.
let engineWarmed = false;

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

export function ChipCountSheet({ playerId, onClose }: ChipCountSheetProps) {
  const t = useT();
  const { state } = useStore();
  const cam = useCameraCapture();
  const tilt = useDeviceTilt();
  const [result, setResult] = useState<CountResult | null>(null);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState<HTMLCanvasElement | null>(null); // frozen frame shown while analyzing / on error
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const frozenRef = useRef<HTMLCanvasElement | null>(null);

  // Request tilt permission + arm auto-torch once the sheet mounts.
  useEffect(() => { tilt.request(); cam.setAutoTorch(true); }, []);

  // Paint the frozen frame while analyzing / on error, so the user sees exactly
  // what was shot (calorie-app style) instead of a black screen.
  useEffect(() => {
    const c = frozenRef.current;
    if (c && captured) {
      c.width = captured.width;
      c.height = captured.height;
      c.getContext('2d')!.drawImage(captured, 0, 0);
    }
  }, [captured]);

  const guideBox = (canvas: HTMLCanvasElement): Box => {
    // Guide inset matches .cc-guidebox (12% vertical, 8% horizontal).
    const w = canvas.width, h = canvas.height;
    return { x0: w * 0.08, y0: h * 0.12, x1: w * 0.92, y1: h * 0.88 };
  };

  const onCapture = async () => {
    if (!cam.ready || analyzing) return;
    navigator.vibrate?.(30);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 280);

    const frames = await cam.captureBurst(3);
    if (frames.length === 0) return; // no frame yet — let them tap again

    setCaptured(frames[0]); // freeze the shot on screen
    cam.stop();             // close the live camera (battery + privacy)
    setAnalyzing(true);
    setAnalyzeErr(null);
    try {
      const box = guideBox(frames[0]);
      const res = await withTimeout(
        analyzeFrames(frames, box, state.denominations, state.settings.chipCalibration, []),
        45000,
        t('chipcount.timedOut'),
      );
      if (res.totals.length === 0 && res.anomalies.length === 0) {
        setAnalyzeErr(t('chipcount.noChips'));
        return;
      }
      engineWarmed = true;
      setShot(frames[0]);
      setResult(res);
    } catch (e: any) {
      setAnalyzeErr(e?.message || t('chipcount.analyzeFailed'));
    } finally {
      setAnalyzing(false);
    }
  };

  const retake = () => {
    setAnalyzeErr(null);
    setResult(null);
    setShot(null);
    setCaptured(null);
    cam.retry(); // re-acquire the camera stopped at capture time
  };

  const close = () => { cam.stop(); onClose(); };

  if (result && shot) {
    return (
      <ChipCountReview
        playerId={playerId} shot={shot} result={result}
        denoms={state.denominations}
        onRetake={retake}
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

  const frozen = captured != null; // showing the still (analyzing or error)

  return (
    <div className="cc-sheet">
      <div className="cc-stage">
        {frozen
          ? <canvas className="cc-video" ref={frozenRef} />
          : <video className="cc-video" ref={cam.videoRef} playsInline muted />}

        {!frozen && <div className="cc-guidebox" />}
        {!frozen && <div className="cc-hint">{cam.ready ? hint : camMsg}</div>}
        {!frozen && !cam.ready && (
          <button className="btn btn-primary cc-enable" onClick={cam.retry}>📷 {t('chipcount.cameraRetry')}</button>
        )}
        {!frozen && (
          <div className="cc-bubble">
            <div className={`cc-bubble-dot${tilt.inRange ? ' ok' : ''}`} style={{ top: `${dotTop}%` }} />
          </div>
        )}

        {flash && <div className="cc-flash" />}

        {analyzing && (
          <div className="cc-overlay">
            <div className="cc-spinner" />
            <div className="cc-overlay-t">{engineWarmed ? t('chipcount.analyzing') : t('chipcount.preparing')}</div>
          </div>
        )}

        {analyzeErr && !analyzing && (
          <div className="cc-overlay">
            <div className="cc-overlay-ic">!</div>
            <div className="cc-overlay-t">{analyzeErr}</div>
            <div className="cc-overlay-btns">
              <button className="btn btn-primary" onClick={retake}>↺ {t('chipcount.retake')}</button>
              <button className="btn btn-ghost" onClick={close}>{t('chipcount.close')}</button>
            </div>
          </div>
        )}
      </div>

      {!frozen && (
        <div className="cc-bar">
          {cam.torchAvailable && (
            <button className="btn btn-ghost" onClick={cam.toggleTorch}>💡 {t('chipcount.torch')}</button>
          )}
          <button className="cc-shutter" disabled={!cam.ready || analyzing} onClick={onCapture} aria-label={t('chipcount.capture')} />
          <button className="btn btn-ghost" onClick={close}>✕</button>
        </div>
      )}
    </div>
  );
}
