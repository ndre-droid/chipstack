import { Suspense, lazy } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * The big screen, split out of the boot path.
 *
 * `TvMode.tsx` is the largest single file in the app — a full 4K dashboard, its own
 * clock ownership, the pairing card, the panel grid — and a phone was parsing all of
 * it at every launch to show it on the nights somebody presses "preview", or never,
 * because that phone is not the big screen. It is dynamically imported here instead.
 *
 * Both ways in go through this file: `App` renders it for a device that IS the big
 * screen, and the Table tab portals it for the preview. One `lazy()` between them, so
 * they share the chunk and the second opening is instant.
 *
 * The fallback is bare `.tv` — the big screen's own ground, which that class already
 * paints — rather than a spinner or a blank white flash:
 * on a device that boots straight into TV mode this is the first thing that appears
 * on a wall, and a moment of the right dark colour reads as the screen waking up.
 * The chunk is precached by the service worker like the rest of the app, so this is
 * one local read, not a download — including offline.
 */
const TvMode = lazy(() => import('./TvMode'));

/**
 * Its own boundary, so the big screen can fail without taking the phone with it —
 * including the case this `lazy()` introduces: a chunk that will not load (a cache
 * evicted while offline) throws right here, and the root boundary would answer that
 * by replacing the whole app with a crash page mid-night. A dashboard that dies is
 * an inconvenience; a phone that dies is the game.
 */
export default function BigScreen({ onClose, onCount }: { onClose: () => void; onCount?: () => void }) {
  return (
    <ErrorBoundary compact where="tv" onDismiss={onClose}>
      <Suspense fallback={<div className="tv" aria-hidden />}>
        <TvMode onClose={onClose} onCount={onCount} />
      </Suspense>
    </ErrorBoundary>
  );
}
