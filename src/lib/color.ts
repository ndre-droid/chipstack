/** Small colour helpers for the free custom-accent picker. */

/** Darken a #rrggbb hex toward black by `amt` (0..1). Used to derive the
 *  "deep" accent (for light grounds) from a single chosen colour. */
export function darken(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = Math.max(0, Math.min(1, 1 - amt));
  const r = Math.round(((n >> 16) & 0xff) * f);
  const g = Math.round(((n >> 8) & 0xff) * f);
  const b = Math.round((n & 0xff) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** The three accent CSS vars a custom colour drives, as a style object. */
export function customAccentVars(hex: string): Record<string, string> {
  return {
    '--acc': hex,
    '--acc-bright': hex,
    '--acc-deep': darken(hex, 0.32),
  };
}
