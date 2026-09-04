import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `server.androidScheme` and `server.hostname` are pinned, and they are the most
 * dangerous two lines in this repo to change.
 *
 * Everything the user has ever entered — the chip box, saved setups, the season
 * league, the people, tonight's ledger, the chip-ruler calibrations — lives in
 * `localStorage`, and `localStorage` is keyed by ORIGIN. Inside the APK the origin
 * is whatever these two produce: `https://localhost`. Change the scheme to `http`,
 * or set a hostname, and the next update starts on a different origin with an empty
 * store: not a migration, not a warning, just an app that has forgotten everything.
 *
 * They are written out rather than left to the default because the default is not a
 * promise. Capacitor moved Android from `http` to `https` in v4; a future major
 * could move it again, and the first sign would be a user's whole season gone after
 * a routine `npm update`. Pinned, an upgrade cannot change the origin by accident.
 *
 * These match what Capacitor 6 already does, so writing them down changes nothing
 * today — which is the point. If a change here is ever genuinely wanted, it needs an
 * export/import step for the user first (Settings → Backup).
 */
const config: CapacitorConfig = {
  appId: 'com.chipstack.app',
  appName: 'ChipStack',
  webDir: 'dist',
  backgroundColor: '#0a0a0c',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
};

export default config;
