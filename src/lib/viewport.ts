import { useEffect } from 'react';

/**
 * Publishes the VISIBLE height of the window as `--vvh`.
 *
 * A full-screen sheet pinned with `inset: 0` is as tall as the window, and the
 * on-screen keyboard is not part of that window on every platform: where the
 * webview is not resized, the sheet keeps its full height and the keyboard simply
 * covers its bottom half — the numpad and the confirm bar end up underneath it.
 * `visualViewport` is the part the user can actually see, so a sheet sized to
 * `--vvh` ends exactly where the keyboard begins.
 *
 * Call once, high in the tree.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--vvh', `${Math.round(h)}px`);
    };
    apply();
    if (!vv) {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);
}
