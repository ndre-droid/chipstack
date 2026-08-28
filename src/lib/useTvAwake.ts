import { useEffect } from 'react';

/**
 * Keep a TV panel out of its own screensaver / standby.
 *
 * `useWakeLock` only speaks to the BROWSER. A TV's idle timer is firmware: webOS
 * (and Tizen, and Android TV) counts REMOTE-CONTROL input, not pixels — so no CSS
 * animation, no repainting clock and no wake lock stops the panel dropping out
 * after its 30-minute limit. The one thing every TV does honour is video playback,
 * which is exactly why a YouTube video never triggers it.
 *
 * So the big screen quietly plays one. A 2x2 canvas is captured as a MediaStream,
 * recorded into a two-second loop, and played back on a hidden <video>. That is a
 * real decode running for as long as the screen is up.
 *
 * VIDEO ONLY — the stream is built without an audio track, and the element is muted
 * on top of that. Any sound from the TV steals the Sonos group away from the user's
 * phone (see the note at the top of TvMode), so silence here is not optional.
 */
export function useTvAwake(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let url: string | null = null;
    let paint = 0;
    let poll = 0;

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');

    /* A canvas that never changes can be optimised down to zero new frames, and a
       stream with no frames is not playback. Two near-black shades alternating once
       a second is enough to keep frames coming and invisible on any background. */
    let flip = false;
    const draw = () => {
      if (!ctx) return;
      flip = !flip;
      ctx.fillStyle = flip ? '#000000' : '#010101';
      ctx.fillRect(0, 0, 2, 2);
    };

    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    /* `display:none` lets the browser skip the decode — and a skipped decode is the
       one thing the TV is watching for. So it stays painted: two pixels in a corner. */
    video.style.cssText =
      'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;border:0;z-index:0;';
    document.body.appendChild(video);

    const play = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    /* Swap the live stream for a short recorded loop: a file in a container is closer
       to "a video is playing" than a synthetic stream on players that tell them apart.
       If anything here is missing the live stream simply keeps running. */
    const recordLoop = () => {
      if (!stream || typeof MediaRecorder === 'undefined') return;
      try {
        const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(
          (m) => MediaRecorder.isTypeSupported?.(m) ?? false,
        );
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000 } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (stopped || !chunks.length) return;
          try {
            url = URL.createObjectURL(new Blob(chunks, { type: chunks[0].type || 'video/webm' }));
            video.srcObject = null;
            video.src = url;
            play();
            window.clearInterval(paint); // the canvas has done its job
            paint = 0;
          } catch {
            /* keep the live stream */
          }
        };
        recorder.start();
        window.setTimeout(() => {
          try {
            recorder?.stop();
          } catch {
            /* ignore */
          }
        }, 2000);
      } catch {
        /* no recorder: the live stream is the loop */
      }
    };

    try {
      draw();
      const capture = (canvas as HTMLCanvasElement & { captureStream?(fps?: number): MediaStream }).captureStream;
      stream = capture ? capture.call(canvas, 1) : null;
      if (stream) {
        video.srcObject = stream;
        paint = window.setInterval(draw, 1000);
        play();
        recordLoop();
      }
    } catch {
      /* no canvas capture — the wake lock is all we have on this device */
    }

    /* TVs pause hidden media and some drop playback on their own after an hour.
       Nothing here is expensive, so just check now and then and restart. */
    const kick = () => {
      if (!stopped && !document.hidden && video.paused) play();
    };
    poll = window.setInterval(kick, 20000);
    document.addEventListener('visibilitychange', kick);

    return () => {
      stopped = true;
      window.clearInterval(paint);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', kick);
      try {
        if (recorder?.state === 'recording') recorder.stop();
      } catch {
        /* ignore */
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.srcObject = null;
        video.load();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (url) URL.revokeObjectURL(url);
      video.remove();
    };
  }, [active]);
}
