import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

/* Which build is on the screen?
   A TV has no address bar and no devtools, so "is the big screen even running the
   deploy I just pushed?" was unanswerable from the sofa — and with a service worker
   in front of it, the honest answer was sometimes no. The commit is stamped into the
   bundle here and printed under the TV's reload button. */
const buildId = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev'; // a source tarball, or no git — the stamp is a nicety, not a build input
  }
})();

// SINGLE_FILE=1 bundles the whole app into one self-contained index.html
// (used to publish the interactive preview — no service worker there).
// The normal build is a real installable PWA (manifest + offline SW).
const single = process.env.SINGLE_FILE === '1';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    ...(single
      ? [viteSingleFile()]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'ChipStack — Poker Chip Planner',
              short_name: 'ChipStack',
              description: 'Plan poker chip distributions for your home game.',
              theme_color: '#0a0a0c',
              background_color: '#0a0a0c',
              display: 'standalone',
              // 'any', not 'portrait': the phone is used upright, but the same
              // installed app is what a tablet or laptop runs as the big screen.
              orientation: 'any',
              start_url: '.',
              scope: '.',
              icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              /* The Firebase chunk is ~470kB of the precache and only a phone that
                 pairs with a TV ever loads it — everyone else was downloading it on
                 install for nothing. Cached on first use instead; live sync needs
                 the network anyway, so there is nothing to keep offline here.

                 `liveSession-*` alone was NOT enough, and the gap was invisible: the
                 SDK also splits into its own vendor chunks, which the bundler named
                 after their entry file (`index.esm-*.js`) and this list therefore
                 never matched. 112kB of Firebase was being precached by every
                 install regardless. Hence `manualChunks` below — the chunk is named
                 by what it IS, so this pattern cannot drift away from it again. */
              /* Same argument for three.js (~185kB gzipped) plus the loader and the
                 chip model: only a device left on the 3D chips ever needs them. */
              globIgnores: [
                '**/liveSession-*.js',
                '**/firebase-vendor-*.js',
                '**/three.module-*.js',
                '**/GLTFLoader-*.js',
                '**/RoomEnvironment-*.js',
              ],
              cleanupOutdatedCaches: true,
              runtimeCaching: [
                {
                  urlPattern: /\/(liveSession|firebase-vendor)-[^/]*\.js$/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'chipstack-live-sync', expiration: { maxEntries: 8 } },
                },
                {
                  urlPattern: /\/(three\.module|GLTFLoader|RoomEnvironment)-[^/]*\.js$|\/models\/[^/]*\.glb$/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'chipstack-chip-3d', expiration: { maxEntries: 8 } },
                },
              ],
            },
          }),
        ]),
  ],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: single
    ? { outDir: 'dist-single' }
    : {
        rollupOptions: {
          output: {
            /* Give the Firebase SDK a chunk named after itself. Nothing here changes
               WHEN it loads — it was already behind a dynamic import and stayed out
               of the boot path — but the service-worker rules above have to be able
               to name it, and a rolldown-generated name derived from a node_modules
               entry file (`index.esm-*`) is not a name anything can rely on. */
            manualChunks: (id: string) =>
              /node_modules[\/](@firebase|firebase)[\/]/.test(id) ? 'firebase-vendor' : undefined,
          },
        },
      },
});
