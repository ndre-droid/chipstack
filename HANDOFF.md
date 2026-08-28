# ChipStack — Handoff

A mobile app that computes **poker chip distributions** for a home game, using the chips the
user actually owns (SLOWPLAY Nash ceramic set). **Tournament OR cash-game** modes, a blind timer,
cash/settle-up ledger, sharing, a big-screen **TV mode**, **live phone↔TV cloud sync**, four visual
skins (each with its own display font), and German/English. Ships as an installable **PWA**
(primary) and an **Android APK** (built in CI). The app is intentionally **silent** (no audio — TV
sound would hijack the user's Sonos).

- **Project root:** `C:\Users\ndrex\Projects\ChipStack`
- **Stack:** Vite 8 + React + TypeScript. Capacitor 6 (Android). PWA (vite-plugin-pwa),
  single-file build (vite-plugin-singlefile), QR (qrcode-generator), icons via `sharp`,
  Firebase/Firestore (live sync, code-split), `@fontsource/{orbitron,playfair-display,fredoka}`
  (per-skin display fonts). `@capacitor/app` (native deep-link).
- **GitHub:** https://github.com/ndre-droid/chipstack (public, **lowercase** — renamed from
  `ChipStack`; old capitalised links auto-redirect). Owner `ndre-droid`.
- **LIVE WEB APP (primary):** **https://ndre-droid.github.io/chipstack/** — auto-deploys on every
  push to `main`, updates automatically, runs offline after first load. This is the main way the
  user runs it (and the only way the TV runs it — see TV/Live below).
