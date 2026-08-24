/**
 * How long to wait before pushing the next change to the TV.
 *
 * Two things pull in opposite directions. Every push is a full merge write of the
 * game document, so a burst of edits — a name being typed, the chip-mix slider being
 * dragged — must not become a burst of writes. But the big screen showing the chip
 * spread while somebody drags that slider is the whole point of the feature: waiting
 * for the drag to finish means the TV sits still for as long as a finger is down and
 * then jumps, which reads as broken.
 *
 * So: pace, don't collapse. The first change of a burst goes out at once, the rest are
 * spaced at least MIN_GAP_MS apart, and the last one always lands because a change
 * arriving inside the gap is scheduled for the moment the gap expires rather than
 * dropped. A three-second drag costs about five writes instead of one, and the big
 * screen steps along with the finger instead of waiting for it to lift.
 *
 * The gap is not a taste call either: Firestore starts contending on a document
 * written more than about once a second, and every push here rewrites the same game
 * document. 700ms keeps a hard drag under that while still reading as live from across
 * the room — the chips move several times on the way from one end of the slider to the
 * other, which is what the big screen is for.
 */

/** Floor between two writes of the game document. */
export const MIN_GAP_MS = 700;

/**
 * Milliseconds to wait before sending a change seen at `now`, given when the last
 * push actually went out (null = nothing sent yet this session).
 */
export function pushDelay(lastPushAt: number | null, now: number, minGap: number = MIN_GAP_MS): number {
  if (lastPushAt === null) return 0;
  const since = now - lastPushAt;
  if (since >= minGap) return 0;
  // A clock that jumped backwards (device time change) must not park a push in the
  // far future — the most it can ever be is one whole gap.
  return Math.max(0, Math.min(minGap, minGap - since));
}
