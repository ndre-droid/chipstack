import { useEffect, useRef, useState } from 'react';

export const TILT_MIN_DEG = 22;   // downward look, lower bound — below this the shot is too
                                  // flat/across-the-table: stacks foreshorten and occlude each
                                  // other, and the model badly miscounts. Reject it.
export const TILT_MAX_DEG = 36;   // upper bound (sweet spot ≈ 26–32°); too steep loses the seams

/**
 * Reads DeviceOrientation and reports the phone's downward pitch while framing.
 * `pitchDeg` ≈ how far the back camera looks down from horizontal (0 = level).
 * `steady` is true when orientation variance over ~500 ms is small.
 */
export function useDeviceTilt(band: { min: number; max: number } = { min: TILT_MIN_DEG, max: TILT_MAX_DEG }) {
  const [pitchDeg, setPitchDeg] = useState<number | null>(null);
  const [steady, setSteady] = useState(false);
  const recent = useRef<number[]>([]);

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null) return;
    // beta: front-back tilt, 0 = flat on table, 90 = upright.
    // Downward look ≈ 90 − beta when the phone is roughly upright-ish.
    const pitch = Math.abs(90 - Math.abs(e.beta));
    setPitchDeg(pitch);
    const r = recent.current;
    r.push(pitch);
    if (r.length > 10) r.shift();
    const spread = Math.max(...r) - Math.min(...r);
    setSteady(r.length >= 6 && spread < 3);
  };

  const request = async () => {
    const anyOrient = DeviceOrientationEvent as any;
    if (typeof anyOrient?.requestPermission === 'function') {
      try { await anyOrient.requestPermission(); } catch { /* denied → no bubble */ }
    }
    window.addEventListener('deviceorientation', onOrient, true);
  };

  useEffect(() => () => window.removeEventListener('deviceorientation', onOrient, true), []);

  const inRange = pitchDeg != null && pitchDeg >= band.min && pitchDeg <= band.max;
  return { pitchDeg, inRange, steady, request };
}
