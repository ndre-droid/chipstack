# ChipStack — Handoff

A mobile app that computes **poker chip distributions** for a home game, using the chips the
user actually owns (SLOWPLAY Nash ceramic set). Plus a blind timer, cash/settle-up ledger,
sharing, a big-screen **TV mode**, **live phone↔TV cloud sync**, multiple visual skins, and
German/English. Ships as an installable **PWA** (primary) and an **Android APK** (built in CI).

- **Project root:** `C:\Users\ndrex\Projects\ChipStack`
- **Stack:** Vite 8 + React + TypeScript. Capacitor 6 (Android). PWA (vite-plugin-pwa),
  single-file build (vite-plugin-singlefile), QR (qrcode-generator), icons via `sharp`,
  Firebase/Firestore (live sync, code-split), `@fontsource/orbitron` (sci-fi font).
- **GitHub:** https://github.com/ndre-droid/chipstack (public, **lowercase** — renamed from
  `ChipStack`; old capitalised links auto-redirect). Owner `ndre-droid`.
- **LIVE WEB APP (primary):** **https://ndre-droid.github.io/chipstack/** — auto-deploys on every
  push to `main`, updates automatically, runs offline after first load. This is the main way the
  user runs it (and the only way the TV runs it — see TV/Live below).
- **APK download:** https://github.com/ndre-droid/chipstack/releases/download/android-latest/ChipStack-debug.apk
  (⚠️ predates the last few features — see Open items.)

---

## Environment / gotchas (READ FIRST)

- **Windows.** Bash tool = Git Bash; PowerShell tool also available. Paths like `/c/Users/...`.
- **No local JDK or Android SDK.** Can't build the APK or run `keytool` locally — CI only.
  `npm run build`, `npx tsc -b`, and the `node --experimental-strip-types src/lib/*.test.ts`
  tests all work locally.
- **GitHub CLI** at `C:\Program Files\GitHub CLI\gh.exe` (NOT on PATH — use full path,
  `GH="/c/Program Files/GitHub CLI/gh.exe"`). Authed as `ndre-droid`, scopes `repo, workflow`.
  - `gh api` paths: **omit the leading slash** in Git Bash (`gh api repos/ndre-droid/chipstack/...`)
    or Git Bash rewrites `/repos/...` into a filesystem path.
- **Dev server / preview:** `.claude/launch.json` in the SESSION cwd (`C:\Users\ndrex\Downloads\
  HomeFlow-debug-apk (4)`) has config `chipstack` (npm run dev, :5173), `chipstack-3d`
  (npm run dev, :5188) and `chipstack-pwa` (vite preview, :4173). Start with
  `preview_start {name:"chipstack"}`. If another chat already holds :5173, use `chipstack-3d`
  (:5188) instead — that's why it exists.
- **In-app Browser pane is usable this session** (screenshots + `javascript_tool` both work), but
  can go flaky — `computer{screenshot}` sometimes times out if the pane is hidden; fall back to
  `read_page` / `javascript_tool` / `read_console_messages`.
