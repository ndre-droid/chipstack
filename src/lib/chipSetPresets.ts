import type { Denomination } from '../types';

/**
 * Ready-made chip sets.
 *
 * Setting up the app used to mean typing nine denominations, nine colours and nine
 * counts before it could answer anything — for a box that came out of a shop and has
 * a well-known contents list. These are the common ones; everything stays editable
 * afterwards, and a set is only ever a starting point.
 */
export interface ChipSetPreset {
  id: string;
  name: string;
  note: string;
  chips: { value: number; color: string; accent: string; count: number }[];
}

export const CHIP_SET_PRESETS: ChipSetPreset[] = [
  {
    id: 'nash',
    name: 'SLOWPLAY Nash',
    note: '500 ceramic chips · 1–5000',
    chips: [
      { value: 1, color: '#ECE4D0', accent: '#B49A54', count: 100 },
      { value: 5, color: '#C0392B', accent: '#F0D083', count: 100 },
      { value: 10, color: '#31B6C9', accent: '#EAF7F3', count: 80 },
      { value: 25, color: '#2E9E52', accent: '#F2E7A8', count: 100 },
      { value: 50, color: '#E0782B', accent: '#FCE3C4', count: 60 },
      { value: 100, color: '#0C0C10', accent: '#CBA85A', count: 100 },
      { value: 500, color: '#7A3D9C', accent: '#ECD6F4', count: 50 },
      { value: 1000, color: '#E4B41F', accent: '#6E5410', count: 40 },
      { value: 5000, color: '#9A5228', accent: '#F3D6B4', count: 25 },
    ],
  },
  {
    id: 'dice300',
    name: 'Dice 300',
    note: 'the classic starter case',
    chips: [
      { value: 1, color: '#F2F2F2', accent: '#9AA0A6', count: 100 },
      { value: 5, color: '#C0392B', accent: '#FFFFFF', count: 100 },
      { value: 25, color: '#2E9E52', accent: '#FFFFFF', count: 50 },
      { value: 100, color: '#1B1B22', accent: '#FFFFFF', count: 50 },
    ],
  },
  {
    id: 'dice500',
    name: 'Dice 500',
    note: 'the big aluminium case',
    chips: [
      { value: 1, color: '#F2F2F2', accent: '#9AA0A6', count: 150 },
      { value: 5, color: '#C0392B', accent: '#FFFFFF', count: 150 },
      { value: 10, color: '#2F6FD0', accent: '#FFFFFF', count: 100 },
      { value: 25, color: '#2E9E52', accent: '#FFFFFF', count: 50 },
      { value: 100, color: '#1B1B22', accent: '#FFFFFF', count: 50 },
    ],
  },
  {
    id: 'casino',
    name: 'Casino colours',
    note: 'the values a real card room uses',
    chips: [
      { value: 1, color: '#F2F2F2', accent: '#B0B4BA', count: 100 },
      { value: 5, color: '#C0392B', accent: '#F5D6D2', count: 100 },
      { value: 25, color: '#2E9E52', accent: '#DDF3E4', count: 100 },
      { value: 100, color: '#1B1B22', accent: '#D8D8E0', count: 100 },
      { value: 500, color: '#7A3D9C', accent: '#ECD6F4', count: 50 },
      { value: 1000, color: '#E4B41F', accent: '#6E5410', count: 25 },
    ],
  },
  {
    id: 'cash',
    name: 'Cash game (cent values)',
    note: 'for a €0.05 / €0.10 table',
    chips: [
      { value: 5, color: '#F2F2F2', accent: '#9AA0A6', count: 100 },
      { value: 10, color: '#C0392B', accent: '#FFFFFF', count: 100 },
      { value: 25, color: '#2F6FD0', accent: '#FFFFFF', count: 100 },
      { value: 100, color: '#2E9E52', accent: '#FFFFFF', count: 100 },
      { value: 500, color: '#1B1B22', accent: '#CBA85A', count: 50 },
    ],
  },
];

/** Turn a preset into denominations, with fresh ids. */
export function denomsFromPreset(preset: ChipSetPreset, makeId: () => string): Denomination[] {
  return preset.chips.map((c) => ({
    id: makeId(),
    value: c.value,
    color: c.color,
    accent: c.accent,
    count: c.count,
    enabled: true,
    shape: 'chip' as const,
    minPerPlayer: 0,
  }));
}
