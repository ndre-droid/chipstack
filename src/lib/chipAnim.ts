import type { ChipAnim } from '../types';

/** A place in the app that draws a chip spread. */
export type ChipAnimSurface = 'plan' | 'table';

/**
 * Whether chips may move on this screen.
 *
 * The animation earns its keep where the stacks actually change while you watch —
 * the Plan screen, where the chip-mix slider grows one stack as it shrinks another.
 * The Table's starting stack is a reference picture you glance at, so it holds still
 * unless the setting says otherwise.
 */
export function animatedHere(setting: ChipAnim | undefined, surface: ChipAnimSurface): boolean {
  const mode = setting ?? 'plan';
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return surface === 'plan';
}
