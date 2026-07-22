# ♣ ChipStack — Poker Chip Planner

A sleek mobile app that works out **how to distribute your poker chips** for a home game —
starting stacks per player, plus colour-up stacks for later blind levels — using the chip set
you actually own. Built around the SLOWPLAY Nash ceramic set, but fully editable.

Dark, Spotify/YouTube-style UI · installable PWA (works offline) · all data stays on your device.

## Features

- **Plan tab** — players, buy-in & rebuy, a blind-level ladder (tap a level to start there),
  a small-chip emphasis slider, and include/exclude chip toggles. Results update live:
  chip-stack visual, breakdown table, big-blind depth, inventory feasibility check, and
  colour-up rebuy stacks for higher blinds.
- **Chips tab** — your inventory: value, how many you own, colour, enable/disable.
- **Settings tab** — money mapping (what 1 chip point is worth) and currency.

The distribution engine hits the buy-in exactly, keeps enough small chips to post blinds
(a playability floor tied to the big blind), respects how many chips you own, and shifts to
bigger chips as blinds rise.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/  (installable PWA: manifest + offline service worker)
npm run preview    # serve the built PWA locally
```

Regenerate app icons after changing the design: `node scripts/gen-icons.mjs`.

## Install on your phone (PWA)

The `dist/` folder is a complete installable web app. Host it over **HTTPS**, open the URL in
mobile Chrome, then menu → **Install app / Add to Home Screen**. It then launches full-screen
with its own icon and works offline.

Fastest zero-setup host: drag the `dist` folder onto <https://app.netlify.com/drop>.
Or use GitHub Pages / Vercel / Cloudflare Pages / any static host.

## Wrap as a real .apk later (optional)

The web build wraps into a native Android APK with [Capacitor](https://capacitorjs.com):

```bash
npm i -D @capacitor/core @capacitor/cli @capacitor/android
npx cap init ChipStack com.chipstack.app --web-dir dist
npx cap add android
npm run build && npx cap sync
# then build the APK with Android Studio, or `./gradlew assembleDebug` (needs JDK 17 + Android SDK)
```
