/**
 * Who is allowed to become the table's big screen.
 *
 * The bug this exists to name: the offer used to be hidden on any device that had
 * players in its ledger — "a device with a table of its own is the phone the night
 * is run on, and making it the TV is a dead end". That test is wrong, because a
 * paired TV mirrors the host's roster into its OWN store (`LIVE_APPLY_REMOTE`) and
 * that mirror is persisted. So the moment such a screen lost the 'tv' role — the
 * user hit "Exit TV", the pairing write failed at boot, the session was ended — it
 * came back holding a full roster it had never typed, read as "has its own table",
 * and was locked out of pairing for good: no offer, no code, no QR, just last
 * night's game sitting on the television with nothing on screen to explain it.
 *
 * The honest question is not "are there rows?" but "are they THIS device's rows?".
 */
export interface TvRoleView {
  /** already the designated big screen */
  deviceIsTv: boolean;
  /** already in a live session — as the TV, or as a host previewing one */
  synced: boolean;
  /** rows in this device's ledger */
  players: number;
  /** …and whether those rows were mirrored from a host phone rather than entered here */
  tableFromMirror: boolean;
}

/** Should this screen offer "use this device as the TV"? */
export function offersTvRole(v: TvRoleView): boolean {
  if (v.deviceIsTv || v.synced) return false;
  return v.players === 0 || v.tableFromMirror;
}

/** Is the roster on this screen one this device is running itself? */
export function hasOwnTable(v: Pick<TvRoleView, 'players' | 'tableFromMirror'>): boolean {
  return v.players > 0 && !v.tableFromMirror;
}