- **APK download:** https://github.com/ndre-droid/chipstack/releases/download/android-latest/ChipStack-debug.apk
  (**CURRENT — rebuilt 2026-08-28 from `main` @ `6eb0b32`**, 4.58 MB (4,801,139 B),
  run `33155215226`: the TV perfection pass — 4K sizing, the sticky cast switch, the
  render-loop fix, the quick buy-in and the background folders (see "Recent work
  2026-08-28").
  Pages run `33155212299` green from the same commit, so **APK / `main` / Pages are IN SYNC**.
  Download verified: `200`, `application/vnd.android.package-archive`, 4,801,139 B.
  Previous build: 2026-08-26 from `main` @ `c275092`, 4.57 MB (4,790,559 B),
  run `32956874967`: the big-screen pass — arrangeable panels, per-role text size, the
  chip-spread glide, the render placeholder, TV auto-resync.
  Previous build: 2026-08-23 from `main` @ `13c1b70`, 4.50 MB (4,498,713 B),
  run `32660438449`: the session-gone signal + the clock-adjuster rework.
  `npx cap sync` again reported **2 Capacitor plugins for android** including
  `@capacitor/local-notifications@6.1.3`, and the `:capacitor-local-notifications:*`
  Gradle tasks ran — the plugin IS compiled in. Still unproven at RUNTIME: whether
  Android grants `POST_NOTIFICATIONS` and whether the level-end notification fires.
  **That needs a person with the APK on a phone** — switch on "Melden, wenn die Stufe
  endet" on the Table tab, start the clock, lock the phone, wait for the level to run out.
  Previous build: 2026-08-23 from `main` @ `35d20cb`, 4.50 MB (4,498,271 B), run
  `32659450346`: the front-to-back audit.
  Previous build: 2026-08-24 from `main` @ `f2d675a`, 4.50 MB (4,496,889 B), run
  `32656415094`: the whole UX pass (see "Recent work 2026-08-24").
  Previous build: 2026-08-23 from `main` @ `4ef5919`, 4.43 MB, run `32626027488`:
  the sync-wedge fix (undefined payload), leader marked on the name, the reworked trend line + its
  toggle.
  ℹ️ The rewritten `firestore.rules` are deliberately NOT deployed — the user chose to keep the
  wide-open rules (see STATE RIGHT NOW). Do not deploy them unprompted.
  Previous build: 2026-08-22 from `main` @ `d776a25`, 4.43 MB, run `32584988724`: stack typed in
  euros, shared clock, in-app confirms, session ownership.
  Older build: rebuilt 2026-08-15 from `main` @ `5b3bbe4`, 4.39 MB, run `31877174344`: single player roster +
  counting round, photo chip-count removed. Stable key unchanged → installs over the top, data kept.
  Pages run `31877169320` green from the same commit, so APK / `main` / Pages are IN SYNC.
  Historical build note: rebuilt 2026-08-11 from `main` @ `5a4f2ae`, 4.37 MB; AI chip count was a deliberate **ASSIST**:
  single detect+crop+vote(×3) pass, confidence = sample self-consistency, soft ⚠ flag, manual correction —
  the old 3-channel fusion + forced second-angle were REMOVED. Plus capture-mode gating (angle 22–36°,
  backlight/dark guard), the euro stack-editing feature and the NEW chip-stack app icon. Stable key unchanged →
  installs over the top, data kept. ✅ **APK, `main` and Pages are all IN SYNC** — the branch was fast-forwarded
  to `main` on 2026-08-11 and both the web app + APK rebuilt from it.
  ⚠️ **Download gotcha:** an Android **in-app browser** (Custom Tab) stalls the `.apk` at 100% ("Downloading…"
  forever) because it can't hand off to the package installer — the bytes ARE complete. Open the link in **real
  Chrome**, or install the finished file from Files → Downloads. Asset is served correctly
  (`200`, `application/vnd.android.package-archive`) — verified, nothing to fix server-side.)
- **App Links host repo:** https://github.com/ndre-droid/ndre-droid.github.io — root Pages site
  serving `/.well-known/assetlinks.json` so Android verifies `com.chipstack.app` owns the
  `/chipstack` URLs (TV QR → opens the app). Validated by Google's Digital Asset Links API.

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
- **Dev server / preview:** `.claude/launch.json` **in the project root** has `chipstack-dev`
  (npm run dev, :5173), `chipstack-verify` (:5199), `chipstack-verify-b` (:5211, for two-device live
  tests) and `chipstack-prod` (vite preview, :5200). Start with `preview_start {name:"chipstack-verify"}`
  so a chat holding :5173 doesn't collide.
- **Never send `undefined` to Firestore.** `setDoc()` rejects it outright and the queue then retries
  the same invalid payload forever ("Wiederholung (Versuch 9)"). `lib/firebase.ts` sets
  `ignoreUndefinedProperties: true` for exactly this reason — the ledger genuinely holds
  `chips: undefined` after a reset. Keep the flag, and keep `getDb()` the ONLY place a Firestore
  instance is created (`initializeFirestore` throws if `getFirestore` ran on that app first).
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
- **Browser-pane automation gotcha (not an app bug).** When the pane isn't displayed, screenshots
  time out AND the page is not focused, so a programmatic `.focus()` sets `activeElement` without
  firing focus/blur events. Any component logic that hangs off focus will look broken there. Verify
  such behaviour by asserting DOM/state, not by trusting a synthetic blur.
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
    distribution.ts  THE engine: computeStack() [smooth slider = max-chip fill then a colour-up
                     DESCENT via gentlestColorUp()/gcd — smallest value-preserving swap each step],
                     selectPool() [only the SMALLEST chip must post the blind — larger chips need NOT
                     be blind-multiples], rebalance(), closeResidual() [two-denom swap to hit buy-in
                     exactly when pool gcd < base], pickSpread().
    planning.ts      suggestBlindLadder(), colorUpEvents()
    settle.ts        settleUp() minimal-transfer
    share.ts         encode/decodeSetup (CS1: code), renderStackImage
    money.ts, i18n.ts (t() hook + en/de dict), clockLogic.ts (pure ClockState transitions),
    firebaseConfig.ts (the pasted chipstack-live web config), firebase.ts (lazy Firestore via
      initializeFirestore with ignoreUndefinedProperties:true — LOAD-BEARING, see gotchas;
      ensureAuth() — anonymous sign-in, firebase/auth dynamically imported, resolves to null on
      failure so writes still work against the old rules, and only caches a failure 5 min;
      resetAuth()),
    liveData.ts (NEW — LiveData type + dataOf + liveSignature; FIREBASE-FREE on purpose so the
      host-sync hook can import it statically without bloating the main bundle),
    liveSession.ts (Firestore session doc read/write/subscribe + tvHeartbeat + kickConnection()
      [disableNetwork+enableNetwork, un-wedges a dead write stream] — DYNAMICALLY
      imported only when a live session is used, so Firebase code-splits out of the main bundle;
      re-exports LiveData from liveData.ts),
    color.ts (NEW — darken() + customAccentVars() for the free custom-accent hex picker),
    useLiveHostSync.ts (root hook: while hosting, push the WHOLE synced slice to cloud on any
      change, debounced 400ms — keyed off liveSignature(state), NOT a curated deps list; also
      beats hostHeartbeat() every 45s so a quiet table isn't mistaken for a dead phone)
    localClock.ts    THE phone's own blind clock, OUTSIDE React (module-level ClockState +
      useSyncExternalStore). It must not live in TableScreen state: App remounts the screen on
      every tab change, which reset AND stopped the timer. Deadline-based, catches up on return.
      A standalone TvMode adopts it and writes back, so both screens show one clock.
    useHostClock.ts  the same job while HOSTING: one subscription owned by the Table tab, handed
      to RemoteControl as props. Never runs a countdown — derives from the shared deadline.
    backHandler.ts   the Android back stack — useBackHandler registers an overlay
    useWakeLock.ts   keep the screen awake (big screen + a running clock)
    platform.ts      isNative() / haptic()
    settle.ts        THE definition of a player net; settleLedger() answers
      "who pays whom" at any point in the night, carried balances included
    sidePots.ts, chipRace.ts, payouts.ts, lateReg.ts, awards.ts, leagueStats.ts
    countGlide.ts    NEW (2026-08-26) — the big screen's chip spread, walked toward each
      received one a few chips at a time (10 steps x 55ms, just under MIN_GAP_MS) so a
      dragged chip-mix slider reads as motion rather than lumps. TV surface ONLY.
    tvLayout.ts      NEW (2026-08-26) — the big screen's arrangement as data: a 12x10 grid,
      DEFAULT_TV_LAYOUT, clampSlot/normalizeTvLayout (nothing may end up off a screen nobody
      can scroll), gridAreaOf, plus the per-role text-size scale (TV_TEXT_ROLES/tvTextVars).
      Types live in types.ts; this file is the behaviour.
    pushPacing.ts    MIN_GAP_MS (700) — the floor between two writes of the game document
    tvBackgrounds.ts 21 generated big-screen backgrounds, grouped by skin
    photoStore.ts    the user's own TV photos, in IndexedDB (NOT localStorage)
    backup.ts        the whole device as one JSON file
    chipSetPresets.ts known chip sets (Nash, Dice 300/500, ...)
    levelAlert.ts    level-end notification — NATIVE ONLY, untested locally
    deepLink.ts (parseTvCode + useNativeDeepLink via @capacitor/app: chipstack://tv/NNNN → host)
    money.ts (fmtMoney/fmtNum/localeFor — language-driven grouping; i18n.ts useFmt() binds it —
      plus parseMoney(), which is why no money field is <input type="number"> any more: Chrome
      returns an EMPTY string for "47,25" and the comma IS the German decimal key)
    *.test.ts        engine tests (node --experimental-strip-types, imports need .ts extensions)
  components/
    Chip.tsx         SVG chip/plaque — SLOWPLAY ceramic: SMOOTH edge (no clay spots), full-face
                     gold octagonal art-deco lattice, octagon centre cartouche. Reads settings.chipArt.
    ChipStackViz.tsx 3D chip-cylinder stacks (curved body, per-chip divisions, perspective-
                     projected deco face). Auto-fits width (ResizeObserver).
    ShareSheet.tsx, Icons.tsx
    Onboarding.tsx     first run: buy-in / how many / how long, then derive the rest
    PeoplePicker.tsx   the regulars (AppState.people) — seat them in a tap
    JoinRequests.tsx   guests who scanned the TV code and typed their own name
    TableTools.tsx     side pots + the live colour-up / chip race
    ClockFocus.tsx     full-screen clock (tap the time in the sticky bar)
    BreakAt.tsx        break at a wall-clock time, arms once
    Timeline.tsx       what happened tonight (AppState.timeline)
    NightAwards.tsx    end-of-night titles (lib/awards.ts)
    SeasonStats.tsx    season badges, streaks, head-to-head (lib/leagueStats.ts)
    PayoutCard.tsx     the prize split on the phone (lib/payouts.ts)
    CarryCard.tsx      balances carried between nights (AppState.carry)
    StartingStack.tsx  the "stack everyone gets" card on the Table tab (computeStack + ChipStackViz)
    SeasonLeague.tsx   NEW — season league on the Cash tab (save night → net/ROI standings + history)
    PlayerRoster.tsx   THE player list (Table tab): join / rename / emoji / rebuy / stack / cash-out /
                       bust / remove. Replaced the player-count stepper + the photo chip-count card.
    CountRound.tsx     counting-round sheet, TWO modes (Settings.countMode, default 'money'):
                       type the euro amount per player, or tally by denomination (−/+1/+20).
                       "assign the rest" for the last player, summary, one LEDGER_SET_CHIPS_MANY dispatch
    EmojiPicker.tsx    the 74-emoji set + grid, shared by PlayerRoster and RemoteControl
    MoneyInput.tsx     EVERY money field. Text + inputMode=decimal + parseMoney; keeps the raw
                       text while typing and only re-syncs when the value changes from elsewhere.
    Toggle.tsx         the on/off switch. A <button>, not a <div role="switch"> — the old one had
                       no tab stop, which breaks a laptop being used as the big screen.
    Confirm.tsx        useConfirm() + the in-app dialog. window.confirm blocked the JS thread, so
                       the live-sync queue and the clock stopped while it was open.
    TvBroadcast.tsx    TV design/accent/quips/roster order/PER-ROLE TEXT SIZE/panel-arrangement
                       note+reset/background/penalties+house-rules/show-on-TV — its own collapsible
                       at the TOP LEVEL of the Table tab (2026-08-26: it used to be inside the
                       "Tisch-Setup" fold, which is two taps for the one thing you reach for
                       DURING a night). Syncs while hosting.
  screens/
    PlanScreen.tsx   result-first: stack hero (count/BB/viz/value-bar/blind-check) + small-chip
                     slider up top; config (players/buy-in/blinds/options) below a "Session setup"
                     divider; collapsible "Later levels & colour-up"; fine-tune editor; share.
    ChipsScreen.tsx  inventory editor
    TableScreen.tsx  sticky level/blinds/time/play bar (.table-sticky) + ConnectToTv + starting
                     stack + roster + blind clock + "Big screen · TV mode" + RemoteControl (host
                     only, clock passed as props); game mode, TV broadcast and dealer/seat draw are
                     folded into a "Tisch-Setup" disclosure once anybody has sat down.
    ConnectToTv.tsx  phone-side link: 4 code boxes → checkCodeExists → role 'host' + code
                     (replaced LiveSessionControl.tsx). Firebase-configured only.
    GuestView.tsx    a guest's own phone: read-only table, put your name in, vote
    TvMode.tsx       fullscreen landscape big-screen dashboard (clock/standings/legend/colour-up/
                     quips/shot-clock/who-drinks). Panels live in <TvCell> wrappers with TWO
                     layouts: `auto` (the tuned three columns, still the default) and `grid`
                     (12x10, once tvLayout is set or Arrange is on) — see lib/tvLayout.
                     If deviceIsTv: advertises a pairing code
                     (tvEnsurePairing), shows .tv-pair card until a phone connects, then mirrors
                     the host's data + OWNS the countdown. NO on-screen keypad (phone types the
                     code). Standalone shows a "Use this device as the TV" pill. clamp()→4K.
    RemoteControl.tsx phone's clock remote (host only); sends commands, never runs a local timer.
                     Takes clock/send as PROPS from TableScreen — it used to open its own
                     subscription, so the tab had two listeners that could disagree.
    CashScreen.tsx   persisted ledger → who-pays-whom
    SettingsScreen.tsx Language, Style (4 skins), Appearance (minimal only), Accent (per-skin, 8),
                     TV broadcast style (+ Match phone), TV extras (quips toggle + background photo
                     upload w/ canvas downscale), Show on TV (URL + copy + QR), Live Session
                     (start/stop), Chip art, Money mapping, blinds, currency, reset.
android/             Capacitor project. app/build.gradle has signingConfigs.chipstack →
                     ../keystore/chipstack.jks (committed), applied to debug+release buildTypes.
keystore/chipstack.jks   committed stable signing key (generated once in CI).
.github/workflows/   deploy-pages.yml, build-apk.yml
scripts/gen-icons.mjs    THE icon source (SVG drawn in JS) — regenerates all 19 PWA + Android
                     launcher icons. Current mark: "chip stack" (graded lime bars on #1A1A1E).
                     Must stay in scripts/ — it resolves the repo root as '..'.
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
Plan (result-first), Chips inventory, **Table = session hub** (game-mode toggle, connect-to-TV,
starting-stack card + "Show on TV", players/pool with rebuy/bust/cash-out, blind clock, live
RemoteControl when hosting, TV-broadcast config, dealer/seat draw), Cash ledger + settlement,
Settings. **Distribution engine** with a SMOOTH small-chip slider (colour-up descent — exact +
monotonic), exact buy-in, per-chip min/max, up-to-N types, use-all toggle, colour-up guide, live
fine-tune editor, presets, CS1 share code + QR + PNG. **Tournament / cash** modes (cash: chips=money,
fixed blinds, cash-out removes money from the table, no payouts/bust board). **TV mode** (big clock,
visual flash cue — NO audio, break + cancel, prize-pool/on-the-table + players-left + avg-stack,
live roster with departed-player net, payout split + bust board (tournament), chip legend, rotating
quips, shot clock, "who drinks?" spinner, cast-starting-stack overlay, custom photo + 6 themed
background presets, language toggle, 4K-scaled, wakeLock). **Live Session** cloud sync (host phone ↔
TV). 4 skins each with its own display font, 8 per-skin accents, German/English. **Android App Links**
(TV QR → opens the app; assetlinks hosted at `ndre-droid.github.io`).

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
- **Connect toast:** the moment a phone pairs (paired false→true), the TV flashes "📱 Phone
  connected" for ~4s (`.tv-toast`, `tv.phoneConnected`). Generic — no per-phone name (no identity
  model); could add a name later if wanted.
- **QR shortcut:** the waiting TV also shows a QR (`qrcode-generator`) encoding
  `<origin><path>?tv=NNNN`. A phone scanning it loads the app; `App.tsx` reads `?tv=` (captured at
  MODULE load into `initialTvCode` so it survives StrictMode's double-mount + the URL strip) and
  connects as host — no typing. **APK deep-link now wired (2026-07-26)** — see the deep-link section
  below. Manual 4-digit entry works everywhere.
- Verified end-to-end in two tabs: code 4395 generated → doc created (`data:null`) → phone typed it
  → TV went `● Live` → phone Play ticked the TV clock. No console errors.
- **CRASH FIX (black screen on Table tab).** Since the host only *merges* `data` (TV owns the clock),
  a session doc can exist with `data` but **no `clock`** — e.g. a stale pre-rebuild `host` session or
  a dead code (`useLiveHostSync` merge-creates a clock-less doc). Subscribers did
  `setClock(doc.clock)` → `undefined` → `clock.onBreak` threw → `RemoteControl` crashed → Table blank.
  Fixed two ways: (1) **guard `if (doc.clock)`** before use in BOTH `RemoteControl` and `TvMode`
  subscriptions (never overwrite a valid clock with undefined); (2) `migrate()` **drops any persisted
  non-4-digit `liveSessionCode` (+role)** — pre-rebuild codes were 6-digit and are meaningless now, so
  users left as host of a dead session are unstuck. **Invariant: never trust `doc.clock` to exist.**
  Verified both cases render cleanly. Memory: `memory/live-sync-firestore.md`.

RemoteControl (host, Table tab) still covers: clock, level length (±1/±10 + Turbo/Standard/Deep),
break length + auto-break every N, blinds (edit/add/remove), players & pool (rename, buy-in, Rebuy,
**Bust/Back-in**, add/remove), TV design (skin incl. Match + accent), toggles for players/payouts/
bust-order/quips + custom-quips editor. TV displays: payout split, knocked-out order, break cue.

### Recent work (2026-08-26 — the big-screen pass, commit `c275092`, SHIPPED)
The seven things the user asked for after a real night, plus one bug found on the way (5).
`main` + Pages + APK all at `c275092`.

1. **The chip spread stuttered on the TV while the slider was dragged.** The cause is not the
   delay — a screen four metres away is forgiven a beat — it is the LUMPS: every push is a write
   of the whole game document, paced at `MIN_GAP_MS` (700ms, `lib/pushPacing`), so the TV learned
   about a drag seven chips at a time. Fixed on the RECEIVING side, where it costs nothing:
   `lib/countGlide.ts` holds a displayed count per denomination and walks it toward whatever the
   phone last said. Constant speed, budget of `GLIDE_STEPS` (10) x `GLIDE_STEP_MS` (55) = 550ms,
   deliberately just under the push gap so the pile is moving almost the whole time. The stride is
   `remainder / stepsLeft`, NOT `remainder / N` — the second eases out, and the tail then trickles
   one chip per tick so a 40-chip change takes two and a half push-gaps and a hard drag falls
   further behind the longer it goes on. Past `GLIDE_MAX_LAG` (90 chips) it gives up and jumps: a
   whole new spread is not a slider. Wired in `ChipStackViz` for `surface === 'tv'` ONLY — the
   phone's own slider is local and instant, and gliding it would add lag where there was none.
   Verified live in the browser: `x2 -> x5 -> x8 -> x10 -> x12`, landing exactly on target.
2. **The app came up in one chip design and swapped to another.** `Chip3D` was drawing the VECTOR
   chip while the render was in flight, which is not a loading state — it is a different chip.
   Now a pending single chip is a dim disc in its own colour (`.chip-ph`) and a pending pile is a
   faceless dimmed silhouette (`.stack-layers.is-ghost`) that the real one fades over
   (`.is-render`). `warmChip3d()` starts three.js + the model at boot on idle, so there is usually
   nothing to wait for. **A device that cannot render still gets the drawn chip immediately and
   for good** — `chip3dSupported()` (now memoised) is checked up front, and `useChipLayers`
   reports `failed` separately from "not there yet", because a placeholder that never resolves is
   worse than the other chip design. Measured on a cold load: 9 placeholders, **0** full vector
   chips, all resolved.
3. **The panels are arrangeable.** `lib/tvLayout.ts` makes the placement data — a coarse 12x10
   grid — and TvMode grows a grab bar + resize corner under **Arrange** (pointer events, snaps to
   cells, grid lines drawn while editing, Reset). The tuned three-column layout is STILL the
   default: `.tv-grid[data-mode='auto']` until `tvLayout` is set or Arrange is on, then
   `data-mode='grid'`. That is deliberate — the auto layout is tuned around what each panel needs
   and what a short window does to it, and the grid should only win when the placement is the
   user's answer rather than a guess. Offered only where it sticks (`canArrange = !isTv ||
   !paired`): a screen a phone is driving mirrors the phone's arrangement, so an edit made on the
   TV would be overwritten by the host's next push.
4. **Text size is per role** (clock / blinds / level / players / chip values / stats / sayings),
   0.6–2.2x, in TvBroadcast. `tvScale` answers "this laptop is not a TV" and could never answer
   "the clock is fine and the names are too small". Implemented as `--tv-fs-*` custom properties
   multiplying the existing `clamp()`s, so the responsive sizing keeps working.
5. **A real bug found while measuring that:** the roster fitter compared
   `first.getBoundingClientRect().height` (SCREEN pixels) against `el.clientHeight` (the layout's
   own). The whole TV is laid out small and scaled back up, so on any zoomed display every roster
   sat about a third smaller than it was allowed to be — the names near the legibility floor with
   room to spare above them. Both sides are in the same pixels now (the zoom is read off the
   element itself, so a transform anywhere up the tree is accounted for). 11.5px -> 15.3px at
   identical settings. **This was probably most of "the font on the TV is a little small".**
6. **TvBroadcast moved out of the "Tisch-Setup" fold** to the top level of the Table tab.
7. **Opening the link on the TV showed a very old session** until the user hit Push by hand. The
   host pushes on CHANGE, and a screen turning up is not a change — nothing about the phone moved,
   so nothing went out and the TV sat on whatever the 24h-TTL session document had been carrying.
   `useLiveHostSync` now also pushes when the document holds **no data** (a screen that just
   claimed the code) and when a **TV heartbeat arrives after >60s of silence**
   (`TV_RESTART_GAP_MS`; the TV beats every 25s, so a longer gap means it was just opened), plus
   on the phone returning to the foreground. Chosen over adding a `tvBootAt` field ON PURPOSE:
   `fieldsOk()` in `firestore.rules` is a `hasOnly([...])` whitelist, so a new top-level field
   would be rejected the day those rules are ever deployed. **Not verifiable locally** — needs a
   real Firebase session and two devices.
8. **The pale strip along the top of the TV.** `.tv` is fixed at 100% of the viewport, but a TV
   browser's viewport and what you can SEE are not always the same rectangle (a collapsing
   toolbar, a rounding error on a panel scaling 4K to 1080p) — and what showed through was the
   PHONE app's background, near-white in the light skins. `html[data-tv-full]` paints the page in
   the big screen's own ground while it is up, so any sliver is invisible instead of a bar; plus a
   **Fullscreen** button, which is the only real fix if that strip is browser chrome. Could not be
   reproduced locally (the big screen filled the viewport exactly), so both were done.

New synced settings `tvLayout` + `tvTextScale` — the screen has no pointer or keyboard to set them
with, so they travel with the SETUP, which means all four spots: `types.ts`, `store.tsx` (default,
migration, `LIVE_APPLY_REMOTE`), `liveData.ts`, and the TV's own apply in `TvMode`. `tvLayout` is
stored as `null` while it is the stock arrangement, so a device that never touched it does not
carry (or push) a copy of the default.

New tests: `countGlide.test.ts`, `tvLayout.test.ts`. 21 test files green, `tsc -b` + `oxlint` +
`vite build` clean.

### Recent work (2026-08-23 (2) — session-gone signal, clock adjuster, time-shaped tests)

Commit `13c1b70`. `main`, Pages (`32660374730`) and the APK (`32660438449`) all carry
it. Everything below was verified against the LIVE Firestore project, not mocked.

**A deleted session used to be swallowed in silence.** `subscribeSession` did
`if (snap.exists()) onUpdate(...)` and nothing else, so when the big screen was
switched off and took the pairing document with it, nobody watching found out. The
host phone sat on "● Live", faded to "⚠ Handy offline" a minute later, and kept
heartbeating into a document that no longer existed — and since that heartbeat was a
merge `setDoc`, **it created it again**: a zombie session holding only a heartbeat,
alive until the TTL sweep 24 h later, carrying no `tvUid` and therefore (under the
strict rules) writable by anyone who guessed the four digits.

- `subscribeSession(code, onUpdate, onConnected?, onGone?)`. **`onGone` only fires
  once the document has been seen ALIVE** (`seenAlive`) — a "no such document"
  snapshot before that is just the cached first read of a document the client does
  not know yet, and firing on it would break every fresh pairing.
- **The TV puts its own session straight back**: same four digits, and the CURRENT
  clock, not a fresh level 1. A `clockRef` written on render feeds
  `tvEnsurePairing`, and a `pairSeq` counter in the effect's deps is what re-runs it.
  Verified: deleted `sessions/2258` over the REST API while the TV ran level 2 → it
  re-advertised 2258 and re-created the doc with `levelIdx: 1, running: true`.
- **The host disconnects and says so** (`connect.ended`). Verified: same delete → the
  phone dropped role + code and returned to the code-entry card.
- **A guest is told the night is over** (`guest.ended`) instead of staring at a
  frozen table.
- **`hostHeartbeat` is `updateDoc`, not a merge `setDoc`** — it can no longer
  resurrect anything; it rejects `not-found` and the caller already ignores that.
  Verified: the deleted session was still gone 50 s later, past a full beat interval.
  `hostPushData` keeps its merge write on purpose (the documented self-heal).

**"+1" now means "give this level one more minute".** `setMinutesPerLevel` reset the
running period to the full new length, so with 4:12 on the clock one +1 tap jumped to
21:00 and the level everybody was playing started again — and "we need a bit longer",
the only reason anyone touches buttons under a running countdown, could not be
expressed at all. It shifts the period by the delta now; the new length still applies
in full from the next level (`goLevel`). Shortening **floors at 10 s** so −10 with
4:12 left reads as "as short as I can make it" rather than silently putting the
blinds up. Asking for the length you already have is now correctly a no-op.
- That made ↺ a no-op, because it was spelled `setMinutesPerLevel(c,
  c.minutesPerLevel)` and only worked as a side effect of the restart. **New
  `resetPeriod(c, breakMinutes?)`** — it also restores a break, which the Table tab
  never could.
- Verified in the preview: 19:50 +1 → 20:49 · 20:41 −10 → 10:40 · ↺ → full length.

**Tests for the time-shaped code** (12 → 16 files). Everything money-shaped was
covered and nothing time-shaped was.
- `clockLogic.test.ts` — 48 checks with **`Date.now` stubbed**; a deadline clock
  tested against the wall clock is a test that fails on a slow machine. Covers the
  long-freeze case a ticking counter gets wrong, and the new adjust/floor/no-op rules.
- `payouts.test.ts` — every entrant count × pool adds up to the pot EXACTLY (the
  €65-printed-as-€66 rounding bug), plus split normalisation and resizing.
- `lateReg.test.ts`, and `share.test.ts` — a full CS1 round trip that also asserts
  the code carries no device-local field and stays under 2.5 kB.
- ⚠️ `share.ts` now imports `./settingsScope.ts` **with the extension** — that is what
  lets `node --experimental-strip-types` run `share.test.ts`. Keep it.

### Recent work (2026-08-23 — front-to-back audit, commit `76c5790`, PUSHED)

`main`, Pages and the APK all carry this (Pages run `32658723307`, APK run
`32659450346` from `35d20cb`, both green). `npx tsc -b`, `oxlint`, `npm test`
(12 files) and `npm run build` are clean.

**THE BIG ONE: a setup is chips and blinds, not a device.** `Settings` is one flat
object and three separate paths copied ALL of it — the CS1 share code, a saved
preset, and a backup file. New **`lib/settingsScope.ts`** is now the single answer
to "what may travel":

- `DEVICE_LOCAL_SETTINGS` — `deviceIsTv`, `liveSessionCode`, `liveSessionRole`,
  `guestName`, `guestEmoji`, `onboardedAt`, `tvScale`, `rosterSort`, `countMode`,
  `levelAlerts`, `breakAt`, `tvBackground(+Focus/Tone)`.
- `shareableSettings(s)` strips them on the way OUT (share code, preset).
- `applySharedSettings(current, incoming)` pins them back from THIS device on the
  way IN — so a payload written by an older build is stripped too. Old codes and
  presets already in people's hands are therefore safe.
- `pinned()` returns `Pick<Settings, DeviceLocalKey>`, so the list and the function
  cannot drift: adding a key to one without the other is a type error.

What it fixed, each verified in the dev preview:
- the share code carried the sender's pairing code + guest name, and once a TV photo
  had been picked, a few hundred kB of base64 — **which is why the share QR could not
  be scanned**. 1936 chars now, none of those fields.
- **loading a preset disconnected a running live session**, dropped the TV's zoom and
  wiped the background photo. Session `4711`/host, zoom 1.4 and the photo all survive
  a save + load now.
- a backup taken on the big screen **booted the phone that restored it into TV mode**,
  claiming the `tv` role of a dead session. `RESTORE_STATE` also runs the file through
  `migrate()` now, so an older backup lands with every current field defaulted.
- `Preset.settings` and the CS1 payload's `g` are typed `Partial<Settings>`.
- `src/lib/settingsScope.test.ts` covers both directions + the legacy payload.

**Live sync.**
- `ConnectToTv`'s `HEARTBEAT_STALE_MS` was **30s against a 25s beat** (its comment
  still claimed 12s, from before the interval was slowed) — so a perfectly healthy TV
  flipped to "⚠ TV offline" between two beats. **70s** = two missed beats + the 5s
  check granularity.
- `tvEnsurePairing` used to give up after 8 taken codes and **`setDoc` over the last
  one it tried** — landing on a session other people were in the middle of. It tries
  16 and then throws; the caller already retries on the next mount.
- **Nine `import('./liveSession').then(...)` chains had no `.catch`.** The chunk is
  deliberately kept out of the precache (`globIgnores` in vite.config), so a phone
  that is offline the first time it pairs cannot load it — every one of those was an
  unhandled rejection and a silently dead feature. All degrade to "keep showing what
  we have" now. Same for the IndexedDB photo store (unavailable in some private modes).
- The guest's **"Sent — you'll appear once the host seats you" was printed whether or
  not the write left the phone.** It now reports the failure (`connect.error`) and
  lets them try again. `data.moments` is guarded — an older host build without the
  field used to blank the guest screen.

**i18n.** The Table tab's clock card printed `Level 1` / `Next: 25 / 50` /
`min / level` in English under a German UI — the keys existed and `RemoteControl` was
already using them. 19 new keys cover the rest: the dealer-draw empty state, "Add N
players", the ladder hint, the ante, the three background-upload errors, and **13
aria-labels that were hardcoded English** on the phone and the big screen (a German
screen reader read "Previous level"). `en` and `de` are both at 712 keys, nothing
used-but-undefined — check with a key-diff script if you touch it.

**`theme-color` was nailed to `#0a0a0c` in index.html**, so the browser chrome above
the app was a black stripe under the cream playful skin and in minimal's light mode.
`App.tsx` now sets it from the live `--bg` (flat in every skin; `--app-bg` is a
gradient in two). Verified `#faf9f6` light / `#0d0d10` dark.

**Housekeeping.** The user's design reference photos next to the project
(`Chips source pics and links/`, `koffer.png`, ~4 MB) are gitignored instead of
sitting in `git status`. `.claude/launch.json` gained `chipstack-verify-c`
(`autoPort`) so a second session can run its own dev server.

⚠️ Two things were looked at and deliberately NOT changed: the Firestore rules are
still undeployed by the user's decision (see below), and the wide-open rules stay.

### Recent work (2026-08-24 — the big UX pass: 45 items, all of them)

The user asked for a full UI/UX review and then said "do all of it". What follows is
what landed. `npx tsc -b`, `npm run build`, `npm test` (11 files) and `oxlint` are all
clean; every item below was checked in the dev preview unless it says otherwise.

**Correctness — the settle-up tab was lying.**
- `netOf()` / `stackMoney()` / `settleLedger()` in `lib/settle.ts` are now the ONE
  definition of a player's result. The Cash tab counted only `cashOut − buyIn`, so
  mid-game every still-playing player read as `−buy-in` while the roster showed them
  up; and the moment ONE player cashed out it printed a confident payment list built
  from balances that did not sum to zero (`settleUp` silently truncates the excess).
  An uncashed stack now counts as what that player would take right now, the card is
  labelled **provisional**, and `imbalance` is surfaced instead of swallowed.
- **"Jetzt abrechnen"** (`LEDGER_SETTLE_ALL`) books every remaining stack as a
  cash-out and closes the night.
- `session.playerCount` follows the roster. It is decided in ONE place (the reducer
  wrapper), because deleting somebody from the player sheet used to miss it, and
  `migrate()` repairs an already-drifted save. The Plan stepper goes read-only once
  anybody is seated.

**Platform / shell.**
- **Android back** — `lib/backHandler.ts` + `useBackHandler`. Sheets and dialogs
  register themselves; App falls back to leaving Settings, then press-again-to-exit.
  Native uses `@capacitor/app`'s `backButton`; the web/PWA keeps one spare history
  entry and re-pushes it. Registered by: Confirm, ShareSheet, CountRound (numpad
  first), PlayerSheet, PeoplePicker, TableTools, ClockFocus, the big screen, and the
  roster's inline editors.
- **Screens stay mounted** (`App.tsx` renders every visited view, only the active one
  is displayed). `key={view}` was throwing away scroll and every piece of local UI
  state on each tab change. Scroll offsets are recorded on `scroll`, NOT on switch —
  `display:none` has already zeroed `scrollTop` by the time an effect could read it.
- **Last tab is remembered** (`chipstack.view`), and a first launch with players on
  the table opens on Table.
- **WakeLock on the phone** — `lib/useWakeLock.ts`, shared with TvMode, held while the
  countdown runs.
- Language is detected from `navigator.language` on a first run only.
- Haptics on rebuy / cash-out / bust / card draw (`lib/platform.ts`).

**New screens and tools.**
- `components/Onboarding.tsx` — first run asks three questions (buy-in, how many, how
  long) and derives the rest via `ladderForDuration()` in `lib/planning.ts`.
  `Settings.onboardedAt` is `0` for existing installs, so nobody who already set the
  app up ever sees it.
- `components/PeoplePicker.tsx` + `AppState.people` — the regulars, saved once and
  seated in a tap, with payment details for the settle-up. `lastLineup` powers
  **"Wie letztes Mal"** in the empty roster. Renaming a seated regular updates their
  profile.
- `components/TableTools.tsx` — **side pots** (`lib/sidePots.ts`) and the **live
  colour-up / chip race** (`lib/chipRace.ts`), both property-tested.
- `components/ClockFocus.tsx` — full-screen clock, opened by tapping the time in the
  sticky bar.
- `components/Timeline.tsx` + `AppState.timeline` — what happened tonight, recorded by
  DIFFING the ledger in the reducer, so no call site can forget. Undo pops the last
  entry.
- `components/NightAwards.tsx` (`lib/awards.ts`) — end-of-night titles, shareable.
- `components/SeasonStats.tsx` (`lib/leagueStats.ts`) — season badges, streaks,
  head-to-head, shareable season card.
- `components/PayoutCard.tsx` (`lib/payouts.ts`) — the prize split on the PHONE, with
  the number of paid places adjustable and the bubble named. TvMode uses the same
  helper. `Settings.payoutSplit` is synced.
- `components/CarryCard.tsx` + `AppState.carry` — results carried between nights,
  folded into the settlement so one list of payments settles everything.
- `components/BreakAt.tsx` — a break at a wall-clock time ("the pizza gets here at
  ten"). Arms once and clears itself.
- **Late registration** (`lib/lateReg.ts`, `Settings.lateRegLevels`, synced) on the
  sticky bar and the big screen.
- **Backup** (`lib/backup.ts`) — the whole device as one JSON file, TV photos
  included; the parser is strict and tested.
- **Chip sets** (`AppState.chipSets` / `activeChipSetId`) and `lib/chipSetPresets.ts`
  (Nash, Dice 300/500, casino colours, cent values). `denominations` is still THE
  active set, which is why this stayed a small change.
- **"Was dir fehlt"** — `StackResult.shortfall` is structured now, so the Plan tab
  prints a shopping list instead of only a red warning.
- Roster sorting (`Settings.rosterSort`, per-device, deliberately NOT the TV's sort),
  44px tap targets, landscape layout, sync age on the live pill.
- **Length-first ladder on the Plan tab** — `ladderForDuration()` is reachable outside
  the first-run wizard now (2 / 3 / 4 / 5 h chips next to "Suggest for my chips"),
  because "we have until midnight" changes and the onboarding only runs once.
- **`--text-faint` was failing WCAG AA everywhere.** Measured, not eyeballed: 2.58-2.89
  in the minimal skins, 2.34 in playful, 3.14 in sci-fi, 4.40 in casino, all against
  their own surfaces. It carries labels, hints and timestamps at 10-12px. Every skin's
  value was recomputed to clear 4.5:1 against surface, surface-2 and bg; the TV's
  `--tv-faint` is untouched (large text, 3:1 applies).

**Guests (this is the one that changes how a night starts).**
- A scanned code no longer makes you the host: `RoleChoice` in `App.tsx` asks. Role
  `'guest'` renders `screens/GuestView.tsx` — read-only clock, blinds and stacks, plus
  the two things a guest can do: put their own name in, and vote for the hand of the
  night.
- `requestSeat` / `subscribeJoins` / `clearJoin` and `castVote` / `subscribeVotes` in
  `lib/liveSession.ts`, each in its OWN document (`NNNN-joins`, `NNNN-votes`) so a
  guest never touches the host's game payload. Transactions, because everyone taps at
  once. `components/JoinRequests.tsx` is the host's side; the TV shows the winning
  moment. Verified end-to-end against the live project.
- `firestore.rules` were extended for both documents (still NOT deployed — see the
  Firebase note above; the live rules remain wide open by the user's decision).

**Big screen.**
- **Every skin now repaints the whole screen, not just the blinds.** Four role tokens
  — `--tv-head` / `--tv-body` / `--tv-num` / `--tv-digits` — per `data-tv-skin`.
  Casino is Playfair throughout, Playful is Fredoka, Sci-Fi is Orbitron including the
  clock; everything else keeps monospaced digits, because the countdown repaints every
  second and a proportional face makes the whole screen twitch.
- **Backgrounds 9 → 21**, in `lib/tvBackgrounds.ts`, ordered so the ones drawn for the
  chosen skin come first. New for casino: Art Deco, Velvet, Suits, Spotlight. For
  sci-fi: Horizon, Nebula, Circuit, Datastream. Generated SVG, 18 kB each at most. The
  random ones (Xmas) are seeded now — they used to produce a different data URL on
  every load, which quietly lost the selection.
- **Own photos are kept.** `lib/photoStore.ts` puts them in IndexedDB, not
  localStorage: one downscaled photo is ~200 kB of base64 and the whole app state
  shares a few MB. Per-device, never synced; the live session still carries only the
  ONE active background.
- **Switching style resets a custom accent.** A free custom accent overrides `--acc`
  for every skin, so it followed you into the new style and cancelled the thing you
  had just picked. Per-skin accents are untouched.

**Two things worth knowing about the tooling.**
- `scripts/i18n-add.mjs` appends keys to `lib/i18n.ts` from a small JSON file and
  refuses a key that is missing a translation. ~350 strings were added this pass; do
  not hand-edit that file any more.
- The Bash tool mangles backslashes inside quoted heredocs. Writing `\n` into a source
  file through one produces a real newline and breaks the file. Use the Write tool, or
  build the backslash with `chr(92)`.

**⚠️ Not verifiable locally:** `@capacitor/local-notifications` was added for the
level-end notification (`lib/levelAlert.ts`, `Settings.levelAlerts`, switch on the
Table tab). It is gated to native — Capacitor has no web implementation and calling
the browser proxy throws `UNIMPLEMENTED`. **The next APK build is the first real test
of it**, both that `npx cap sync` picks the plugin up and that the notification fires.
Note the plugin proxy answers to every property including `then`, so it must never be
returned straight out of an `async` function (that was the first bug).

### Recent work (2026-08-23 — the sync-wedge bug, leader marking, the trend line)

**THE live-sync bug is fixed, and it was not what the retry UI suggested.** Symptom: the TV stopped
updating after the user reset the table, and the Table tab sat on *"Noch nicht gesendet — Wiederholung
(Versuch 9)"* with the Push button doing nothing. Cause: the app models "no stack / never busted" as
`chips: undefined`, `outAt: undefined`, `chipHistory: undefined` — exactly what `LEDGER_RESET_ALL`
("Tisch zurücksetzen"), a cash-out and `LEDGER_CLEAR_CHIPS` write into every ledger row. **`setDoc()`
rejects an undefined value outright** (`invalid-argument: Unsupported field value: undefined`), so from
that dispatch on every push threw before it left the phone and each retry hit the same invalid payload.
It looked intermittent because `liveSignature`'s `JSON.stringify` and localStorage BOTH drop undefined
keys — so the change still registered as a change, and a reload cleaned the state up.
Reproduced + verified against the live project with a throwaway node script: the plain client throws,
`initializeFirestore(app, { ignoreUndefinedProperties: true })` writes. That option is now set in
`lib/firebase.ts` and is **load-bearing — do not "tidy" it away**.

Hardening added around it (the failure was invisible, which is half of why it took a session to find):
- `liveSyncQueue` keeps `lastError` (SDK code + message) instead of swallowing the catch; it is shown
  under the sync line on the Table tab (`.sync-why`) and `console.warn`ed.
- Two consecutive failures — or pressing Push while stuck — call the new `kickConnection()`
  (`disableNetwork` + `enableNetwork` + `resetAuth`, in `lib/liveSession.ts`). A wedged Firestore write
  stream accepts writes and never acknowledges them, and the installed APK has no reload to fall back on.
- The Push button is no longer `disabled` while a push is stuck — that was exactly when it was needed.
- `ensureAuth()` remembers a FAILED sign-in for 5 minutes, not forever (it used to cache the failure for
  the life of the app, so one offline moment meant signed-out until a force-quit).
- Two new checks in `liveSyncQueue.test.ts` cover the kick (automatic + manual). All tests green.

**Backend probe, 2026-08-23 (unchanged since):** the strict rules are still NOT deployed
(unauthenticated REST read of `sessions/0000` → `200`), and **Firebase Authentication is not
initialised in the project at all** — `accounts:signUp` → `400 CONFIGURATION_NOT_FOUND`, so
`signInAnonymously` can never succeed today. **The user has decided to leave it that way** ("niemand
wird versuchen den code zu knacken") — a home game, four digits is enough of a lock. Do not deploy the
rules without enabling Anonymous auth first; doing so locks everyone out, including the user.

**The crown is gone.** It sat between the player's own emoji and their name, so it read as a second
emoji and shoved every leader's name sideways. The chip leader is now marked on the NAME: weight 800,
accent colour, hairline accent underline — `.pr-name-btn.leader` on the phone,
`.tv-players-name.leader` on the TV. Same rule both places.

**The stack trend line was perfected and made optional.**
- It appeared for only two players out of six because `LEDGER_SET_CHIPS_MANY` appended a trail point
  only to the rows in that dispatch — so typing ONE player's stack gave that player a longer history
  than everyone else. Now a counting round appends a point to **every player still in play**; an
  uncounted one carries their last known stack forward. Undo snapshots the whole ledger to match (both
  call sites in `CountRound.tsx` and `PlayerRoster.tsx`).
- What it means is now drawn: `Sparkline` takes a `baseline` (break-even = buy-in − cash-out, in chip
  units) and draws it as a dotted line; the path takes its colour from where it ENDS — `var(--good)`
  above, `var(--bad)` below. Two points is still the minimum.
- Switchable: Table menu (`↺`) → **"Trendlinie anzeigen"**, `Settings.showTrend` (default on), synced
  to the TV like the other display choices (3 spots: `LiveData`, `dataOf`, the TV's `LIVE_APPLY_REMOTE`
  block — plus the action type + `migrate()` in the store).

### Recent work (2026-08-22 — stacks are typed in euros; app-wide audit fixes)
Two things: the stack-entry rework the user asked for, then the whole list of problems the
audit turned up. **NOT deployed** — see the ⚠️ Firebase steps at the end.

**Stacks: typing the euro amount is now the primary path.**
- Roster row: tapping the stack opens an inline `€` field (`StackPrompt` in `PlayerRoster.tsx`)
  with `= Buy-in` / `+€x` quick chips; Enter saves. Colour tallying is a `🧮 Nach Farben` button
  inside that panel.
- `CountRound` gained a mode switch, **`Betrag eingeben` is the default**: one big money field per
  player, pre-filled with what they are believed to hold, `Rest zuweisen` on the last player. The
  colour-by-colour sheet is unchanged behind `Nach Farben zählen`. The choice persists in the new
  `Settings.countMode`.
- Both paths commit through `LEDGER_SET_CHIPS_MANY`, so the trail, sparkline, undo snackbar and
  the single TV push behave exactly as before.

**The comma bug (this one was eating money).** `<input type="number">` returns an EMPTY string for
`47,25` in Chrome — and a comma is the decimal key on a German keyboard, so amounts silently became
0. New `parseMoney()` in `lib/money.ts` (+ `money.test.ts`) and a `components/MoneyInput.tsx`
(`type="text" inputMode="decimal"`, keeps the raw text while typing). Every money field in the app
now uses it: roster, counting round, player sheet, Plan buy-in/rebuy, bounty, chip unit value.

**Clock.** `lib/localClock.ts` — the phone's own clock moved OUT of `TableScreen` state. It used to
reset (and stop) every time you left the tab, because `App` remounts the screen via `<main key={view}>`.
Now it is a module-level deadline-based `ClockState` that catches up on return. `lib/useHostClock.ts`
does the same job for a hosting phone (one subscription, owned by the Table tab), and `RemoteControl`
takes `clock`/`send` as PROPS instead of subscribing itself. **A standalone TV now shares the phone's
clock** — opening the big screen continues the same countdown instead of forking a second one.

**Table tab UI.** A sticky bar (`.table-sticky`) pins level / blinds / time / play-pause to the top
while you scroll the roster; game mode, TV broadcast and dealer/seats are folded into a `Tisch-Setup`
disclosure once anybody has sat down.

**Roster.** Names are read-only until tapped (a stray scroll-tap used to rename people), the chip
leader is marked (👑 then; the NAME itself since 2026-08-23), and each still-playing row shows its
live net.

**`window.confirm` is gone** (6 uses) — `components/Confirm.tsx` + `useConfirm()`. The native dialog
blocked the JS thread, so the live-sync queue and the clock stopped while it was open.

**Accessibility.** `components/Toggle.tsx` — every switch was a `<div role="switch" onClick>`: not
focusable, not operable by keyboard. They are `<button>`s now, which matters because the same UI runs
on a laptop being used as the big screen.

**TV / live sync.**
- **WakeLock is re-requested on `visibilitychange`.** It is released whenever the document hides and
  is never handed back — the big screen went to sleep after any app switch.
- **`hostSeenAt`** — the mirror of `tvSeenAt`. The host pushes it with every data write plus a 45 s
  heartbeat; the TV shows `⚠ Handy offline` after 90 s of silence instead of presenting a frozen
  table as current. Staleness is measured against the TV's OWN clock (a TV stick with a wrong clock
  would otherwise call a healthy phone dead).
- TV heartbeat 12 s → 25 s; host data debounce 150 ms → 400 ms. Deliberately NOT skipping pushes when
  no TV seems to be listening: a phone cannot tell "no TV" from "TV briefly offline", and a skipped
  push leaves the big screen stale.

**⚠️ Firestore rules were rewritten and are NOT deployed. Manual steps, in this order:**
1. Firebase console → Authentication → Sign-in method → **enable Anonymous**.
2. Push to `main` (Pages redeploys itself) **and rebuild + install the APK**.
3. `firebase deploy --only firestore:rules`

The old rules let anyone who guessed a 4-digit code read, overwrite or **delete** a live session.
Now every client signs in anonymously (`ensureAuth()` in `lib/firebase.ts`, `firebase/auth` is
dynamically imported so it stays out of the main bundle), the session records `tvUid`/`hostUid`, and
only those two devices may write; deletes are the owning screen's only. `expiresAt` is now REQUIRED
(it was tolerated), and the game payload is bounded by list length. `ensureAuth()` degrades to `null`
if the provider is not enabled, so the app keeps working against the OLD rules until step 3 — but an
APK that is not updated will lose live sync once the rules land. Reading a session over the plain
REST API with the public web key no longer works (it is unauthenticated) — that was the old debugging
trick.

Verified in the dev preview (de): stack typed with a comma, 4-player money round → diff €0, timer kept
running across a tab switch (19:58 → 19:56), TV opened at the phone's level/time and its level change
came back to the sticky bar, toggles focusable with `aria-checked` flipping, in-app confirm cancels
without touching the ledger, rename closes on Enter. `tsc -b`, `npm run build`, `npm test` (6 files)
and `oxlint` all clean, no console errors.

### Recent work (2026-08-15, part 4 — buy-ins hand out real chips, resets, one-tap amounts)
- **`handoutStack()` in `lib/startingStack.ts`** — the chips for ANY amount. A full buy-in returns
  exactly `startingStackOf()` (fine-tuning included); anything else is computed for that amount, and
  a top-up **smaller** than a buy-in uses `smallBias: 0` (fewest chips — nobody wants 25 pieces for
  €5 mid-game). Used by BOTH the buy-in handout and the counting-round pre-fill, so they always agree.
- **Buying in credits the stack + shows what to push across** — `chips += amount` and a `.pr-handout`
  panel ("€5 in Chips rausgeben · 5× 10 · 2× 25 · 4× 100"), dismissed with one tap.
- **New players start with their buy-in in chips** (`freshChips()` in the reducer) — sane figures
  before anyone counts.
- **Counting round pre-fills from the player's OWN stack** — the €5 buy-in opens at €5, not €20.
  That was the actual complaint.
- **Resets (new actions `LEDGER_RESET_PLAYER` / `LEDGER_RESET_ALL` / `LEDGER_CLEAR_CHIPS`):** per
  player (⋯ menu + player sheet), whole table (↺ menu next to the count button, names kept), new
  night (remove everyone), plus "alle Stacks = Buy-in" and "alle Stacks leeren".
- **One-tap amounts** (`.quick-chip`): buy-in + 5/10/20/50 on every money entry, and they ADD up, so
  €35 is three taps. Also on the stack field in the player sheet.
- Verified in the preview: €5 top-up → correct breakdown + €5 stack; €25 → €25 breakdown; count round
  opened the €5 player at €5 and the €20 player at the full stack; table reset kept names. `tsc -b` +
  build clean. (Dev console showed stale `stackForMoney` HMR errors from renaming the export
  mid-session — transient, gone on a clean build.)

### Recent work (2026-08-15, part 3 — ONE player list + money you can correct)
User: "es gibt immer noch zwei Spieler-Tabs" and the money was too rigid to fix. Both addressed.
- **The second list is gone.** The host `RemoteControl` had its OWN full players-and-pool card, so
  while hosting, the Table tab showed the roster AND that card. Deleted (−177 lines); its unique bits
  moved into `PlayerRoster`: the **bounty knockout picker**, the 🎯 count per row, and the pool total.
  RemoteControl is now clock / level length / blinds / moments only. The Cash tab's read-only list was
  retitled `cash.perPlayer` ("Netto je Spieler") so it can't read as a second editor.
- **MONEY MODEL — cumulative, this is the important bit.** `buyIn` = every euro that went ON the table
  for that player, `cashOut` = every euro that came OFF.
  - Cash-out now **ADDS** to `cashOut` (it used to REPLACE it) → a second cash-out later adds up.
  - Buy (back) in **ADDS** to `buyIn` and clears `out`, leaving the earlier `cashOut` on the record →
    "sie hat sich ausgekauft und kauft später für einen anderen Betrag neu ein" just works.
  - Both go through one inline `AmountPrompt` → any amount, not just `session.buyIn`. The one-tap
    `+ €buy-in` button stays for the common case.
- **`components/PlayerSheet.tsx`** (⋯ → ✏️ Bearbeiten): raw editing of name, emoji, bought-in TOTAL,
  cashed-out TOTAL, current stack, in-play toggle, net readout, delete. A mistyped number is fixed by
  typing it right — no more "back in" hack that wiped the cash-out.
- **Footer basis:** shows the pool (tournament = all buy-ins, cash = on the table) plus, when a
  cash-out has already removed money, what is STILL on the table — that's what the counted total is
  compared against (was confusing: pool €60 vs a diff computed against €5).
- Verified in the preview: cash-out €55 → re-buy €30 → bought-in €50 with the €55 kept → second
  cash-out €12 → €67, net +€17 → sheet corrected to €60 + toggled back in → pool €90 / am Tisch €30 /
  gezählt €38 / +€8. `npx tsc -b` + `npm run build` clean, no console errors.

### Recent work (2026-08-15, part 2 — counting on the TV, stack trail, counting extras)
Same spec file, "Round 2" section. **One new synced field** — `AppState.counting` — done properly at
all three spots (`dataOf` in `liveData.ts`, `LIVE_APPLY_REMOTE` in `store.tsx`, the `TvMode` subscribe
payload). `migrate()` forces it back to `null` on load: it only means "someone is counting RIGHT NOW".
- **TV shows the round live** — `.tv-counting` pill: `🧮 Stacks zählen · 🐻 Marc · 1/3`. The phone sets
  progress per player and clears it on unmount.
- **Stack trail** — `LedgerPlayer.chipHistory` (one entry per counting round, capped 12, appended in the
  reducer so every write path records it) drawn by the new `components/Sparkline.tsx` in `currentColor`,
  in the roster row AND the TV roster. Rides the already-synced `ledger` → **no** new synced field.
- **Inventory check** — a colour tallied above what the box holds shows `⚠ 34/80` on that row
  (per-colour tallies the round keeps in memory + `denominations[].count`).
- **Counting reminder** — roster shows the age of the newest count, button turns primary past 25 min;
  the TV shows the same nudge during a BREAK (everyone is standing up anyway).
- **Undo** — 8 s snackbar (`.snackbar`) restores the exact previous `chips` + `chipHistory` via the new
  `LEDGER_RESTORE_CHIPS` action.
- **Starting-stack pre-fill** — a never-counted player starts from the dealt pattern
  (`computeStack().counts` is a **denomId → chips Record**, not an array — that bit me once), with a
  "Leeren" escape.
- **Own numpad** — tapping a count opens a 3×4 pad (digits / `C` / `⌫`); `−`/`+1`/`+20` stay.
- Offered but NOT built: counting in seat order, stacks in big blinds.
- Verified in the dev preview (de): pre-fill = exact dealt stack (2.000 chips = €20), numpad, `⚠ 999/80`,
  progress 1/3 → 2/3 + TV pill + clear on close, history appended, undo restored chips AND trail, 3
  sparklines phone + 3 TV, age line. `npx tsc -b` + `npm run build` clean, no console errors.

### Recent work (2026-08-15 — player roster + counting round, photo count DELETED)
Design spec: `docs/superpowers/specs/2026-08-15-player-roster-counting-round-design.md`.
Player data used to live in four UIs over one `ledger` (Table stepper, photo card, Cash editor, host
RemoteControl) — a rebuy could be entered in three of them. Now:
- **`components/PlayerRoster.tsx`** on the Table tab is THE player list and replaces BOTH the old
  "players at the table" stepper (which counted a number, not people) and the 📷 chip-count card.
  Row = emoji · name · `⋯` menu; body = buy-in + one-tap rebuy + stack (as money, tap to count).
  Menu = cash out (prefilled from the counted stack) · mark out (tournament) · back in · remove.
  Footer = money on the table vs counted + difference. Add/remove syncs `session.playerCount`.
- **`components/CountRound.tsx`** — the counting round. Steps through the still-in players; per
  denomination a `−` / number / `+1` / `+20` row (20 = a barrel), running total in chips AND money,
  previous value for reference. Denoms default to the ones the starting stack uses (`computeStack`),
  toggle shows the whole inventory. Last player gets **"assign the rest"** (money on the table minus
  everyone else). Closing summary (old → new + diff), then **ONE `LEDGER_SET_CHIPS_MANY` dispatch** →
  a single TV push. Counted per colour, but only the TOTAL is stored (`LedgerPlayer.chips`) — **no new
  state and no new synced field**. Also reachable per player: roster stack tap, and the 🧮 in
  RemoteControl (was 📷).
- **Deliberate scope:** the stack figure is an OVERVIEW, not an audit — the difference is a hint and
  never blocks, and it still does NOT feed the buy-in/settlement maths.
- **`components/EmojiPicker.tsx`** — the 74-emoji set extracted from RemoteControl so the roster offers
  it too (before this, emojis were unreachable without a live TV session).
- **Cash tab is now read-only reporting**: summary tiles, per-player net, who-pays-whom, league. Its
  player editor is gone. The "off by X" warning only fires once EVERY player is settled (mid-game the
  totals are supposed to differ). Dealer card names are read-only too.
- Verified in the dev preview (de) end-to-end: 3-player round (20×25 + 2×100 = 700 chips = €7),
  rest = €53 of €80, summary diff €0, persisted in one dispatch; cash-out prefill, bust clears the
  stack, single-player save, settlement Jana → Tom €33. `npx tsc -b` + `npm run build` clean, no
  console errors.

### Recent work (2026-08-11 — 74 player emojis)
`EMOJIS` in `screens/RemoteControl.tsx` went 16 → **74**, grouped attitude / animals / poker & luck /
drinks & snacks / swagger. `.emoji-grid` (styles.css) switched from flex-wrap to an **auto-fill grid**
(`minmax(38px,1fr)`) capped at `max-height:208px` with its own scroll + `overscroll-behavior:contain`,
so the long list can't push the player card open (7 cols @375px, 9 @1280px, no horizontal overflow).
`.emoji-opt` is now `width:100%; aspect-ratio:1` instead of a fixed 38px box. Verified in the dev
preview: picking writes `LedgerPlayer.emoji` + closes the sheet, and a ZWJ emoji (🏴‍☠️) survives the
localStorage round-trip. Commit `56dd8b5`, on `main`, Pages + APK green (4.39 MB, 17:42 UTC).
**Note:** the picker only exists in the host **RemoteControl**, so emojis are unreachable without a live
TV session — the Table players list and `ChipCountCard` only DISPLAY them. Pitched adding the picker to
the Table list; not built.

### Recent work (2026-08-11 — ICON v1.1: violet/amber/red bars)
Second icon pass, same "chip stack" mark, new palette. User handed over `gen-icons1.1.mjs`; ported into
`scripts/gen-icons.mjs` (that path matters — see the v1.0 entry below), regenerated all 19 icons.
Commit `94b2e8c`, pushed to `main`, Pages `31517400340` + APK `31517405485` both green, APK republished
(4.39 MB, 2026-08-11 17:26 UTC).
- **Palette:** three DISTINCT hues instead of one graded lime — violet `#A679E6→#371C6B` (bottom),
  amber `#F5A04D→#914C12` (middle), red `#E07C72→#7A2718` (top). Each bar now a **4-stop** gradient
  (0/42/82/100%) + its own drop shadow.
- **Highlight changed shape:** was a full-width strip at 40% bar height; now a small rounded pill
  (25% bar width, 20% height, inset 9%/12%) with a CSS `blur()` filter. librsvg/sharp **does** render
  that shorthand filter — verified in the output PNGs, no fallback needed.
- **Tile colour unchanged (`#1A1A1E`)** → `@color/ic_launcher_background` needed NO edit this time.
- Android launcher-icon caching gotcha still applies (old icon lingers until reboot/launcher restart).

### Recent work (2026-08-11 — NEW APP ICON "chip stack" v1.0)
Icon redesigned by the user in a separate Claude Code session; the design file arrived as a standalone
`gen-icons.mjs` (in `~/Downloads`, plus a stray copy at the repo root — both since removed/merged).
**Ported verbatim into the canonical `scripts/gen-icons.mjs`** — that location matters: line 6 does
`join(dirname(import.meta.url), '..')`, which only resolves to the project root when the script lives in
`scripts/`. Run from the repo root it would write `public/` + `android/` one level too high.
- **Design:** three stacked chip bars, each with its own top→bottom 3-stop gradient (olive `#5F7A29` →
  bright lime `#C7EA5A`), a white highlight strip (40% bar height) and a per-bar drop shadow, on a
  charcoal `#1A1A1E` tile. Brightest bar on top. Replaces the amber "token ring" mark.
- **`@color/ic_launcher_background` `#0E1116` → `#1A1A1E`** so the adaptive icon's background matches the
  new tile behind the transparent foreground (easy to miss — the adaptive icon composites fg over that colour).
- Regenerate any time with `node scripts/gen-icons.mjs` → 19 files (4 PWA + 5 densities ×
  legacy/round/adaptive-foreground). Commit `5a4f2ae`, pushed, Pages + APK rebuilt.
- **Gotcha:** Android **caches launcher icons** — after installing, the old icon can linger until a reboot
  or launcher restart. Not a build problem.
- Leftover template file `res/drawable/ic_launcher_background.xml` (teal `#26A69A` grid) is UNUSED — the
  adaptive icon references `@color/…`, not the drawable. Harmless; could be deleted.
- **⚠️ MISMATCH, not yet fixed:** the in-app header logo `LogoMark()` in `App.tsx` (~line 27) is still the
  OLD "token ring" (rounded rect + ring + centre dot, drawn in `var(--acc)` so it follows the skin accent).
  The launcher/PWA icon is now the lime chip stack — they no longer match. Deliberately left alone (the
  header mark is accent-themed per skin, so porting the fixed lime palette needs a design call). Pitch it
  to the user if the inconsistency bothers them.

### Recent work (2026-08-11 — manual live stack editing, in euros)
Small feature. `npx tsc -b` clean, `npm run build` clean, verified in the dev preview (no console
errors), **committed `8d67811`, pushed to `main`, Pages + APK rebuilt** (see Open item #1). New:
- **Edit each player's live stack as a euro value.** `LedgerPlayer.chips` (chip-units, drives the TV
  👑 crown + the balance readout) is now user-editable as **money**. The Table-tab **Count-chips card**
  (`components/ChipCountCard.tsx`) balance line became an editable `€` input (was read-only, photo-only);
  the host **RemoteControl** (`screens/RemoteControl.tsx`) per-player box switched from raw chip-units to
  euros. Both convert with the existing `moneyToUnits(euros, unitValue)` on write / `chips * unitValue` on
  display, so the photo count, crown and roster stay **one source of truth** (`chips`). 📷 photo path
  unchanged; typing just overwrites.
- **One-tap "Set all to buy-in €X"** button in the Count-chips card header — fills every player's stack
  from `session.buyIn` at once via a new **atomic `LEDGER_SET_ALL_CHIPS`** reducer action (`store.tsx`),
  so it's a single dispatch + single TV push, not N. Shown only when players exist and buy-in > 0.
- **Live/sync is free** — `chips` already rides `LiveData`/`dataOf` + `liveSignature`, so host edits
  auto-push to the TV. **No new synced field, no new type.** i18n EN/DE added (`chipcount.setAll`,
  reworded `table.chipsPlaceholder` + `chipcount.cardHint`). Note: euro→chips rounds to the nearest
  chip-unit — sub-cent drift only if `unitValue` isn't a clean divisor (fine for a home game).

### Recent work (2026-07-31 — TV sync/font fixes + big feature pack)
Two-part session. All built, `npx tsc -b` clean, `npm run build` clean, verified live in the
dev preview (localhost:5173, browser pane), zero console errors. **NOT committed/pushed yet** —
`git push` deploys to Pages; APK needs a manual rebuild (it's now behind).

**Part 1 — TV streaming review/fixes:**
- **TV per-skin font FIXED.** `--font-display` was only on `:root[data-skin]`, so a TV skin ≠
  phone skin showed the wrong font. Now set per `.tv[data-tv-skin]` (casino→Playfair,
  playful→Fredoka, sci-fi→Orbitron, minimal→system) + `.tv` default; `.tv-blinds`/`.tv-level`/
  flash/pair/start-stack route to `var(--font-display)`. Verified all 4 skins resolve.
- **"Show on TV" link un-scrambled + QR removed.** Root cause: TWO `.code-box` CSS rules
  collided — the 4-digit connect boxes (68px/26px/centered) clobbered the URL box. Renamed the
  connect cells to `.code-cell`/`.code-cells` (ConnectToTv + CSS); URL now uses a new `.url-box`.
  Removed the redundant WEB_URL QR from the TvBroadcast "Show on TV" card (the TV already runs
  the page; the pairing QR on the TV screen stays). Bonus: this also un-scrambled the CS1 share
  code in ShareSheet.
- **Sync made bulletproof.** `useLiveHostSync` used a hand-maintained deps list; any field left
  off silently never reached the TV ("some changes don't get pushed"). Rewrote to react to
  `liveSignature(state)` — a signature of the WHOLE synced slice — debounced 150ms. Added
  `chipArt` to sync too. **A new synced field now can't be forgotten.**
- **liveData.ts split out (bundle fix).** `LiveData`/`dataOf`/`liveSignature` moved to a NEW
  firebase-free `src/lib/liveData.ts` so `useLiveHostSync` imports them statically WITHOUT
  pulling Firebase into the main bundle (a regression I caught: 361→831 KB, back to 361). Never
  static-import `liveSession.ts` from always-loaded code. `liveSession.ts` keeps only the
  firestore read/write helpers (dynamic-imported).
- **Live TV status + push button.** New TV heartbeat (`tvHeartbeat` writes `tvSeenAt` every 12s
  when `isTv`). Phone's ConnectToTv card now shows ● TV connected / ⚠ TV offline / Looking…
  (compares successive `tvSeenAt` against the LOCAL clock — skew-free) + a prominent
  "Push everything to TV now" button (moved here; removed the dup from RemoteControl).

**Part 2 — feature pack (user picked all of these):**
- **🎯 Knockout bounty** (tournament): `Settings.bountyMode`/`bountyAmount`. Fixed amount ON TOP
  of buy-in. Marking a player out (RemoteControl, bounty on) opens a knockout-attribution picker
  → increments the knocker's `LedgerPlayer.knockouts`. TV shows 🎯 count per player + a
  bounty-pool stat tile.
- **🏆 Season league** (`components/SeasonLeague.tsx`, Cash tab): "Save tonight" snapshots the
  ledger into `AppState.league: LeagueGame[]` (persistent, LOCAL only — not synced). Ranks
  players across nights by **net (cashOut−buyIn) + ROI**; 👑 for #1; night history w/ delete.
  User chose net/ROI over a points table.
- **🎨 Color-up alarm** (TV): uses `planning.colorUpEvents()` at the current level → banner
  "Color up the 10s → 50".
- **💀 Elimination flash** (TV): full-screen cue on a fresh `out` transition (place = entrants −
  outs + 1). Guarded so it doesn't fire for players already out when the TV opens.
- **👑 Chip-leader crown**: optional `LedgerPlayer.chips` entered on the remote → 👑 on the TV
  roster for the still-in player with the most. (Photo→auto-count was pitched — LLM-vision +
  tiny proxy, ~medium effort — NOT built; manual field for now.)
- **🎉 Winner confetti** (TV): 1 player left in a tournament (≥2 entrants) → 60-piece CSS
  confetti + "🏆 {name} · Champion", fires once per winner.
- **📸 Hand of the night**: `AppState.moments: Moment[]` (SYNCED; cleared on LEDGER_CLEAR).
  Logged on the remote, merged (📸-prefixed) into the TV quip ticker.
- **🎡 Penalty spinner + 📜 house rules**: `Settings.tvPenalties`/`tvHouseRules` (synced,
  editable in TvBroadcast). Penalty appended to the "who drinks?" result; a house rule shows on
  the TV during each break.
- **🙂 Player emojis**: `LedgerPlayer.emoji` — 16-emoji picker on the remote, shown on the TV
  roster + in confetti/elimination.
- **Custom accent (hex)**: `Settings.customAccent` — a colour picker in Settings → Accent.
  Applied as inline `--acc/--acc-bright/--acc-deep` on `<html>` (App.tsx) AND `.tv` (TvMode) via
  new `src/lib/color.ts` `customAccentVars()`/`darken()`. Overrides the 8 presets everywhere;
  picking a preset clears it. Synced.
- **Seasonal TV backgrounds**: 🎄 Xmas / 🎃 Halloween / 🌴 Summer added to TvBroadcast PRESETS.
- **Idle animation**: slow-spinning chip on the TV pairing card.

New synced-field rule (still): add to `dataOf` (liveData.ts) + `LIVE_APPLY_REMOTE` (store) +
TvMode subscribe payload — three spots. Memory: `tv-sync-and-theming.md`, `feature-pack-2026-07.md`.

### Recent work (2026-07-28 — slider, cast-to-TV, player net, bg presets)
- **Stack slider is now SMOOTH (engine change).** Old behaviour jumped from "all small chips"
  (bias≥0.999 max-fill) straight to a scaled pyramid one notch down — a big chip leapt in and chip
  count cratered. Replaced with a **colour-up descent** in `computeStack` (`lib/distribution.ts`):
  build the max-chip stack (smallest-first fill), then as the slider drops apply the GENTLEST
  value-preserving move each step via `gentlestColorUp()` — remove `x` of a small chip, add `z` of a
  bigger one where `x·vi = z·vj` (minimal via `gcd`), picking the smallest chip-count reduction first.
  So little chips are traded a few at a time and larger denoms enter only later. Slider maps to a
  target chip count `lerp(minCount, maxCount, bias)`; descend until reached. Value preserved → stays
  exact. Verified on the SLOWPLAY set: exact + strictly monotonic across bias 0→1, gentle 4–6-chip
  steps at the top (probe was temporary, deleted). Existing `distribution.test.ts` still passes.
- **Cast the starting stack to the TV.** New `Settings.tvShowStartStack` (in `LiveData`/`dataOf`,
  `LIVE_APPLY_REMOTE`, immediate push). "Show on TV" button on the Starting-stack card
  (`components/StartingStack.tsx`); `TvMode` renders a `.tv-startstack` overlay (chips + counts +
  total, tap-to-dismiss) computed with `computeStack` for the buy-in.
- **Departed-player profit/loss on the TV roster.** For a player who left (busted or cashed out),
  the roster row shows net = `cashOut − buyIn` in green/red (`.tv-net`) instead of the buy-in.
- **TV background presets.** 6 generated themed SVG backgrounds (Felt/Neon/Sunset/Slate/Emerald/Amber)
  in `components/TvBroadcast.tsx` — data-URL swatches that set `tvBackground` + centred focus + a
  per-preset `tone` (drives the TV scrim). Custom photo upload unchanged. No copyright, tiny, sync to TV.

### Recent work (2026-07-26 — TV/remote REHAUL + CASH GAMES)
Big multi-part rehaul. Design spec: `docs/superpowers/specs/2026-07-26-tv-remote-rehaul-design.md`.
- **Cash-game mode.** New `Settings.gameMode: 'tournament' | 'cash'` (+ `cashUseTimer`), in `LiveData`
  (`dataOf`), applied via `LIVE_APPLY_REMOTE`, pushed immediately in `useLiveHostSync`. Cash: chips =
  money, blinds fixed (timer optional), **cash-out anytime removes that money from the table** — pool =
  Σ buyIn − Σ cashOut (in `TvMode` + `RemoteControl`); TV headline flips to `tv.onTable`, payouts +
  bust-order forced hidden (`!isCash && …`), timer/countdown hidden (`showTimer`), static blinds hero
  (`.tv-clock-static`). Tournament path unchanged. `PlanScreen` hides the ladder/colour-up in cash.
- **Table tab = session hub (the "rethink").** Order: mode toggle → ConnectToTv → **StartingStack card**
  (new `components/StartingStack.tsx` — computed chip breakdown for the buy-in, "the stack everyone
  gets") → players → clock (hidden in cash-no-timer) → RemoteControl (host) → **TvBroadcast** → dealer.
- **TV broadcast config moved OUT of Settings** into `components/TvBroadcast.tsx` (collapsible on the
  Table tab): TV style + accent, quips, background photo, Show-on-TV URL/QR. Settings now just points
  to the Table tab. `RemoteControl` trimmed to live game control (clock/blinds/players + **cash-out**);
  its old TV-design/toggles/quips blocks were removed (now in TvBroadcast).
- **Language toggle on the TV** — `EN`/`DE` button in `TvMode` control row (standalone TV can switch;
  host still pushes language). Verified DE→EN flips labels + number grouping live.
- **App is now SILENT** — removed all `beep`/`chime`/`buzzer` in `TvMode` (blinds/shot-clock/spinner);
  cues are visual flash + `navigator.vibrate` only. Reason: TV audio hijacks the user's Sonos.
- **Per-skin display fonts** — `--font-display`: casino → Playfair Display, playful → Fredoka, sci-fi →
  Orbitron (unchanged), minimal → system. `@fontsource/{playfair-display,fredoka}` latin subsets in
  `main.tsx`. Deps added.
- **New minimalist icon ("token ring")** — dark `#0E1116` tile + amber ring + centre dot. Rewrote
  `scripts/gen-icons.mjs`; matching `LogoMark` in `App.tsx`; `ic_launcher_background` → `#0E1116`.
- **App Links (QR opens the app) — DONE server-side.** Created **`ndre-droid/ndre-droid.github.io`**
  (root Pages, `.nojekyll` so `.well-known` serves) with `assetlinks.json` = `com.chipstack.app` +
  signing SHA-256 `E5:A4:F3:…:2A`. Fingerprint pulled from the PUBLISHED APK's public cert via
  `openssl` (keystore never read). Manifest already had the `autoVerify` filter for host
  `ndre-droid.github.io` pathPrefix `/chipstack`. Live (HTTP 200) + validated by Google's Digital
  Asset Links API. New APK (30207467092) re-checked: same cert → assetlinks matches. **PENDING: on-device
  test** — reinstall the APK over the top (re-triggers link verification), scan the TV QR → app opens.
  Note: some QR-scanner apps use an in-app browser and bypass App Links; manual 4-digit code + the
  "Open in app" banner remain fallbacks.

### Recent work (2026-07-26 — earlier)
- **Number format follows the app LANGUAGE, not device locale.** `lib/money.ts` `localeFor(lang)`
  → en=`en-US` (comma thousands), de=`de-DE` (dot thousands `3.000`, comma decimals `€326,30`).
  Components format via **`useFmt()`** in `i18n.ts` → `{ money, num }`. Every `fmtMoney(x,cur)` /
  `.toLocaleString()` in the 6 screens now goes through it (screens alias `const { money: fmtMoney }`
  for a drop-in swap; sub-components `StackTable`/`StageCard` call `useFmt()` themselves). Root cause
  of the TV "3,000" bug: the LG webOS browser defaults to en-US, so formatting had to become explicit
  + language-driven. Verified in-browser (de) → `3.000 pts`, `500.000 pts`, `€5.000`.
- **Language now syncs host→TV.** Added `language` to `LiveData` (`liveSession.ts` `dataOf`), pushed
  IMMEDIATELY (added to `useLiveHostSync` discrete-push deps), applied via `LIVE_APPLY_REMOTE`
  (`store.tsx`) + into the `TvMode` subscribe payload. Before this the TV kept its own device language.
- **Buy-in clarity.** TV players panel header now shows a right-aligned `Buy-in` column label
  (`tv.buyIn`, `.tv-players-h` is flex now, `.tv-players-h-sub`). Phone `RemoteControl` players card
  gains a note *"amount = total bought in, not chip stack"* (`table.buyInNote`).
- **Reliable sync + manual push.** `RemoteControl` gains a **"Send to TV now"** button (`resync()` →
  `hostPushData(code, state)` immediately) with Sending…/Sent ✓/retry states (`table.sendToTv` etc.,
  `.resync-row`). Fixes the "changes didn't reach the TV until I reloaded the phone" report — a reload
  isn't possible in the APK, so this is the recovery path when an auto-push was dropped (e.g. TV
  briefly disconnected). Auto-sync itself unchanged (still debounced in `useLiveHostSync`).
- **APK deep-link (QR → opens the app).** QR still encodes the https `?tv=NNNN` (any camera scans it).
  Native handoff = **custom scheme `chipstack://tv/NNNN`** via **`@capacitor/app`** (added dep) in
  `src/lib/deepLink.ts` (`useNativeDeepLink` reads `getLaunchUrl` + `appUrlOpen`, `parseTvCode`).
  Manifest (`android/.../AndroidManifest.xml`) got two intent-filters: `chipstack` scheme +
  `autoVerify` https App Link (host `ndre-droid.github.io`, pathPrefix `/chipstack`). Web fallback:
  `App.tsx` shows an **"Open in app"** banner (`app.openInApp`, `.openapp-banner`) on Android web with
  a pending `?tv=` code, linking to `appSchemeUrl(code)`. **⚠️ NATIVE SIDE UNVERIFIED** — no local
  Android build; needs on-device test. **App Links `autoVerify` will NOT verify** — github.io project
  pages can't host `.well-known/assetlinks.json` at the DOMAIN root, only the subpath, so the reliable
  path is the custom-scheme banner (https link may show a chooser). Memory: `deeplink-and-i18n-format.md`.
- **New app icon: a stack of ceramic chips** (amber deco top → red → cyan → charcoal base). Rewrote
  `scripts/gen-icons.mjs` — now emits BOTH the PWA icons (`public/`) AND the Android adaptive launcher
  icons (per-density `ic_launcher.png`/`_round.png`/`_foreground.png` in `android/.../res/mipmap-*`).
  Adaptive background colour set to `#0A0A0E` (`values/ic_launcher_background.xml`). Regenerate with
  `node scripts/gen-icons.mjs`. Old icon was 3 overlapping chips + "C" monogram.

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
  **[SUPERSEDED by the Pairing REBUILT above — `hostEnsureExists`/`hostCreate` were removed; the TV
  now owns/creates the doc.]**
- Phone (host) no longer shows a Join pill in its own big screen — shows a "Hosting" tag; only
  display devices get Connect. Join errors now distinguish "code absent" vs "can't reach sync".
  **[SUPERSEDED — no on-TV keypad now; the TV shows a code, the phone types it via `ConnectToTv`.]**
- Players leaving/joining mid-game: **Bust** keeps a leaver for settlement (struck through on TV,
  players-left drops) via `LedgerPlayer.out`; **Add player** brings a joiner in at the buy-in.
  Design decision: settlement tracks **buy-ins only**, never per-player live chip stacks.
  **[UPDATED 2026-08-11 — an OPTIONAL live per-player stack now exists (`LedgerPlayer.chips`), edited as a
  euro value (see the 2026-08-11 entry). It drives the TV crown + the on-screen balance; it does NOT feed
  the buy-in/settlement math, which is still buy-ins only.]**

---

## ⚠️ Open items / next steps

### Recent work 2026-08-28 — the TV perfection pass (`6eb0b32`)

Five things, all on the big screen. Shipped: `main`, Pages and the APK are all on
`6eb0b32`.

1. **Sized for a 4K panel.** Every big-screen size is a `clamp()` whose ceiling was
   tuned for 1080p, and the roster's was the one that hurt: a name could never exceed
   1.8% of the short edge (~19px), which is ~1.2cm of letter on a 55" screen. Ceilings
   raised across the board (`ROW_MAX_FS` / `ROW_MAX_VMIN` in `TvMode`, plus the
   `.tv-*` clamps in `styles.css`) — but the ceiling was only half of it, because the
   fitter never makes a row bigger than the space it has. Three stacked stat tiles
   were taking 263 of the left column's 511px, so **the tiles go two-up whenever the
   roster is on screen at all** (`statsTwoUp`, the same designed state a short canvas
   already used) and the roster's guaranteed share went 40% → 46%. Measured: names
   19 → 33px on a 1080-class TV viewport, 69px on a real 4K one. The legend chip was
   a flat 34px and now follows the display (`legendChipSize`); the pairing QR renders
   at 10px a module so a 4K blow-up is still scannable.
2. **The cast that would not stay away.** `tvShowStartStack` is the PHONE's request
   and rides in `LiveData`, so a TV that dismissed the starting-stack overlay had it
   pushed straight back on the host's next write — it looked like it reappeared on its
   own, which is exactly what the user reported. New device-local
   `Settings.tvStartStackHidden`: the screen keeps its own answer, the phone cannot
   overwrite it, and there is a `🃏 Stack off / on` button in `.tv-controls`. Only a
   FRESH request from the phone (off, then on again — tracked by the `castWanted` ref
   in the session listener) clears it.
3. **The render loop — the real cause of the "laggy" TV.** The roster fitter is a
   measure-resize-remeasure loop driven by a `ResizeObserver`, and a row's height is
   NOT linear in its font size (the trail is sized off the fitted font, the emoji has
   its own clamp, the money cell can gain a line). It settled into A → B → A and threw
   `Maximum update depth exceeded` forever. **This predates this branch** — reproduced
   against `cf071ad` by stashing; the raised ceilings only made it easier to reach.
   Fixed with a `fitBudget` ref: six changes per real input change, and only OUTSIDE
   events (`document.fonts.ready`, the 400ms settle) may top it up — never a
   `ResizeObserver` callback, which may be the fitter's own last move coming back.
   On top of that: `data-tv-gpu="lite"` (from `tvGpuBudget()` in `lib/tvScale.ts` — a
   TV browser, or few cores driving a 4K canvas) drops the `backdrop-filter` behind
   every panel and the `drop-shadow` around moving chip piles, both per-frame GPU
   work; `.tv-cell` gets `contain: layout paint`; `ChipStackViz` and the new
   `TvLegend` are memoised so ~90 chip elements and 8 SVG chips stop being rebuilt
   once a second for the countdown. See [[perf-invariants]] 5 and 6.
4. **Quick buy-in on the wall** (`💶 Buy-in` in `.tv-controls`). Somebody rebuys at
   level 7 and wants €20 in chips: type it on the screen everyone is already looking
   at. Euro ↔ chip count, a keypad (a TV has no keyboard) and three preset amounts
   (½ / 1× / 2× the buy-in), straight through the same `handoutStack` the phone's
   roster uses. Says so when the inventory is short. Local to the screen, never
   synced — it is a calculator, not a change to the night.
5. **Backgrounds 21 → 37**, sixteen of them casino: rail, card backs, a royal fan,
   chip scatter, midnight and burgundy baize, marble, chesterfield leather, mahogany,
   noir, herringbone, the strip, a marquee, roulette, dice, high roller. All generated
   SVG as before. Thirty-seven thumbnails in one grid is a wall, so `TvBackground`
   grew a `group` and the picker folds them into seven collapsible folders (`table`,
   `deco`, `vegas`, `scifi`, `playful`, `minimal`, `season`), one open at a time, with
   the folder holding the current pick marked and opened first.

Verified: `npx tsc -b`, `npm run lint`, all 22 test files, `npm run build`, plus DOM
measurements in the browser pane at 1280×720, 1920×1080 and 3840×2160 (screenshots
were unavailable in that session — every number above is a measurement, not a look).
**Not verified on real TV hardware.**

### STATE RIGHT NOW (2026-08-26)
Everything in the repo is shipped and green. Local branch **`feat/chip-3d-render` == `main` ==
`c275092`**; Pages (`32956871468`) and the APK (`32956874967`) are both built from it. Nothing is
half-finished in the working tree; the only untracked things are the user's own `koffer.png` and
`Chips source pics and links/`, deliberately not committed.

**Two things are shipped but UNPROVEN on real hardware — a person with the APK has to check:**
1. **The TV auto-resync** (2026-08-26, item 7). Open the web app on the TV with the phone hosting:
   it should pick up the current table within a second or two, with no manual "Push to TV". Cannot
   be tested locally — it needs a real Firebase session and two devices.
2. **The level-end notification** (still, from 2026-08-23). Switch on "Melden, wenn die Stufe
   endet" on the Table tab, start the clock, lock the phone, wait for the level to run out. The
   plugin IS compiled in (`npx cap sync` reports it, the Gradle tasks run); what is unknown is
   whether Android grants `POST_NOTIFICATIONS` and whether the alert actually fires.

Also worth a look on the real TV: **the grey bar** (2026-08-26, item 8) was fixed blind — it could
not be reproduced locally, so BOTH plausible causes were addressed (the page ground, and a
Fullscreen button for the case where the strip is browser chrome). If a bar is still there, the
Fullscreen button is the thing to try first, and then it is worth measuring
`document.querySelector('.tv').getBoundingClientRect()` against `innerHeight` on the actual TV.

**The Firestore rules are written but NOT deployed — and that is now a DECISION, not a to-do.** On
2026-08-23 the user was walked through what anonymous auth buys (a per-device id so the rules can say
"only the screen that opened this session and the phone that claimed it may write") and chose to leave
it: home game, the four digits are lock enough. So `firestore.rules` stays in the repo, unshipped, and
the app keeps running against the OLD wide-open rules. `ensureAuth()` failing is harmless there — it
resolves to `null` and the write goes out anyway. **Do not deploy the rules on your own initiative.**

If the user ever changes their mind, the order is still binding — out of order takes live sync down
for everyone, including them:
1. Firebase console → Authentication → Sign-in method → **enable Anonymous**. Today Authentication is
   not set up in the project AT ALL (`accounts:signUp` → `400 CONFIGURATION_NOT_FOUND`), so every
   client is currently sign-in-less.
2. Re-check that `main`, Pages and the installed APK all carry the signing-in client. An old APK on the
   phone loses live sync the moment step 3 lands.
3. `firebase deploy --only firestore:rules`

After step 3, reading a session over the plain REST API with the public web key stops working; that
used to be the debugging trick, so drive the app instead. The TTL policy is a separate one-off:
`gcloud firestore fields ttls update expiresAt --collection-group=sessions --enable-ttl`.

**Nothing else is pending from the audit** — every item raised on 2026-08-22 was fixed and verified in
the same session. Deliberately NOT done, with the reason: skipping data pushes when no TV seems to be
listening. A phone cannot tell "no TV" from "TV briefly offline", and a skipped push leaves the big
screen stale; the write cost is not worth that.

### Photo → chip count — DELETED (2026-08-15)
The whole photo/AI chip-count feature is **gone**. It was already a soft assist (see the history
below) and in the user's real game it did not work well enough to be worth keeping. Removed:
`components/ChipCount{Card,Sheet,Review}.tsx`, `ChipSeamEditor.tsx`, `lib/chipVision/*`,
`lib/useCameraCapture.ts`, `lib/useDeviceTilt.ts`, `Settings.aiVisionKey` + its Settings block,
134 `chipcount.*` i18n keys, the capture CSS, and the `CAMERA` / camera `uses-feature` entries in
`AndroidManifest.xml` (the TV background picker is a plain `<input type=file>` and needs none of them).
Replaced by the **counting round** — see the 2026-08-15 entry above. **Do NOT rebuild it**: the fusion /
geometry / DSP / second-angle machinery was tried and regressed (2026-08-02), and the single-pass Gemini
assist that followed still was not good enough. Historical detail lives in git and in
`docs/superpowers/{specs,plans}/2026-07-31-chip-photo-count*`.

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
1. **Ship flow (current, unchanged).** Work on `feat/chip-photo-count`, then
   `git push origin HEAD:main` (fast-forward → Pages auto-deploys), then
   `gh workflow run "Build Android APK" -R ndre-droid/chipstack --ref main` — the APK builds from
   REMOTE main, so push FIRST. Last run of it: 2026-08-22, `7abf182`, both workflows green.
   **Still pending on-device:** App Links verification. CI still warns on deprecated **Node 20** /
   `setup-java@v4` actions — bump `actions/*` when convenient.
   Historical note (2026-08-11): `feat/chip-photo-count`
   was fast-forwarded onto **`main` @ `5a4f2ae`** (`git push origin feat/chip-photo-count:main`; `main` was
   `99a2836` at session start). Landed in two pushes: `8d67811` (the 4 chip-count assist commits + euro
   stack-editing) then `5a4f2ae` (new app icon). Both CI rounds ran green from `main`: **Pages**
   `31476590629` + `31482985653`, **APK** `31476599454` + `31482985815` → `ChipStack-debug.apk` republished
   to `android-latest` (4.37 MB, 2026-08-11 10:38 UTC). Stable signing key unchanged (cert == assetlinks
   `E5:A4:…:2A`), installs OVER the existing APK, data preserved. **The local branch `feat/chip-photo-count`
   still exists and == `main`** — safe to keep working on it or delete. **Ship flow (unchanged):** commit on
   the branch → `git push origin feat/chip-photo-count:main` (fast-forward → Pages auto-deploys) →
   `gh workflow run "Build Android APK" -R ndre-droid/chipstack --ref main` (builds from REMOTE main, so
   push FIRST). **Still pending on-device:** App Links verification. CI still warns on deprecated **Node 20**
   / `setup-java@v4` actions — bump `actions/*` when convenient.
2. **i18n is partial.** Nav/header/Settings/TV/Plan/Chips/Table/Cash MAIN labels are translated
   (`src/lib/i18n.ts`, `useT()`); **number formatting now fully language-driven** via `useFmt()`
   (2026-07-26). NOT translated: engine-generated sentences (distribution.ts / planning.ts
   warnings/notes, colour-up retirement math) and a few minor inline strings (e.g. PlanScreen "pts",
   StackTable headers) — those need the language threaded into the engine / those call sites. Extend
   the dict + wrap remaining strings when asked.
3. **Firestore.** The backend is healthy and a live-sync failure is almost always **client state,
   not rules** — don't re-diagnose the backend first. What is DEPLOYED today is still the old,
   effectively open rule set; what is IN THE REPO requires anonymous auth + session ownership and is
   waiting on the three steps at the top of this section. Memory note:
   `memory/live-sync-firestore.md` (kept current).
4. **Live Session scope:** host controls clock, level/break length, auto-break, blinds, players/pool
   (incl. Bust), TV design + all the show/hide toggles and custom quips from the phone — all synced
   and immediate for the discrete ones. Still TV-local (not on the phone remote): the shot-clock and
   who-drinks spinner. Payout structure is auto (percent table by entrant count in `TvMode.tsx`), not
   yet user-editable. **Liveness is now covered in BOTH directions** (2026-08-22): the TV's
   `tvSeenAt` heartbeat drives the phone's pill, and the host's new `hostSeenAt` makes the big screen
   show `⚠ Handy offline` after 90s of silence instead of presenting a frozen table as current.
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
