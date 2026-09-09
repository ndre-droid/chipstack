# Ambient stack counting: an age per player, not a round (2026-09-09)

The counting round is the app's most avoided feature. It is not slow — it is an
*event*: it stops the game while the host walks the table, so at a real night it
never starts. This makes a single player's stack the atom instead. Count whoever
you like, whenever there is a lull, and the roster carries how old each number is.

The round stays. It just stops being the thing the screen asks for.

## Problem

Counting one player at a time is already possible — tap a row, and `StackPrompt`
offers a typed amount, a colour tally (`CountStack`), or the ruler. Nothing has to
be built for the *act* of counting. Three things stop it from adding up to a
strategy.

**The trail cannot say who was counted.** `LEDGER_SET_CHIPS_MANY`
(`store.tsx:680`) pushes a `chipHistory` point for **every** still-playing player,
not only the ones in `entries`; an uncounted player's last known stack is carried
forward with a fresh `at`. That is deliberate and right for the sparkline — it
keeps every trend line the same length and comparable, which is the bug the comment
there calls "why does only half the table have a graph?". But it means the trail
answers "when did the table last count" and never "when was *this* stack last
looked at". Counting Ben alone stamps all six players as current.

**The roster reports the freshest stack, not the stalest.** `lastCountAt`
(`PlayerRoster.tsx:113`) reduces to the **newest** `at` on the table, so one
single-player count flips the footer to "Counted just now" while five stacks are an
hour old. Today the app rewards the round and erases the evidence of ambient
counting — the exact opposite of what is wanted.

**The round is the call to action.** The counting-round button turns `btn-primary`
whenever `stale` (`PlayerRoster.tsx:615`). The one prominent control points at the
event that never happens, and nothing points at the cheap thing that could.

## Decisions

- **A new `countedAt?: number` on `LedgerPlayer`**, not a flag on the trail point.
  The obvious-looking alternative — `TrailPoint` gains `est?: true`, and the age is
  the last un-flagged point — loses to `thin()` (`chipTrail.ts:22`): past
  `TRAIL_MAX` it drops every other interior point, and a player's last *measured*
  point is an interior point. It can be thinned away, and the age then jumps back
  to an older measurement and reports a just-counted player as overdue. A field on
  the row cannot be thinned. It also costs nothing to move: `liveData.ts:73` passes
  `state.ledger` through whole, so sync and backup carry it with no change.

- **`countedAt` is set wherever `chips` is set to a value the app *knows*.** One
  rule, no exceptions to remember. That includes a freshly dealt starting stack: at
  the moment a player is seated the app knows their stack exactly, and a table that
  just sat down must not read as never counted.

- **`chipTrail.ts` is not touched.** The trail keeps its current shape and its
  carry-forward behaviour; the sparkline is bit-identical to today.

- **The display is passive.** Each row shows its own age and only once it is stale.
  Nothing is tappable, there is no "count Ben next" suggestion line, and no row is
  singled out. A freshly counted table shows no age text at all, and ages surface
  one at a time as the night goes on.

- **The footer reads the oldest in-play player, not the newest.** A leaderboard is
  only as fresh as its stalest stack; reporting the newest claims more than is
  known.

- **`STALE_MINUTES` stays hardcoded at 25**, now applied per player rather than to
  the table. Not a setting — no real night has asked for a different number, and a
  setting for an unmeasured preference is a guess with a UI.

- **Players who are `out` or cashed out never show an age.** The store already
  freezes their trail; asking to count somebody who has left the table is noise.

- **Ages switch to hours past 60 minutes.** Ambient counting means a stack can
  honestly be two hours old, and "143 min" is not a number anyone reads.

## Shape

### `types.ts`

`LedgerPlayer` gains:

```ts
/** epoch ms when this stack was last *known* — counted, or dealt as a starting
 *  stack. Not the same as the last chipHistory point: a counting round stamps a
 *  trail point onto every playing player so the sparklines stay comparable, and
 *  those carried-forward points are a guess, not a look. Undefined = never known. */
countedAt?: number;
```

### `store.tsx`

Nine one-line changes, each beside an existing `chips:` line.

Set to `Date.now()`:

| case | line | rule |
|---|---|---|
| `LEDGER_SET_CHIPS_MANY` | 680 | **only for ids present in `entries`** — this is the whole point. Carried-forward players keep getting their trail point and keep their old `countedAt`. |
| `LEDGER_SET_ALL_CHIPS` | 677 | "everyone starts with X" is a known stack |
| `LEDGER_SEAT_PEOPLE` | 605 | `now` is already in scope here |
| `LEDGER_SEAT_LINEUP` | 627 | |
| `LEDGER_ADD` | 633 | |
| `LEDGER_ADD_MANY` | 649 | |
| `LEDGER_RESET_PLAYER` | 710 | |
| `LEDGER_RESET_ALL` | 730 | |

Cleared:

