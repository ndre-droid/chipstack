import { useCallback, useEffect, useRef, useState } from 'react';

export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [brightnessOk, setBrightnessOk] = useState(true);

  // Acquire (or re-acquire) the rear camera. Safe to call again as a retry —
  // e.g. after the Android runtime-permission prompt, which on the APK only
  // appears when getUserMedia is first invoked.
  const start = useCallback(async () => {
    setError(null);
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps: any = track.getCapabilities?.() ?? {};
      setTorchAvailable(!!caps.torch);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* autoplay quirk — stream still live */ });
      }
      setReady(true);
    } catch (e: any) {
      setReady(false);
      setError(e?.name || e?.message || 'CameraError');
    }
  }, []);

  useEffect(() => {
    start();
    return () => { streamRef.current?.getTracks().forEach((tk) => tk.stop()); };
  }, [start]);

  const retry = useCallback(() => { start(); }, [start]);

  const applyTorch = useCallback(async (on: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: on } as any] }); setTorchOn(on); } catch { /* unsupported */ }
  }, []);

  const toggleTorch = useCallback(() => applyTorch(!torchOn), [applyTorch, torchOn]);

  // Sample brightness ~2×/s; auto-torch when dark (if enabled + available).
  const autoTorch = useRef(false);
  const setAutoTorch = useCallback((v: boolean) => { autoTorch.current = v; }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current; if (!v || !v.videoWidth) return;
      const c = document.createElement('canvas'); c.width = 32; c.height = 18;
      const ctx = c.getContext('2d')!; ctx.drawImage(v, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const luma = sum / (32 * 18);
      const dark = luma < 70;
      setBrightnessOk(!dark);
      if (autoTorch.current && torchAvailable && dark && !torchOn) applyTorch(true);
    }, 500);
    return () => clearInterval(id);
  }, [applyTorch, torchAvailable, torchOn]);

  const captureBurst = useCallback(async (n: number): Promise<HTMLCanvasElement[]> => {
    const v = videoRef.current; if (!v || !v.videoWidth) return [];
    const out: HTMLCanvasElement[] = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      out.push(c);
      if (i < n - 1) await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  }, []);

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((tk) => tk.stop()); }, []);
  return { videoRef, ready, error, retry, torchOn, torchAvailable, toggleTorch, setAutoTorch, brightnessOk, captureBurst, stop };
}
