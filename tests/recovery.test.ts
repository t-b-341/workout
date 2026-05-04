import { describe, expect, it } from 'vitest';
import {
  buildRecoveryScore,
  hydrationScore,
  mindfulnessScore,
  nutritionScore,
  recoveryBand,
  sleepScore,
  stressScoreFromAverageRating,
} from '../src/lib/recovery';

describe('recovery scoring', () => {
  it('returns fallback score when logs are missing', () => {
    const score = buildRecoveryScore({ date: '2026-04-27' });
    expect(score.compositeScore).toBe(60);
    expect(score.band).toBe('conservative');
    expect(score.stressScore).toBeUndefined();
  });

  it('includes mindfulness in composite when readiness logs minutes', () => {
    const readinessLow = {
      id: 'r',
      sessionLogId: 's1',
      date: '2026-04-27',
      sleepHours: 8,
      soreness: 2,
      motivation: 3,
      hrvSkipped: true,
      mindfulnessMinutes: 0,
      createdAt: '2026-04-27T12:00:00.000Z',
    };
    const readinessHigh = { ...readinessLow, mindfulnessMinutes: 30 };
    expect(mindfulnessScore(30)).toBeGreaterThan(mindfulnessScore(0));

    const base = { date: '2026-04-27' };
    const withLow = buildRecoveryScore({ ...base, readiness: readinessLow });
    const withHigh = buildRecoveryScore({ ...base, readiness: readinessHigh });
    expect(withHigh.mindfulnessScore).toBeDefined();
    expect(withLow.mindfulnessScore).toBeDefined();
    expect(withHigh.compositeScore).toBeGreaterThan(withLow.compositeScore);
  });

  it('blends stress and mindfulness when both are present', () => {
    const stress = [
      {
        id: 's',
        date: '2026-04-27',
        loggedAt: '2026-04-27T12:00:00.000Z',
        rating: 3 as const,
      },
    ];
    const readiness = {
      id: 'r',
      sessionLogId: 's1',
      date: '2026-04-27',
      sleepHours: 8,
      soreness: 2,
      motivation: 3,
      hrvSkipped: true,
      mindfulnessMinutes: 15,
      createdAt: '2026-04-27T12:00:00.000Z',
    };
    const both = buildRecoveryScore({ date: '2026-04-27', stress, readiness });
    const stressOnly = buildRecoveryScore({ date: '2026-04-27', stress });
    expect(both.stressScore).toBeDefined();
    expect(both.mindfulnessScore).toBeDefined();
    expect(stressOnly.mindfulnessScore).toBeUndefined();
    expect(both.compositeScore).not.toBe(stressOnly.compositeScore);
  });

  it('includes stress in composite when stress log present', () => {
    const stressLow = [
      {
        id: 's',
        date: '2026-04-27',
        loggedAt: '2026-04-27T10:00:00.000Z',
        rating: 1 as const,
      },
    ];
    const stressHigh = [
      {
        id: 's',
        date: '2026-04-27',
        loggedAt: '2026-04-27T10:00:00.000Z',
        rating: 5 as const,
      },
    ];
    expect(stressScoreFromAverageRating(1)).toBeGreaterThan(stressScoreFromAverageRating(5));

    const base = { date: '2026-04-27' };
    const withLow = buildRecoveryScore({ ...base, stress: stressLow });
    const withHigh = buildRecoveryScore({ ...base, stress: stressHigh });
    expect(withLow.stressScore).toBeDefined();
    expect(withLow.compositeScore).toBeGreaterThan(withHigh.compositeScore);
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

  it('does not penalize adequate long sleep vs shorter mediocre sleep', () => {
    const longGood = sleepScore({ id: 'a', date: '2026-04-27', sleepHours: 10, sleepQuality: 5 });
    const shorterMediocre = sleepScore({ id: 'b', date: '2026-04-27', sleepHours: 8, sleepQuality: 3 });
    expect(longGood).toBeGreaterThan(shorterMediocre);
  });

  it('penalizes high wake count and long sleep latency when quality and duration match', () => {
    const base = { id: 's', date: '2026-04-27', sleepHours: 8, sleepQuality: 5 };
    const clean = sleepScore({ ...base });
    const fragmented = sleepScore({ ...base, wakeCount: 4, sleepOnsetLatencyMin: 75 });
    expect(clean).toBeGreaterThan(fragmented);
    expect(sleepScore({ ...base, wakeCount: 0 })).toBe(clean);
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

  it('graduates urine color penalty (clearest = none; 7–8 = max)', () => {
    const base = {
      id: 'h',
      date: '2026-04-27',
      waterTargetMl: 3000,
      waterActualMl: 3000,
      electrolytes: false,
    };
    const clear = hydrationScore({ ...base, urineColor: 1 });
    const mid = hydrationScore({ ...base, urineColor: 5 });
    const dark = hydrationScore({ ...base, urineColor: 8 });
    expect(clear).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(dark);
    expect(hydrationScore({ ...base, urineColor: 7 })).toBe(hydrationScore({ ...base, urineColor: 8 }));
  });

  it('applies meal bonus from timestamps (>=3) without hitting score cap', () => {
    const partial = {
      id: 'n-bonus',
      date: '2026-04-27',
      caloriesTarget: 2500,
      caloriesActual: 2000,
      proteinTargetG: 200,
      proteinActualG: 160,
      carbsTargetG: 250,
      carbsActualG: 200,
      fatTargetG: 80,
      fatActualG: 70,
      mealsLoggedCount: 0,
    };
    const threeStamps = nutritionScore({
      ...partial,
      mealTimestamps: [
        '2026-04-27T08:00:00.000Z',
        '2026-04-27T12:00:00.000Z',
        '2026-04-27T18:00:00.000Z',
      ],
    });
    const twoStamps = nutritionScore({
      ...partial,
      mealTimestamps: ['2026-04-27T08:00:00.000Z', '2026-04-27T12:00:00.000Z'],
    });
    expect(threeStamps).toBeGreaterThan(twoStamps);
    expect(threeStamps - twoStamps).toBe(3);
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
