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
                 the network anyway, so there is nothing to keep offline here. */
              globIgnores: ['**/liveSession-*.js'],
              cleanupOutdatedCaches: true,
              runtimeCaching: [
                {
                  urlPattern: /\/liveSession-[^/]*\.js$/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'chipstack-live-sync', expiration: { maxEntries: 4 } },
                },
              ],
            },
          }),
        ]),
  ],
  build: single ? { outDir: 'dist-single' } : {},
});
