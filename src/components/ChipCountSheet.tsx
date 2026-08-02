import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.tsx';
import { useT } from '../lib/i18n.ts';
import { useCameraCapture } from '../lib/useCameraCapture.ts';
import { useDeviceTilt, TILT_MIN_DEG, TILT_MAX_DEG } from '../lib/useDeviceTilt.ts';
import { countChipsWithVision, recountStacks } from '../lib/chipVision/visionCount.ts';
import { flaggedStackIds } from '../lib/chipVision/fuse.ts';
import type { CountResult } from '../lib/chipVision/types.ts';
import { ChipCountReview } from './ChipCountReview.tsx';

export interface ChipCountSheetProps { playerId: string; playerName: string; onClose: () => void }

type Phase = 'framing' | 'analyzing' | 'secondAngle' | 'framing2' | 'analyzing2' | 'review';

// Steeper band for the second-angle shot — a few more degrees separates merged chips.
const BAND_1 = { min: TILT_MIN_DEG, max: TILT_MAX_DEG };
const BAND_2 = { min: 30, max: 45 };

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

export function ChipCountSheet({ playerId, onClose }: ChipCountSheetProps) {
  const t = useT();
  const { state } = useStore();
  const [phase, setPhase] = useState<Phase>('framing');
  const cam = useCameraCapture();
  const tilt = useDeviceTilt(phase === 'framing2' ? BAND_2 : BAND_1);
  const [result, setResult] = useState<CountResult | null>(null);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [captured, setCaptured] = useState<HTMLCanvasElement | null>(null); // frozen frame shown while analyzing / on error
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [holding, setHolding] = useState(false); // true while the auto-capture hold-timer is counting
  const frozenRef = useRef<HTMLCanvasElement | null>(null);
  const holdRef = useRef<number | null>(null);
  const busyRef = useRef(false); // guards onCapture against re-entrant calls (auto-capture tick vs manual shutter)
  const priorRef = useRef<CountResult | null>(null); // shot-1 result, carried into the shot-2 recount

  const analyzing = phase === 'analyzing' || phase === 'analyzing2';

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

  // Shot 1 (framing) -> countChipsWithVision; flagged stacks route to the second-angle
  // prompt, else straight to review. Shot 2 (framing2) -> recountStacks merges into the
  // prior result, then always goes to review (flags that survive open the seam editor there).
  const onCapture = async () => {
    if (!cam.ready || busyRef.current) return;
    busyRef.current = true;
    try {
      navigator.vibrate?.(30);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 280);

      const frames = await cam.captureBurst(3);
      if (frames.length === 0) return; // no frame yet — let them tap again

      setCaptured(frames[0]); // freeze the shot on screen
      cam.stop();             // close the live camera (battery + privacy)

      if (!state.settings.aiVisionKey) {
        setAnalyzeErr(t('chipcount.aiNeedsKey'));
        return;
      }

      const denoms = state.denominations.filter((d) => d.enabled).map((d) => ({ value: d.value, color: d.color }));
      const secondPass = phase === 'framing2';
      setPhase(secondPass ? 'analyzing2' : 'analyzing');
      setAnalyzeErr(null);
      try {
        const res = secondPass && priorRef.current
          ? await withTimeout(recountStacks(frames[0], denoms, state.settings.aiVisionKey, priorRef.current), 60000, t('chipcount.timedOut'))
          : await withTimeout(countChipsWithVision(frames[0], denoms, state.settings.aiVisionKey), 60000, t('chipcount.timedOut'));
        if (res.totals.length === 0) {
          // Nothing counted — show the most useful reason (bad surface/light, etc.)
          // rather than an empty breakdown.
          const blocking = res.anomalies.find((x) => x.severity === 'blocking');
          setAnalyzeErr(blocking ? t('chipcount.anom.' + blocking.code) : t('chipcount.noChips'));
          return;
        }
        priorRef.current = res;
        setShot(frames[0]);
        setResult(res);
        const flagged = flaggedStackIds(res.stacks);
        if (!secondPass && flagged.length > 0 && res.stacks.length > 0) setPhase('secondAngle');
        else setPhase('review');
      } catch (e: any) {
        setAnalyzeErr(e?.message || t('chipcount.analyzeFailed'));
      }
    } finally {
      busyRef.current = false;
    }
  };

  // Auto-capture: while framing and the camera is ready, poll every 120ms; once
  // in-range + steady + content-bearing holds for ~600ms, fire onCapture(). Resets
  // the hold clock the instant any condition breaks, and tears the interval down
  // on phase change / camera-not-ready / unmount so it never fires into a stale phase.
  useEffect(() => {
    const framing = phase === 'framing' || phase === 'framing2';
    if (!framing || !cam.ready) { holdRef.current = null; setHolding(false); return; }
    const id = window.setInterval(() => {
      const ok = tilt.inRange && tilt.steady && cam.frameHasContent();
      if (ok) {
        if (holdRef.current == null) holdRef.current = Date.now();
        setHolding(true);
        if (Date.now() - holdRef.current > 600) { holdRef.current = null; setHolding(false); void onCapture(); }
      } else {
        holdRef.current = null;
        setHolding(false);
      }
    }, 120);
    return () => { window.clearInterval(id); holdRef.current = null; setHolding(false); };
  }, [phase, cam.ready, tilt.inRange, tilt.steady]);

  // Retake: from an error overlay, retry the SAME shot (framing or framing2); from the
  // review screen, discard everything (including the shot-1 prior) and start over.
  const retake = () => {
    setAnalyzeErr(null);
    setCaptured(null);
    if (phase === 'review') {
      priorRef.current = null;
      setResult(null);
      setShot(null);
    }
    setPhase(phase === 'analyzing2' || phase === 'framing2' ? 'framing2' : 'framing');
    cam.retry(); // re-acquire the camera stopped at capture time
  };

  const close = () => { cam.stop(); onClose(); };

  if (phase === 'review' && result && shot) {
    return (
      <ChipCountReview
        playerId={playerId} shot={shot} result={result}
        denoms={state.denominations}
        onRetake={retake}
        onClose={onClose}
      />
    );
  }

  if (phase === 'secondAngle') {
    return (
      <div className="cc-sheet"><div className="cc-stage"><div className="cc-overlay">
        <div className="cc-overlay-t"><b>{t('chipcount.secondAngleTitle')}</b></div>
        <div className="cc-overlay-t">{t('chipcount.secondAngleBody')}</div>
        <div className="cc-overlay-btns">
          <button className="btn btn-primary" onClick={() => { setCaptured(null); setPhase('framing2'); cam.retry(); }}>📷</button>
          <button className="btn btn-ghost" onClick={() => setPhase('review')}>{t('chipcount.secondAngleSkip')}</button>
        </div>
      </div></div></div>
    );
  }

  const tiltHint = tilt.pitchDeg == null ? t('chipcount.guide')
    : phase === 'framing2'
      ? (tilt.inRange ? t('chipcount.tiltOk') : t('chipcount.tiltMore'))
      : tilt.pitchDeg > TILT_MAX_DEG ? t('chipcount.tiltHigh')
      : tilt.pitchDeg < TILT_MIN_DEG ? t('chipcount.tiltLow')
      : t('chipcount.tiltOk');
  const hint = holding ? t('chipcount.autoHold') : tiltHint;

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
        {!frozen && <div className={`cc-ring${holding ? ' active' : ''}`} />}
        {!frozen && phase === 'framing' && <div className="cc-tip">{t('chipcount.barrelsTip')}</div>}

        {flash && <div className="cc-flash" />}

        {analyzing && (
          <div className="cc-overlay">
            <div className="cc-spinner" />
            <div className="cc-overlay-t">{t('chipcount.analyzing')}</div>
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