| case | line | rule |
|---|---|---|
| `LEDGER_CLEAR_CHIPS` | 747 | `countedAt: undefined` beside the existing `chips: undefined` — the stacks are gone, so their age is a lie |

In the cases that `.map()` the whole ledger (`LEDGER_RESET_ALL`,
`LEDGER_SET_ALL_CHIPS`, `LEDGER_SET_CHIPS_MANY`), hoist one `Date.now()` above the
map so every row shares a timestamp rather than drifting by a millisecond each.
`LEDGER_SET_CHIPS_MANY` already has `const at = Date.now()` — reuse it.

`LEDGER_RESTORE` needs nothing: it replaces the ledger wholesale, so undo restores
ages with the rest of the row.

### `lib/countAge.ts` (new)

The pure half, so it can be tested without React:

- `rowAgeOf(p: LedgerPlayer, at: number): 'hidden' | 'never' | number` — what a row
  should say. `'hidden'` when the player is `out` or has cashed out, or when their
  stack is known and fresher than `STALE_MS`; `'never'` when `countedAt` is
  undefined; otherwise the age in ms. Three outcomes rather than a nullable number
  on purpose: "there is nothing to show" and "this has never been counted" are
  different facts, and collapsing them into one `null` is how the row ends up
  silently hiding an uncounted player.
- **Never counted is stale.** A player with no `countedAt` renders
  `roster.rowNeverCounted` — it is the oldest state there is, not a missing value.
- `oldestCountedAt(ledger: LedgerPlayer[]): number | null` — the **oldest**
  `countedAt` among players still in play; `null` if any of them has never been
  counted (never is older than any number) or the table is empty.
- `ageLabel(ms: number): { unit: 'min' | 'h'; n: number }` — minutes below 60,
  whole hours at or above. Returns the parts, not a string; the caller does i18n.
- `STALE_MS` moves here from `PlayerRoster`'s `STALE_MINUTES`.

### `components/PlayerRoster.tsx`

- `lastCountAt` / `countedMinsAgo` / `stale` are replaced by `oldestCountedAt` +
  `ageLabel`. The footer `.pr-age` line keeps its place and its `is-stale`
  treatment and changes only which player it is describing.
- Each player row renders a faint age line from `rowAgeOf` — nothing on `'hidden'`,
  `roster.rowNeverCounted` on `'never'`, and `roster.rowAgeMin` / `roster.rowAgeH`
  on a number.
- The counting-round button drops the `stale ? 'btn-primary' : 'btn-ghost'`
  conditional and is always `btn-ghost`.
- The existing 60-second re-render tick already keeps these strings honest and is
  unchanged.

### `styles.css` / `lib/i18n.ts`

- `.pr-row-age` — faint, small, aligned with the row's numbers. `.pr-age`
  unchanged.
- New keys, `en` and `de`:
  - `roster.rowAgeMin` — `{n} min old` / `{n} Min alt`
  - `roster.rowAgeH` — `{n} h old` / `{n} Std alt`
  - `roster.rowNeverCounted` — `not counted` / `nicht gezählt`
  - `roster.oldestAgoMin` — `Oldest count {n} min ago` / `Ältester Stand vor {n} Min`
  - `roster.oldestAgoH` — `Oldest count {n} h ago` / `Ältester Stand vor {n} Std`
- `roster.countedJustNow` / `roster.neverCounted` stay: the footer still uses the
  just-now and never wordings. `roster.countedAgo` is replaced by the two
  `oldestAgo` keys and is removed from both locales.

## Testing

`lib/countAge.test.ts`, following the house convention — a plain
`node --experimental-strip-types` script, `.ts` extensions on imports, `Date.now`
stubbed rather than waited on.

- `rowAgeOf` returns `'hidden'` for an `out` player, for one with a `cashOut`, and
  for one counted 5 minutes ago; `'never'` for one with no `countedAt`; and the age
  in ms for one counted 40 minutes ago. The `out`-and-never-counted case must read
  `'hidden'`, not `'never'` — leaving the table wins over never being counted.
- `oldestCountedAt` picks the oldest of several in-play players and **ignores** a
  newer count belonging to an `out` player.
- `oldestCountedAt` returns `null` when any in-play player has never been counted —
  never must outrank every timestamp, or a table with one uncounted player would
  report the others' freshness as its own.
- `ageLabel` at 59 min, 60 min, 61 min, 2 h.
- A reducer test over `LEDGER_SET_CHIPS_MANY`: two players, only one in `entries`;
  both gain a `chipHistory` point, only the counted one's `countedAt` moves.
- A reducer test over `LEDGER_CLEAR_CHIPS`: `countedAt` is gone.

## Migration

None, deliberately. A night already in progress when this ships has no `countedAt`
on any row, so every player reads "not counted" until their first count — which is
true, and which heals itself the first time anybody is counted. Writing a migration
that back-dated ages from `chipHistory` would be inventing the exact fact this spec
exists to stop inventing.
