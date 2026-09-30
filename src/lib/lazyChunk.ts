import { lazy, type ComponentType } from 'react';

/**
 * `lazy()` for a chunk that may have been deployed out from under the page.
 *
 * A page loaded before a deploy still asks for the OLD chunk names; once the new
 * service worker has cleaned the old precache (or the server simply no longer has
 * them) the import 404s. React's `lazy` then caches that rejection for good, so a
 * "try again" button can never recover — only a reload, which fetches the index
 * that names the chunks that exist, can.
 *
 * So: reload ONCE, then let the error through. The flag lives in sessionStorage
 * so a chunk that is genuinely missing ends on the crash card instead of a reload
 * loop, and it is cleared on the next successful load so a later deploy gets its
 * own reload. It is keyed PER CHUNK: with one shared flag, a different lazy chunk
 * loading fine after the reload cleared it, and a chunk that really is gone
 * reloaded the page on every tap instead of ever reaching the crash card. Everything on screen is persisted state, so a reload loses nothing
 * the autoUpdate service worker would not have reloaded away anyway.
 */
const FLAG = 'chipstack.chunkReload.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same bound React.lazy itself uses
export function lazyChunk<T extends ComponentType<any>>(name: string, load: () => Promise<{ default: T }>) {
  const key = FLAG + name;
  return lazy(() =>
    load().then(
      (mod) => {
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* storage blocked: no loop guard, but also nothing to clear */
        }
        return mod;
      },
      (err: unknown) => {
        let first = false;
        try {
          first = sessionStorage.getItem(key) == null;
          if (first) sessionStorage.setItem(key, '1');
        } catch {
          /* without storage there is no loop guard, so do not reload at all */
        }
        if (!first) throw err;
        window.location.reload();
        // never settles: the page is going away, and the Suspense fallback holds until it does
        return new Promise<{ default: T }>(() => {});
      },
    ),
  );
}
