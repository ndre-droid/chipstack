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
  (⚠️ **BEHIND as of 2026-08-15** — still the 2026-08-11 build, so it has the OLD photo chip-count and no
  player roster / counting round. Rebuild it from `main` to catch up.
  Build detail below: rebuilt 2026-08-11 from `main` @ `5a4f2ae`, 4.37 MB; AI chip count was a deliberate **ASSIST**:
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
    distribution.ts  THE engine: computeStack() [smooth slider = max-chip fill then a colour-up
                     DESCENT via gentlestColorUp()/gcd — smallest value-preserving swap each step],
                     selectPool() [only the SMALLEST chip must post the blind — larger chips need NOT
                     be blind-multiples], rebalance(), closeResidual() [two-denom swap to hit buy-in
                     exactly when pool gcd < base], pickSpread().
    planning.ts      suggestBlindLadder(), colorUpEvents()
    settle.ts        settleUp() minimal-transfer
    share.ts         encode/decodeSetup (CS1: code), renderStackImage
    money.ts, i18n.ts (t() hook + en/de dict), clockLogic.ts (pure ClockState transitions),
    firebaseConfig.ts (the pasted chipstack-live web config), firebase.ts (lazy Firestore),
    liveData.ts (NEW — LiveData type + dataOf + liveSignature; FIREBASE-FREE on purpose so the
      host-sync hook can import it statically without bloating the main bundle),
    liveSession.ts (Firestore session doc read/write/subscribe + tvHeartbeat — DYNAMICALLY
      imported only when a live session is used, so Firebase code-splits out of the main bundle;
      re-exports LiveData from liveData.ts),
    color.ts (NEW — darken() + customAccentVars() for the free custom-accent hex picker),
    useLiveHostSync.ts (root hook: while hosting, push the WHOLE synced slice to cloud on any
      change, debounced 150ms — keyed off liveSignature(state), NOT a curated deps list)
    deepLink.ts (parseTvCode + useNativeDeepLink via @capacitor/app: chipstack://tv/NNNN → host)
    money.ts (fmtMoney/fmtNum/localeFor — language-driven grouping; i18n.ts useFmt() binds it)
    *.test.ts        engine tests (node --experimental-strip-types, imports need .ts extensions)
  components/
    Chip.tsx         SVG chip/plaque — SLOWPLAY ceramic: SMOOTH edge (no clay spots), full-face
                     gold octagonal art-deco lattice, octagon centre cartouche. Reads settings.chipArt.
    ChipStackViz.tsx 3D chip-cylinder stacks (curved body, per-chip divisions, perspective-
                     projected deco face). Auto-fits width (ResizeObserver).
    ShareSheet.tsx, Icons.tsx
    StartingStack.tsx  the "stack everyone gets" card on the Table tab (computeStack + ChipStackViz)
    SeasonLeague.tsx   NEW — season league on the Cash tab (save night → net/ROI standings + history)
    PlayerRoster.tsx   THE player list (Table tab): join / rename / emoji / rebuy / stack / cash-out /
                       bust / remove. Replaced the player-count stepper + the photo chip-count card.
    CountRound.tsx     counting-round sheet — tally each player's stack per denomination (−/+1/+20),
                       "assign the rest" for the last player, summary, one LEDGER_SET_CHIPS_MANY dispatch
    EmojiPicker.tsx    the 74-emoji set + grid, shared by PlayerRoster and RemoteControl
    TvBroadcast.tsx    TV design/accent/quips/background/penalties+house-rules editors/show-on-TV
                       (link fixed, QR removed) — collapsible on the Table tab, syncs while hosting
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
1. **✅ MERGED + DEPLOYED (2026-08-11) — `main`, Pages and the APK are all IN SYNC.** `feat/chip-photo-count`
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
3. **Firestore is verified healthy** (2026-07-24, REST probe with the committed public key: GET
   missing → 404, PATCH → 200, DELETE → 200). Rules allow read+write on `sessions/{code}`. So any
   future live-sync failure is **client state, not rules** — don't re-diagnose the backend first.
   Rule is wide open (`if true`) — brute-forceable but fine for a home game; could harden + add TTL
   cleanup if wanted. Memory note: `memory/live-sync-firestore.md`.
4. **Live Session scope:** host controls clock, level/break length, auto-break, blinds, players/pool
   (incl. Bust), TV design + all the show/hide toggles and custom quips from the phone — all synced
   and immediate for the discrete ones. Still TV-local (not on the phone remote): the shot-clock and
   who-drinks spinner. Payout structure is auto (percent table by entrant count in `TvMode.tsx`), not
   yet user-editable. **Pitched, not built:** a "● Live / ⚠ disconnected" status pill on the phone
   remote so a silent TV drop is obvious immediately (user hit this — TV disconnected without a cue).
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
