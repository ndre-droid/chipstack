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

## Verified

`npx tsc -b` and `npm run build` clean. Driven end-to-end in the dev preview (de): counting
round over 3 players (20×25 + 2×100 = 700 chips = €7), "assign the rest" = €53 against €80
on the table, summary diff €0, one dispatch persisted to localStorage; cash-out prefilled
from the counted stack and moved the player to a net row; bust cleared the stack; the
single-player count from the roster saved; Cash tab settled Jana → Tom €33. No console
errors.
