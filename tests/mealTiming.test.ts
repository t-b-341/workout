import { describe, expect, it } from 'vitest';
import {
  deriveMealMetrics,
  effectiveMealCount,
  sortMealTimestamps,
} from '@/lib/mealTiming';
import type { NutritionLog } from '@/lib/types';

describe('sortMealTimestamps', () => {
  it('sorts, drops invalid, dedupes', () => {
    const a = '2026-04-29T12:00:00.000Z';
    const b = '2026-04-29T14:00:00.000Z';
    expect(sortMealTimestamps([b, 'bad', a, a])).toEqual([a, b]);
  });
});

describe('deriveMealMetrics', () => {
  it('returns empty metrics for no stamps', () => {
    expect(deriveMealMetrics([])).toMatchObject({
      occasions: 0,
      longestGapMinutes: null,
      avgGapMinutes: null,
    });
  });

  it('computes gaps and labels without eating-window framing', () => {
    const m = deriveMealMetrics([
      '2026-04-29T08:00:00.000Z',
      '2026-04-29T12:00:00.000Z',
      '2026-04-29T18:00:00.000Z',
    ]);
    expect(m.occasions).toBe(3);
    expect(m.longestGapMinutes).toBe(360);
    expect(m.avgGapMinutes).toBe(300);
    expect(m.firstMealTimeLabel).toBeTruthy();
    expect(m.lastMealTimeLabel).toBeTruthy();
  });
});

describe('effectiveMealCount', () => {
  const base: NutritionLog = {
    id: 'n1',
    date: '2026-04-29',
    caloriesTarget: 0,
    caloriesActual: 0,
    proteinTargetG: 0,
    proteinActualG: 0,
    carbsTargetG: 0,
    carbsActualG: 0,
    fatTargetG: 0,
    fatActualG: 0,
    mealsLoggedCount: 4,
  };

  it('uses timestamps when present', () => {
    expect(
      effectiveMealCount({
        ...base,
        mealTimestamps: ['2026-04-29T08:00:00.000Z', '2026-04-29T12:00:00.000Z'],
      }),
    ).toBe(2);
  });

  it('falls back to legacy count when timestamps absent', () => {
    expect(effectiveMealCount(base)).toBe(4);
  });

  it('uses zero when migrated but empty array', () => {
    expect(effectiveMealCount({ ...base, mealsLoggedCount: 0, mealTimestamps: [] })).toBe(0);
  });
});
