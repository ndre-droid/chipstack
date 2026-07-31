// Lazy OpenCV.js loader. Imported ONLY via dynamic import() from extract.ts,
// which is itself dynamically imported — so the ~8 MB WASM never enters the
// main bundle (same discipline as liveSession.ts / Firebase).
let cvPromise: Promise<any> | null = null;

export function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then(async (mod: any) => {
      const cv = mod.default ?? mod;
      if (cv.getBuildInformation) return cv;
      // Some builds resolve before the WASM runtime is ready.
      await new Promise<void>((res) => { cv.onRuntimeInitialized = () => res(); });
      return cv;
    });
  }
  return cvPromise;
}
