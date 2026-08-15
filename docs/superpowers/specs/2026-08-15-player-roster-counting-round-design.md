# Player roster + counting round (2026-08-15)

Replaces the photo chip-count with a manual, per-colour counting round, and merges the
scattered player UIs into one roster on the Table tab.

## Problem

Player data lived in four places over one `ledger`: a "players at the table" stepper (a
number, not people), the "📷 count chips" card, the Cash tab's editor, and the host-only
RemoteControl. A rebuy could be entered in three of them. The photo count itself was
unreliable in practice — after the fusion/DSP machinery was removed it was already a
"fast estimate you correct"; the user reports it does not really work.

## Decisions

- **Counting is manual and by colour.** Input is chip pieces per denomination, display is
  money. No head maths at the table, no model in the loop.
- **Purpose is overview, not audit.** A difference against the money on the table is shown
  as a hint and never blocks.
- **One place for players.** Table tab. The Cash tab becomes read-only reporting.
- **Photo chip-count is deleted entirely**, including the Gemini API-key setting and the
  Android CAMERA permission.

## Shape

### `components/PlayerRoster.tsx` (Table tab)
One card, one row per player: emoji picker · name · `⋯` menu. Row body shows buy-in with a
one-tap rebuy (+ `session.buyIn`), and the stack as money — tapping it counts that player.
The menu holds cash-out (amount prefilled from the counted stack), mark-out (tournament),
back-in and remove. Footer: money on the table vs counted, with the difference.
Adding/removing keeps `session.playerCount` in step so the Plan tab still computes for the
right table.

### `components/CountRound.tsx`
Full-screen sheet stepping through the still-in players. Per player, one row per
denomination: `−` · number · `+1` · `+20` (a 20-chip barrel), running total in chips and
money, and the previous value for reference. Denominations default to the ones the
starting stack uses, with a toggle for the whole inventory. The last player gets an
"assign the rest" shortcut (money on the table minus everyone else). A closing summary
lists old → new and the difference, then commits **all players in one dispatch**
(`LEDGER_SET_CHIPS_MANY`) so the live TV gets a single push.

Counts are entered per colour but only the **total** is stored (`LedgerPlayer.chips`, in
chip-units) — no new state, no new synced field.

### `components/EmojiPicker.tsx`
The 74-emoji set extracted from RemoteControl so the roster can offer it too; previously
emojis were unreachable without a live TV session.

### Cash tab
Summary tiles, read-only per-player net, who-pays-whom, league. The mismatch warning now
only fires once **everyone** is settled — mid-game the totals are supposed to differ.

## Removed

`ChipCountCard/Sheet/Review`, `ChipSeamEditor`, `lib/chipVision/*`, `useCameraCapture`,
`useDeviceTilt`, `Settings.aiVisionKey` + its Settings block, 134 `chipcount.*` i18n keys,
the photo-capture CSS, and the `CAMERA` / camera-feature entries in AndroidManifest (the TV
background picker uses a plain file input, which does not need them).

## Round 2 (same day) — live TV, stack trail, and counting extras

- **Counting shows on the TV.** New `AppState.counting: CountingProgress | null` (index / total /
  name / emoji / at) — the one genuinely new synced field, wired through all three spots
  (`dataOf`, `LIVE_APPLY_REMOTE`, the TvMode subscribe payload). The phone sets it per player and
  clears it on unmount; the TV shows a `🧮 counting · Marc · 1/3` pill. Never persisted: `migrate()`
  forces it back to `null`, because it only means "someone is counting right this second".
- **Stack trail.** `LedgerPlayer.chipHistory` gets one entry per counting round (capped at 12, in the
  reducer, so every write path records it). `components/Sparkline.tsx` draws it in `currentColor` —
  in the roster row and on the TV roster. It rides the already-synced `ledger`, so no new field.
- **Inventory check.** A colour tallied above what the box holds shows `⚠ 34/80` on that row. Uses
  the per-colour tallies the round already keeps in memory plus `denominations[].count`.
- **Counting reminder.** The roster shows the age of the newest count and turns the button primary
  past 25 minutes; the TV shows the same nudge during a break, when everyone is standing up anyway.
- **Undo.** An 8-second snackbar after a round restores the exact previous `chips` + `chipHistory`
  via `LEDGER_RESTORE_CHIPS`.
- **Starting-stack pre-fill.** A player who has never been counted starts from the dealt stack
  pattern (`computeStack().counts`, a denomId → chips record), with a "clear" escape.
- **Own numpad.** Tapping a count opens a 3×4 pad (digits, `C`, `⌫`) instead of the system keyboard.
  The `−` / `+1` / `+20` buttons stay for the common case.

Not built (offered, not picked): counting in seat order, stacks shown in big blinds.

## Verified

`npx tsc -b` and `npm run build` clean. Driven end-to-end in the dev preview (de): counting
round over 3 players (20×25 + 2×100 = 700 chips = €7), "assign the rest" = €53 against €80
on the table, summary diff €0, one dispatch persisted to localStorage; cash-out prefilled
from the counted stack and moved the player to a net row; bust cleared the stack; the
single-player count from the roster saved; Cash tab settled Jana → Tom €33. No console
errors.

Round 2, same preview: pre-fill produced the exact dealt stack (20×10 + 18×25 + 15×50 + 6×100 =
2.000 chips = €20 = buy-in); the numpad typed 34 into the 10s and the total followed; 999 of a
denomination the box only has 80 of showed `⚠ 999/80`; `counting` advanced 1/3 → 2/3 and the TV pill
rendered `🧮 Stacks zählen · 🐻 Marc · 1/3`, cleared to `null` on close; the round appended one
history entry per player and undo restored both `chips` and the trail; three sparkline paths drew in
the roster and three on the TV roster; the age line read "Vor 15 Min gezählt". `npx tsc -b` and
`npm run build` clean, no console errors.
