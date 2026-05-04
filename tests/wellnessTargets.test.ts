import { describe, expect, it } from 'vitest';
import { defaultWellnessTargets, normalizeWellnessTargets } from '../src/lib/wellnessTargets';
import { CARDIO_WEEKLY_TARGET_MIN } from '../src/lib/seed';

describe('wellnessTargets', () => {
  it('default matches cardio seed and 10 min daily', () => {
    const d = defaultWellnessTargets();
    expect(d.mindfulnessDailyMin).toBe(10);
    expect(d.mindfulnessWeeklyMin).toBe(70);
    expect(d.cardioWeeklyMin).toBe(CARDIO_WEEKLY_TARGET_MIN);
  });

  it('normalizes and clamps', () => {
    expect(
      normalizeWellnessTargets({
        mindfulnessDailyMin: 999,
        mindfulnessWeeklyMin: -5,
        cardioWeeklyMin: 90,
      }),
    ).toEqual({
      mindfulnessDailyMin: 180,
      mindfulnessWeeklyMin: 1,
      cardioWeeklyMin: 90,
    });
  });

  it('treats NaN as defaults', () => {
    expect(
      normalizeWellnessTargets({
        mindfulnessDailyMin: NaN,
        mindfulnessWeeklyMin: 100,
        cardioWeeklyMin: NaN,
      }).mindfulnessDailyMin,
    ).toBe(10);
  });
});