- **PWA service worker caches aggressively.** After a deploy, a returning visitor (incl. you when
  verifying the live site) gets the OLD cached build. To see fresh: in the pane, run
  `navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister()))` + clear
  `caches`, then reload. (The dev server :5173 doesn't have this problem.)
- **Two-tab live-sync testing:** the browser sandbox blocks navigating to `http://127.0.0.1:5173`
  (only `localhost` allowed), so you can't use two origins for two independent localStorages.
  Instead: open a 2nd same-origin tab, `localStorage.clear()` + reload it (→ fresh independent
  device), join as TV, and **do NOT reload the host tab** (same-origin localStorage clobbers
  between tabs, but only bites on reload; in-memory React state is the real source of truth).
- **HMR deps-array warnings / `[vite] Failed to reload`** in the dev console are transient
  artifacts of editing while running — always confirm against a clean `npm run build` +
  the production preview, which are clean.
- **Dev reload can blank the app after many edits.** After a batch of edits, `location.reload()`
  on an already-open tab can serve a stale module for one chunk and collide with the new one
  ("useEffect changed size between renders" / Rules-of-Hooks), blanking the page. It is NOT a real
  bug (deployed prod loads fresh). To verify host/live behaviour cleanly: open a BRAND-NEW tab (first
  paint uses current code), and drive state via the UI (e.g. tap **Start Live Session**) instead of
  writing localStorage + reloading. To confirm a host→cloud push, read the session doc over the
  Firestore REST API with the committed key (see `memory/live-sync-firestore.md`).

---

## Run / build / deploy

```bash
npm install
npm run dev                      # dev server :5173
npm run build                    # tsc -b && vite build -> dist/  (installable PWA)
npm run preview                  # serve the built PWA (:4173)
node scripts/gen-icons.mjs       # regenerate PWA/app icons from the SVG in the script (sharp)
node --experimental-strip-types src/lib/distribution.test.ts   # engine tests (console-based)

# GitHub Pages build uses a sub-path base (CI does this, matches repo name):
npx vite build --base=/chipstack/

GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" workflow run "Build Android APK" -R ndre-droid/chipstack --ref main   # APK is MANUAL only
"$GH" run watch <id> -R ndre-droid/chipstack --exit-status --interval 20
```

**CI workflows** (`.github/workflows/`):
- `deploy-pages.yml` — on push to `main` (+ dispatch): builds with `--base=/chipstack/`,
  deploys to GitHub Pages. Pages was enabled once via
  `gh api --method POST "repos/ndre-droid/chipstack/pages" -f build_type=workflow`
  (the workflow token can't self-enable it).
- `build-apk.yml` — **`workflow_dispatch` ONLY** (removed the push trigger so Pages deploys
  don't build APKs while iterating). Generates the stable keystore once, syncs Capacitor,
  builds debug APK, publishes to the `android-latest` release.

**Ship a change:** commit → `git push` → Pages redeploys automatically. For the APK, also
trigger the workflow manually.

---

## Architecture / key files

```
src/
  main.tsx           entry (imports Orbitron weights + styles.css)
  App.tsx            StoreProvider + AppShell (4-tab nav: Plan/Chips/Table/Cash; Settings via
                     header gear; applies data-skin/-accent/-theme to <html>; mounts
                     useLiveHostSync; nav/header via i18n t())
  store.tsx          useReducer + Context, localStorage 'chipstack.state.v1', migrate() deep-merge
                     (new fields get defaults → settings survive updates), presets, ledger.
                     Actions incl. LIVE_APPLY_REMOTE (TV merges host data).
  types.ts           all domain types (Settings has skin/accents/tvSkin/tvQuips/tvBackground/
                     language/liveSessionCode/liveSessionRole, appearance, chipArt, ...)
  styles.css         THE design system: neutral tokens (light base + dark override), 4 skin
                     token blocks (minimal/casino/playful/scifi) + structural rules, 8 accent
                     hues (data-accent), all TV-mode CSS (.tv*, per-tv-skin themed via --tv-*
                     tokens + data-tv-skin), pairing card (.tv-pair) + connect pill + phone
                     code boxes (.code-box). Skins drive --acc/--app-bg/--font-display/etc.
  lib/
    distribution.ts  THE engine: computeStack(), selectPool() [only the SMALLEST chip must post
                     the blind — larger chips need NOT be blind-multiples], rebalance(),
                     closeResidual() [two-denom swap to hit buy-in exactly when pool gcd < base],
                     pickSpread().
    planning.ts      suggestBlindLadder(), colorUpEvents()
    settle.ts        settleUp() minimal-transfer
    share.ts         encode/decodeSetup (CS1: code), renderStackImage
    money.ts, i18n.ts (t() hook + en/de dict), clockLogic.ts (pure ClockState transitions),
    firebaseConfig.ts (the pasted chipstack-live web config), firebase.ts (lazy Firestore),
    liveSession.ts (Firestore session doc read/write/subscribe — DYNAMICALLY imported only when
      live session is used, so Firebase code-splits out of the main bundle),
    useLiveHostSync.ts (root hook: while hosting, debounce-push state to cloud on any change)
    *.test.ts        engine tests (node --experimental-strip-types, imports need .ts extensions)
  components/
    Chip.tsx         SVG chip/plaque — SLOWPLAY ceramic: SMOOTH edge (no clay spots), full-face
                     gold octagonal art-deco lattice, octagon centre cartouche. Reads settings.chipArt.
    ChipStackViz.tsx 3D chip-cylinder stacks (curved body, per-chip divisions, perspective-
                     projected deco face). Auto-fits width (ResizeObserver).
    ShareSheet.tsx, Icons.tsx
  screens/
    PlanScreen.tsx   result-first: stack hero (count/BB/viz/value-bar/blind-check) + small-chip
                     slider up top; config (players/buy-in/blinds/options) below a "Session setup"
                     divider; collapsible "Later levels & colour-up"; fine-tune editor; share.
    ChipsScreen.tsx  inventory editor
    TableScreen.tsx  ConnectToTv card + blind clock + "Big screen · TV mode" button +
                     RemoteControl (host only) + dealer button + seat draw
    ConnectToTv.tsx  phone-side link: 4 code boxes → checkCodeExists → role 'host' + code
                     (replaced LiveSessionControl.tsx). Firebase-configured only.
    TvMode.tsx       fullscreen landscape big-screen dashboard (clock/standings/legend/colour-up/
                     quips/shot-clock/who-drinks). If deviceIsTv: advertises a pairing code
                     (tvEnsurePairing), shows .tv-pair card until a phone connects, then mirrors
                     the host's data + OWNS the countdown. NO on-screen keypad (phone types the
                     code). Standalone shows a "Use this device as the TV" pill. clamp()→4K.
    RemoteControl.tsx phone's clock remote (host only); sends commands, never runs a local timer.
    CashScreen.tsx   persisted ledger → who-pays-whom
    SettingsScreen.tsx Language, Style (4 skins), Appearance (minimal only), Accent (per-skin, 8),
                     TV broadcast style (+ Match phone), TV extras (quips toggle + background photo
                     upload w/ canvas downscale), Show on TV (URL + copy + QR), Live Session
                     (start/stop), Chip art, Money mapping, blinds, currency, reset.
android/             Capacitor project. app/build.gradle has signingConfigs.chipstack →
                     ../keystore/chipstack.jks (committed), applied to debug+release buildTypes.
keystore/chipstack.jks   committed stable signing key (generated once in CI).
.github/workflows/   deploy-pages.yml, build-apk.yml
scripts/gen-icons.mjs    regenerates icons (redesigned to the smooth-ceramic chip look)
```

### Design system (skins + accents)
- `data-skin` on `<html>`: **minimal** (honours light/dark appearance + accent) / **casino**
  (green felt + brass + serif, dark-committed) / **playful** (cream + coral, chunky, light) /
  **scifi** (deep-space blue + neon glow + **Orbitron** font, dark).
- `data-accent`: 8 hues (amber/gold/emerald/cyan/cobalt/violet/crimson/coral); **per-skin**
  (`Settings.accents: Record<Skin,AccentId>`). Each hue has `--acc-bright` (dark grounds) +
  `--acc-deep` (light grounds); the skin picks which via `--acc`.
- TV mode is themed **independently** via `data-tv-skin` (default `'match'` = follows phone) and
  reuses that skin's accent. `.tv` uses its own `--tv-bg/-fg/-dim/-faint/-panel/-line` tokens.

---

## Features (all built + verified)
Plan (result-first), Chips inventory, Table (blind clock, TV-mode launch, dealer/seat draw),
Cash ledger + settlement, Settings. Distribution engine with small-chip slider, exact buy-in,
per-chip min/max, up-to-N types, use-all toggle, colour-up guide, live fine-tune editor, presets,
CS1 share code + QR + PNG. **TV mode** (big clock, alerts + chime, break + cancel,
prize pool/players-left/avg-stack from ledger, **live players roster**, chip legend, rotating quips,
shot clock, "who drinks?" spinner, adaptive background photo, 4K-scaled, wakeLock). **Live Session**
cloud sync (host phone ↔ TV). 4 skins, 8 per-skin accents, German/English.

### Pairing REBUILT: TV shows a code, phone types it (2026-07-25)
**Direction flipped** — the TV is a display, the phone is the controller, and you type on the
phone (never on the TV with the Magic Remote). Key pieces:
- **`Settings.deviceIsTv`** (per-device, NOT synced, not in `LiveData`): marks this device the big
  screen. When true, `App.tsx` renders `<TvMode>` fullscreen instead of the tab shell and it boots
  straight there. Exit clears `deviceIsTv` + role + code.
- **TV owns the session doc.** `liveSession.tvEnsurePairing(existingCode|null, clock)` picks an
  unused **4-digit** code (`genCode()` now 4 digits), `setDoc(sessions/{code}, { data:null, clock })`,
  and reuses the persisted code across reloads so it stays stable on screen. TvMode claims role
  `'tv'` and subscribes.
- **`LiveDoc.data` is nullable.** `null` = TV advertising, no phone yet → TV shows its OWN local
  game + the pairing card (`.tv-pair`) with the code, corner pill `Code NNNN`. When a phone connects
  and writes `data`, TvMode flips `paired`, applies `LIVE_APPLY_REMOTE` (now ALL LiveData fields —
  previously payouts/bustOrder/customQuips/break* were dropped), and the pill shows `● Live`.
- **Phone = `ConnectToTv.tsx`** (replaced `LiveSessionControl.tsx`, deleted) on the Table tab: 4 code
  boxes → `checkCodeExists` → role `'host'` + code. `useLiveHostSync` then merges its data into the
  TV's doc (host no longer creates the doc — dropped `hostCreate`/`hostEnsureExists`). Once host,
  `RemoteControl.tsx` (unchanged) is the full control panel.
- **Clock:** TV owns the tick + auto-advance (`ownsClockAdvance = role !== 'host'`; standalone also
  advances). Host preview mirrors read-only. Either side pushes discrete commands via `pushClock`.
- Standalone TvMode (no session) still runs fully local and offers a **"Use this device as the TV"**
  pill that sets `deviceIsTv`.
- **QR shortcut:** the waiting TV also shows a QR (`qrcode-generator`) encoding
  `<origin><path>?tv=NNNN`. A phone scanning it loads the app; `App.tsx` reads `?tv=` (captured at
  MODULE load into `initialTvCode` so it survives StrictMode's double-mount + the URL strip) and
  connects as host — no typing. QR opens the WEB app even on APK phones (deep-link into the APK not
  wired); manual 4-digit entry works everywhere.
- Verified end-to-end in two tabs: code 4395 generated → doc created (`data:null`) → phone typed it
  → TV went `● Live` → phone Play ticked the TV clock. No console errors.

RemoteControl (host, Table tab) still covers: clock, level length (±1/±10 + Turbo/Standard/Deep),
break length + auto-break every N, blinds (edit/add/remove), players & pool (rename, buy-in, Rebuy,
**Bust/Back-in**, add/remove), TV design (skin incl. Match + accent), toggles for players/payouts/
bust-order/quips + custom-quips editor. TV displays: payout split, knocked-out order, break cue.

### Recent work (2026-07-24/25)
- **Chip slider MAX = true smallest-first fill.** At the top of the slider (`smallBias >= 0.999`)
  the engine empties the smallest denomination first (to inventory / per-chip cap), then the next,
  maximising physical chips, then reconciles to the exact buy-in. See `computeStack()` maxChips
  branch in `distribution.ts` (+ engine test).
- **Smart adaptive TV backgrounds.** Each uploaded photo is analysed (`lib/imageAnalysis.ts`,
  16×9 contrast grid) for subject location + brightness; the TV crops toward the subject, keeps it
  clear with a focus-centred scrim, nudges the clock to the calm side, sits text on frosted plates,
  and auto-tunes scrim strength. Stored as `tvBackgroundFocus`/`tvBackgroundTone`, synced to the TV.
- **Live remote rebuilt into a full phone-side TV control panel** (`RemoteControl.tsx`, host only,
  Table tab): single clock (never runs its own countdown), level length (−10/−1/+1/+10), blind
  levels (edit/add/remove), players & prize pool (rename, buy-in, quick **Rebuy**, **Bust/Back-in**,
  add/remove), TV design (skin preset incl. Match phone + accent), toggles (show players, quips).
  All of it syncs to the TV via `LiveData`.
- **Host self-heals its session doc** (`hostEnsureExists`) — fixes the "code not found" bug where a
  `host` code was persisted in localStorage but its server doc was gone. Writes use `setDoc(merge)`.
- Phone (host) no longer shows a Join pill in its own big screen — shows a "Hosting" tag; only
  display devices get Connect. Join errors now distinguish "code absent" vs "can't reach sync".
- Players leaving/joining mid-game: **Bust** keeps a leaver for settlement (struck through on TV,
  players-left drops) via `LedgerPlayer.out`; **Add player** brings a joiner in at the buy-in.
  Design decision: we track **buy-ins only**, never per-player live chip stacks.

---

## ⚠️ Open items / next steps

0. **3D chips: built then REVERTED (2026-07-24 session).** A react-three-fiber prototype (true-3D
   ceramic chip stacks on the Plan hero + a rotatable chip showcase in Settings) was built, shipped,
   then removed — the user prefers the original SVG chips (`Chip.tsx` / `ChipStackViz.tsx`). The 3D
   deps (`three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`) were **uninstalled** and
   `src/components/chip3d/` **deleted**. Do NOT re-add unless explicitly asked. Lessons if ever redone:
   the cylinder cap samples the full inscribed circle, so the face texture must paint the WHOLE canvas
   or the rim renders black; drei `<Bounds>` fits a bounding *sphere* and shrinks a wide-flat row (use a
   manual fit-to-width camera); matte ceramic = high roughness + zero metalness + soft even lights.
   **Kept from that work:** the denom palette was matched to the real photos — `10` → `#31B6C9` (cyan),
   `100` → `#0C0C10` (black) in `store.tsx` `defaultDenoms()`. Existing users' saved colours are
   preserved by `migrate()` (only defaults change).
1. **APK is current** (rebuilt 2026-07-25 with the pairing flip + QR, run 30149580678). Rebuild anytime
   with `gh workflow run "Build Android APK" -R ndre-droid/chipstack --ref main`. **One-time:** because
   signing switched to a stable key, if an old per-run-signed APK is still installed the user must
   **uninstall it once** before the new one installs over it; every update after that preserves data.
   The **web app is the primary path** (that's what the TV runs); the APK is secondary.
2. **i18n is partial.** Nav/header/Settings/TV/Plan/Chips/Table/Cash MAIN labels are translated
   (`src/lib/i18n.ts`, `useT()`). NOT translated: engine-generated sentences (distribution.ts /
   planning.ts warnings/notes, colour-up retirement math) and a few minor inline strings — those
   need the language threaded into the engine or into those call sites. Extend the dict + wrap
   remaining strings when asked.
3. **Firestore is verified healthy** (2026-07-24, REST probe with the committed public key: GET
   missing → 404, PATCH → 200, DELETE → 200). Rules allow read+write on `sessions/{code}`. So any
   future live-sync failure is **client state, not rules** — don't re-diagnose the backend first.
   Rule is wide open (`if true`) — brute-forceable but fine for a home game; could harden + add TTL
   cleanup if wanted. Memory note: `memory/live-sync-firestore.md`.
4. **Live Session scope:** host controls clock, level/break length, auto-break, blinds, players/pool
   (incl. Bust), TV design + all the show/hide toggles and custom quips from the phone — all synced
   and immediate for the discrete ones. Still TV-local (not on the phone remote): the shot-clock and
   who-drinks spinner. Payout structure is auto (percent table by entrant count in `TvMode.tsx`), not
   yet user-editable.
5. **Composition-aware TV backgrounds: DONE** (see Recent work). Analyses each upload and lays text
   out around the subject. Could go further (face/object detection, multiple focal regions).
6. **User asked for continuous feature suggestions** — proactively pitch good ones as they come to
   mind (fun/funny/smart/useful). Some already floated: payout/prize structure on the TV,
   bust-out leaderboard, thematic evenings.

---

## User context
- Plays a home poker game with the SLOWPLAY Nash ceramic set (values 1/5/10/25/50/100/500/1000/
  5000; smooth-edge ceramic chips with a full-face gold art-deco lattice — NOT clay edge-spot
  chips). Has a **65" LG OLED (webOS) 4K TV** next to the table; runs the TV big-screen via the
  TV's own web browser at the chipstack URL (Magic Remote clicks the on-screen controls; no
  mirroring needed — phone stays free / can host + remote-control).
- Firebase project **`chipstack-live`** (their Google account). Config committed in
  `src/lib/firebaseConfig.ts`.
- Wants: settings/inputs preserved across updates (web does this natively; APK now does too via the
  stable key), simple UX, real installable APK, thematic poker nights. Communicates in mixed
  German/English. Email `ndrexelius@gmail.com`; GitHub `ndre-droid`.
- Full session-by-session detail is in the memory note `chipstack-project.md`.
