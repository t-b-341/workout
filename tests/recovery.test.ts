import { describe, expect, it } from 'vitest';
import {
  buildRecoveryScore,
  hydrationScore,
  nutritionScore,
  recoveryBand,
  sleepScore,
} from '../src/lib/recovery';

describe('recovery scoring', () => {
  it('returns fallback score when logs are missing', () => {
    const score = buildRecoveryScore({ date: '2026-04-27' });
    expect(score.compositeScore).toBe(60);
    expect(score.band).toBe('conservative');
  });

  it('maps composite thresholds to correct bands', () => {
    expect(recoveryBand(90)).toBe('push');
    expect(recoveryBand(75)).toBe('normal');
    expect(recoveryBand(65)).toBe('conservative');
    expect(recoveryBand(40)).toBe('recovery');
  });

  it('scores high-quality sleep near target highest', () => {
    expect(sleepScore({ id: '1', date: '2026-04-27', sleepHours: 8, sleepQuality: 5 })).toBeGreaterThan(95);
    expect(sleepScore({ id: '2', date: '2026-04-27', sleepHours: 4, sleepQuality: 1 })).toBeLessThan(45);
  });

  it('penalizes poor hydration markers', () => {
    const good = hydrationScore({
      id: 'h1',
      date: '2026-04-27',
      waterTargetMl: 3000,
      waterActualMl: 3000,
      electrolytes: true,
      urineColor: 2,
    });
    const poor = hydrationScore({
      id: 'h2',
      date: '2026-04-27',
      waterTargetMl: 3000,
      waterActualMl: 1200,
      electrolytes: false,
      urineColor: 8,
    });
    expect(good).toBeGreaterThan(poor);
  });

  it('weights protein and calories most in nutrition score', () => {
    const good = nutritionScore({
      id: 'n1',
      date: '2026-04-27',
      caloriesTarget: 2500,
      caloriesActual: 2500,
      proteinTargetG: 200,
      proteinActualG: 200,
      carbsTargetG: 250,
      carbsActualG: 240,
      fatTargetG: 80,
      fatActualG: 75,
      mealsLoggedCount: 4,
    });
    const bad = nutritionScore({
      id: 'n2',
      date: '2026-04-27',
      caloriesTarget: 2500,
      caloriesActual: 1700,
      proteinTargetG: 200,
      proteinActualG: 90,
      carbsTargetG: 250,
      carbsActualG: 120,
      fatTargetG: 80,
      fatActualG: 40,
      mealsLoggedCount: 1,
    });
    expect(good).toBeGreaterThan(bad);
  });
});
