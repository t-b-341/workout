import { describe, expect, it } from 'vitest';
import { sortLiftsWithFavoritesFirst, sortPrescriptionsWithFavoritesFirst } from '@/lib/favoriteLifts';
import type { Lift, Prescription } from '@/lib/types';

const lifts: Lift[] = [
  { id: 'a', name: 'Alpha', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'b', name: 'Beta', equipment: 'barbell', loadUnit: 'lb', repUnit: 'reps', increment: 5 },
  { id: 'c', name: 'Gamma', equipment: 'dumbbell', loadUnit: 'lb', repUnit: 'reps', increment: 2.5 },
];

describe('sortPrescriptionsWithFavoritesFirst', () => {
  it('orders favorites by pin order then preserves order field for non-favorites', () => {
    const rx: Prescription[] = [
      { id: '1', templateId: 'U1', liftId: 'c', order: 30, weight: 10, sets: 3, repMin: 8, repMax: 12 },
      { id: '2', templateId: 'U1', liftId: 'a', order: 10, weight: 10, sets: 3, repMin: 8, repMax: 12 },
      { id: '3', templateId: 'U1', liftId: 'b', order: 20, weight: 10, sets: 3, repMin: 8, repMax: 12 },
    ];
    const out = sortPrescriptionsWithFavoritesFirst(rx, ['b', 'a']);
    expect(out.map((p) => p.liftId)).toEqual(['b', 'a', 'c']);
  });
});

describe('sortLiftsWithFavoritesFirst', () => {
  it('puts favorites first in pin order, then alpha', () => {
    const out = sortLiftsWithFavoritesFirst(lifts, ['c', 'a']);
    expect(out.map((l) => l.id)).toEqual(['c', 'a', 'b']);
  });
});
