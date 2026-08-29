/**
 * The stack trail behind the sparkline. It has to answer "how has this night gone
 * for me?", so it must always reach back to the FIRST counting round — a plain
 * `slice(-N)` answers "the last N rounds" instead, and on a long night the graph
 * quietly turns into a moving window that forgets the early swings.
 *
 * So the cap is enforced by thinning, not by dropping the oldest: once the trail is
 * full, every other interior point goes and the remaining ones keep spanning the
 * whole session at half the resolution. Repeat and the trail grows to the cap,
 * halves, grows again — the span is always the whole night, only the detail fades,
 * oldest-first, which is the part nobody is squinting at anyway.
 */
export type TrailPoint = { at: number; chips: number };

/** how many counting rounds a player's stack trail keeps (sparkline length) */
export const TRAIL_MAX = 60;

/**
 * Halve a full trail while keeping both ends: the first point (where the night
 * started) and the last (where it stands now) are the two the reader anchors on.
 */
function thin(trail: TrailPoint[]): TrailPoint[] {
  if (trail.length < 3) return trail;
  const kept: TrailPoint[] = [trail[0]];
  // interior points, every other one
  for (let i = 2; i < trail.length - 1; i += 2) kept.push(trail[i]);
  kept.push(trail[trail.length - 1]);
  return kept;
}

/** Append a counting round to a player's trail, keeping it inside the cap. */
export function pushTrail(trail: TrailPoint[] | undefined, point: TrailPoint, max = TRAIL_MAX): TrailPoint[] {
  const next = [...(trail ?? []), point];
  return next.length > max ? thin(next) : next;
}
