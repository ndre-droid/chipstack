import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests (`npm run test:e2e`).
 *
 * The engine tests under `src/lib/*.test.ts` are pure and plentiful; what was never
 * covered is the layer where this app has actually broken — a screen that remounts and
 * resets the clock, two clock subscriptions that disagree, a state that will not load.
 * None of that is reachable from Node, so this is a real browser against the REAL
 * production bundle: the config builds `dist/` and serves it with `vite preview`,
 * because the dev server does not have the service worker, the chunk splitting or the
 * minifier that ship to the phone.
 *
 * Chromium only, at phone size. The app is used on one Android phone; a matrix of
 * engines would cost minutes per run and cover browsers nobody plays on.
 */
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Pinned: a fresh install picks its language off the browser (see detectLanguage
    // in store.tsx), and the assertions below are written against the English strings.
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'], isMobile: false, hasTouch: false } }],
  webServer: {
    // Builds first on purpose — a stale `dist/` passing is worse than no test at all.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
