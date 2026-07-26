# ChipStack — TV/Remote Rehaul + Cash Games — Design Spec

**Date:** 2026-07-26
**Status:** Approved (design), pending implementation
**Scope:** A rethink of the phone↔TV experience, plus cash-game support, silent audio,
per-skin fonts, a new minimalist icon, and a real "QR opens the app" fix.

---

## Decisions (locked with the user)

| Topic | Decision |
|-------|----------|
| Cash games | **Full mode toggle** — `gameMode: 'tournament' \| 'cash'` reshapes Plan/Table/TV |
| Deep link (QR→app) | **Verified Android App Links** via a root `ndre-droid.github.io` repo hosting `.well-known/assetlinks.json` |
| App icon | **Concept A — token ring**: dark squircle + amber ring + centre dot |
| Fonts per skin | **Curated**: casino=Playfair Display, playful=Fredoka, minimal=clean sans, scifi=Orbitron (unchanged) |
| App audio | **Strip all sound** — visual flash + `navigator.vibrate` only (Sonos takeover) |
| In-app YouTube on TV | **Skipped** — drive Sonos/Spotify from the phone instead |

---

## 1. Game mode — Tournament vs Cash

Add `gameMode: 'tournament' | 'cash'` to `Settings` (default `'tournament'`), include it in
`LiveData` (`liveSession.ts` `dataOf`), apply via `LIVE_APPLY_REMOTE`, and migrate a default in
`store.tsx`.

| Aspect | Tournament (today) | Cash game (new) |
|--------|--------------------|-----------------|
| Pool | Σ `buyIn`, fixed | **On the table** = Σ `buyIn` − Σ `cashOut` |
| Cash-out | final chips entered at settle | **anytime** → money leaves the live pool, player drops out |
| Blinds | ladder, auto-advance | fixed level; timer **optional** (a "use a timer" toggle) |
| TV extras | payout split + bust leaderboard (toggles) | both **hidden** — tournament-only |
| TV headline stat | `tv.prizePool` "Prize pool" | `tv.onTable` "On the table" |
| players-left | `!out` | still in: `cashOut===0 && !out` |

**Cash-out action:** a button on the players/pool panel (host RemoteControl + Table hub). Enter
the player's chip count/value → sets `cashOut`, marks them left. In cash mode `poolMoney` becomes
`Σ buyIn − Σ cashOut`; players-left drops. Pushes to the TV via the existing host-sync.

**Engine/Plan:** cash mode still uses `computeStack()` for the buy-in (chips map to money via
`unitValue`). No ladder maths needed; the Plan "later levels & colour-up" block hides in cash mode.

**Files:** `types.ts`, `store.tsx` (migrate + `LIVE_APPLY_REMOTE`), `liveSession.ts` (`LiveData`,
`dataOf`), `TvMode.tsx` (pool label + stat gating), `PlanScreen.tsx` (hide ladder bits),
`RemoteControl.tsx`/`TableScreen.tsx` (cash-out button, mode-aware pool), `i18n.ts`.

---

## 2. Table tab = the session hub (the TV/remote rethink)

Restructure `TableScreen.tsx` top→bottom:

1. **Session mode** — Tournament / Cash segmented toggle. Drives everything below.
2. **Connect to TV** (`ConnectToTv`) — when not hosting / not the TV device.
3. **Starting stack** — the computed chip breakdown for the buy-in (reuses `computeStack()` +
   `Chip`/`ChipStackViz`). "How big a stack you get", visible to everyone as the phone passes
   around. This is the user's "show the ChipStack on the remote" ask.
4. **Players & pool** — unified list: name, buy-in, **Rebuy/top-up**, **Cash out** (cash mode) /
   **Bust** (tournament), remove. Pool / On-the-table total. Host pushes to TV; `resync` retained.
5. **Blind clock** — local, when not hosting. In cash mode: only if the timer is enabled.
6. **Big screen** button + host/cast hints.
7. **RemoteControl live panel** — host only: clock + level length + blinds that drive the TV.
   De-duped: TV design/quips/background move OUT of RemoteControl into the shared TV-broadcast card.
8. **TV broadcast** (collapsible, always visible) — TV style (skin + Match phone) + accent, extras
   (quips + custom-quips editor + background photo), "Show on TV" URL + copy + QR, and the
   "Use this device as the TV" entry. Moved out of `SettingsScreen` (which keeps a one-line pointer).
9. **Dealer & seats** (unchanged).

