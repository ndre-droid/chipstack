import type { AccentId, Skin } from '../types';

/**
 * The five looks and the eight accents, as data.
 *
 * These used to live inside SettingsScreen, which was fine while Settings was the
 * only place a skin could be picked. The first-run wizard offers them too — a look
 * is the one thing in this app that lands before anything has been counted — and
 * two copies of a swatch list is how a new skin ends up half-added.
 *
 * `bg` is only ever a preview swatch. The real theming is CSS: `data-skin` on
 * <html> and the token blocks in styles.css.
 */
export const SKIN_STYLES: { id: Skin; name: string; bg: string; note: string }[] = [
  { id: 'minimal', name: 'Minimal', bg: '#16161a', note: 'Neutral canvas — also pick light / dark below.' },
  { id: 'casino', name: 'Casino Felt', bg: 'radial-gradient(120% 90% at 50% 0%, #275a3d, #0a1c12)', note: 'Warm green felt & brass, with a serif touch.' },
  { id: 'playful', name: 'Playful', bg: '#fbe9c8', note: 'Bright, bold and chunky.' },
  { id: 'scifi', name: 'Sci-Fi', bg: 'radial-gradient(120% 90% at 50% 0%, #0c1a4c, #05060f)', note: 'Deep space with a neon glow.' },
  { id: 'pokernacht', name: 'Pokernacht', bg: 'radial-gradient(120% 90% at 50% 0%, #4a1220, #140609)', note: 'Late-night broadcast: burgundy, gold and card-back damask.' },
];

export const ACCENT_SWATCHES: { id: AccentId; name: string; color: string }[] = [
  { id: 'amber', name: 'Amber', color: '#f0b429' },
  { id: 'gold', name: 'Gold', color: '#e6c878' },
  { id: 'emerald', name: 'Emerald', color: '#34d399' },
  { id: 'cyan', name: 'Cyan', color: '#3fe6ff' },
  { id: 'cobalt', name: 'Cobalt', color: '#5aa0ff' },
  { id: 'violet', name: 'Violet', color: '#b18cff' },
  { id: 'crimson', name: 'Crimson', color: '#ff6b6b' },
  { id: 'coral', name: 'Coral', color: '#ff7a4d' },
];

/** The dot drawn on a skin's swatch — its accent, or amber if it has none yet. */
export function accentColor(id: AccentId | undefined): string {
  return ACCENT_SWATCHES.find((a) => a.id === id)?.color ?? '#f0b429';
}
