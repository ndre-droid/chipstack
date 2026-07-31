// Lazy OpenCV.js loader.
//
// @techstark/opencv-js v5 is an Emscripten MODULARIZE build: the UMD script sets
// `window.cv` to an ASYNC FACTORY FUNCTION. You must CALL it — `await window.cv()`
// resolves to the initialized module (with `Mat`, `matFromImageData`, …). The
// earlier code treated `cv` as the module and never called the factory, so the
// WASM runtime never booted and capture hung forever ("chips are being counted…").
//
// We load the file via Vite's `?url` asset pipeline (copied to dist as
// `opencv-[hash].js`, base-path aware, excluded from the PWA precache) and inject
// it as a plain <script>, then call the factory.
import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';

let cvPromise: Promise<any> | null = null;

const INIT_TIMEOUT_MS = 40000;
const SCRIPT_ID = 'opencv-js-script';

function initCv(): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    let settled = false;
    const done = (cv: any) => { if (!settled) { settled = true; resolve(cv); } };
    const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };

    // Try to obtain the initialized module from whatever `window.cv` currently is.
    // Returns true once init has been kicked off / resolved so polling can stop.
    const settleFrom = (p: any) =>
      Promise.resolve(p)
        .then((mod: any) => (mod && mod.Mat ? done(mod) : fail(new Error('The chip reader started without an API.'))))
        .catch((e: any) => fail(e instanceof Error ? e : new Error('The chip reader failed to start.')));

    const tryBoot = (): boolean => {
      const g = (window as any).cv;
      // v5 UMD returns `cv(Module)` → `window.cv` is a PROMISE of the initialized
      // module. Await it. (This was the bug: the old code polled `.Mat` on the
      // promise object, where it never appears.)
      if (g && typeof g.then === 'function') { settleFrom(g); return true; }
      // Some builds expose an async factory function instead — call it.
      if (typeof g === 'function') { settleFrom(g()); return true; }
      // …or an already-initialized module object.
      if (g && g.Mat) { done(g); return true; }
      return false;
    };

    if (tryBoot()) return;

    const pollUntilReady = () => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (settled || tryBoot()) { clearInterval(iv); }
        else if (Date.now() - start > INIT_TIMEOUT_MS) {
          clearInterval(iv);
          fail(new Error('The chip reader (OpenCV) failed to start.'));
        }
      }, 100);
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) { pollUntilReady(); return; }

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = opencvUrl;
    s.async = true;
    s.onload = pollUntilReady;
    s.onerror = () => fail(new Error('Could not download the chip reader. Check your connection and retry.'));
    document.head.appendChild(s);
  });
}

export function loadCv(): Promise<any> {
  if (!cvPromise) {
    // Reset on failure so a later capture can retry a fresh load.
    cvPromise = initCv().catch((e) => {
      cvPromise = null;
      throw e;
    });
  }
  return cvPromise;
}