**Files:** `TableScreen.tsx` (restructure), `RemoteControl.tsx` (trim to live game control),
`SettingsScreen.tsx` (remove TV broadcast blocks + leave pointer), `styles.css`, `i18n.ts`.

---

## 3. Language on the TV

Add a small **EN/DE** toggle to the TV control row in `TvMode.tsx` (`dispatch UPDATE_SETTINGS
language`). Standalone TV can switch language directly; a paired host still pushes its language via
`LiveData` (already wired). Purely a local dispatch — no new sync needed.

---

## 4. Fonts per skin

Per-skin `--font-display` in `styles.css`:
- **casino** → Playfair Display (serif) — replaces the Georgia/Times fallback stack
- **playful** → Fredoka (rounded, chunky)
- **minimal** → clean geometric sans (Inter or keep the system stack)
- **scifi** → Orbitron (unchanged)

Add `@fontsource/playfair-display` + `@fontsource/fredoka` (+ Inter if used), import weights in
`main.tsx`. Verify bundle size stays reasonable (subset weights actually used).

**Files:** `package.json`, `main.tsx`, `styles.css`.

---

## 5. Icon A — token ring

Rewrite `scripts/gen-icons.mjs` SVG: dark `#0E1116` squircle, amber `#F0B429` ring (stroke ~7px at
24-unit scale), centre dot. Android adaptive: background layer `#0E1116`, foreground = ring + dot on
transparent (mind the adaptive safe-zone / circle mask). Update `LogoMark` in `App.tsx` to the same
flattened ring + dot. Regenerate PWA (`public/`) + Android mipmaps via `node scripts/gen-icons.mjs`.

**Files:** `scripts/gen-icons.mjs`, `App.tsx` (`LogoMark`), regenerated assets,
`values/ic_launcher_background.xml` (bg colour already `#0A0A0E` → set to `#0E1116` or keep).

---

## 6. Silence all app audio

Remove the `beep()` / `chime()` / `buzzer()` calls in `TvMode.tsx` (blinds-up chime, shot-clock
countdown beeps, who-drinks spinner beeps). Keep `setFlash` visual cues + `navigator.vibrate`.
Leave the helper defs or delete them — no call sites remain. Result: the app is fully silent, so TV
sound never hijacks the phone's Sonos stream.

**Files:** `TvMode.tsx`.

---

## 7. App Links — QR opens the installed app

Real fix for "QR opens the browser, not the app":

1. **New repo `ndre-droid.github.io`** (user root Pages site) serving
   `https://ndre-droid.github.io/.well-known/assetlinks.json`.
2. `assetlinks.json` = `[{ relation: ["delegate_permission/common.handle_all_urls"],
   target: { namespace: "android_app", package_name: "<app id>",
   sha256_cert_fingerprints: ["<PUBLIC signing cert SHA-256>"] } }]`.
3. **Fingerprint** obtained via a **CI `keytool -list -v -keystore ...`** step that prints the
   cert SHA-256 (public info — **never** the private key; the keystore contents stay unread locally,
   per the repo rule).
4. `AndroidManifest.xml` already has the `autoVerify` https App Link intent-filter (host
   `ndre-droid.github.io`, pathPrefix `/chipstack`) → now verifies → the https `?tv=NNNN` QR opens
   the app directly, no chooser.
5. Rebuild the APK, then **on-device verify** (scan the TV QR → app opens as host). The
   custom-scheme (`chipstack://tv/NNNN`) banner + manual 4-digit code entry stay as fallbacks.

**Files:** new `ndre-droid.github.io` repo, `.github/workflows/build-apk.yml` (print fingerprint),
possibly `AndroidManifest.xml` (confirm host/path), HANDOFF/memory notes.

---

## Sequencing (ship incrementally)

1. **Fonts + Icon + Silence audio** — quick, independent, visible wins, low risk.
2. **Cash-game mode** — the core model (types → store/liveSession → TV/Plan/Table).
3. **Table/TV hub rehaul** — restructure Table, move TV broadcast off Settings, starting-stack card,
   language-on-TV.
4. **App Links** — infra-heavy: new repo, CI fingerprint, APK rebuild, on-device test. Last.

Each phase ends with a clean `npm run build` + `npx tsc -b`; TV-visible changes verified in the
browser preview (dev :5173) before moving on.

---

## Out of scope / non-goals
- Per-player live chip stacks (design holds: track **buy-ins only**).
- In-app YouTube / audio playback (skipped).
- User-editable tournament payout structure (still auto by entrant count).
- Hardening the open Firestore rule / TTL cleanup (fine for a home game).
