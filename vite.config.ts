import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

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
              orientation: 'portrait',
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
              // The ~15 MB OpenCV.js chunk (photo chip-count) must NOT be precached
              // for offline install — it's fetched lazily only when that feature is
              // opened. Exclude it from precache and cache it at runtime on first use.
              globIgnores: ['**/opencv-*.js'],
              runtimeCaching: [
                {
                  urlPattern: /opencv-.*\.js$/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'opencv-cache', expiration: { maxEntries: 1 } },
                },
              ],
              cleanupOutdatedCaches: true,
            },
          }),
        ]),
  ],
  build: single ? { outDir: 'dist-single' } : {},
});
