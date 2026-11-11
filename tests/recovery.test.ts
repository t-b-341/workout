import { describe, expect, it } from 'vitest';
import {
  buildRecoveryScore,
  buildRecoveryScoreSeries,
  hydrationScore,
  mindfulnessScore,
  nutritionScore,
  readinessScore,
  recoveryBand,
  recoveryInsufficientDataLine,
  recoveryPlan,
  sleepScore,
  stressScoreFromAverageRating,
} from '../src/lib/recovery';
import type { HydrationLog, NutritionLog, ReadinessLog, SleepLog } from '../src/lib/types';

const sleepGood: SleepLog = { id: '1', date: '2026-04-27', sleepHours: 8, sleepQuality: 5 };
const hydrationGood: HydrationLog = {
  id: 'h1',
  date: '2026-04-26',
  waterTargetMl: 3000,
  waterActualMl: 3000,
  electrolytes: true,
  urineColor: 2,
};
const nutritionGood: NutritionLog = {
  id: 'n1',
  date: '2026-04-26',
  caloriesTarget: 2500,
  caloriesActual: 2500,
  proteinTargetG: 200,
  proteinActualG: 200,
  carbsTargetG: 250,
  carbsActualG: 240,
  fatTargetG: 80,
  fatActualG: 75,
  mealsLoggedCount: 4,
};
const readinessGood: ReadinessLog = {
  id: 'r1',
  sessionLogId: 's1',
  date: '2026-04-27',
  sleepHours: 8,
  soreness: 2,
  motivation: 4,
  hrvSkipped: true,
  createdAt: '2026-04-27T10:00:00.000Z',
};

const sleepMixed: SleepLog = {
  id: '2',
  date: '2026-04-27',
  sleepHours: 6,
  sleepQuality: 3,
  wakeCount: 2,
  sleepOnsetLatencyMin: 30,
};
const hydrationMixed: HydrationLog = {
  id: 'h2',
  date: '2026-04-26',
  waterTargetMl: 3000,
  waterActualMl: 1800,
  electrolytes: false,
  urineColor: 6,
};
const nutritionMixed: NutritionLog = {
  id: 'n2',
  date: '2026-04-26',
  caloriesTarget: 2500,
  caloriesActual: 1700,
  proteinTargetG: 200,
  proteinActualG: 90,
  carbsTargetG: 250,
  carbsActualG: 120,
  fatTargetG: 80,
  fatActualG: 40,
  mealsLoggedCount: 1,
};
const readinessMixed: ReadinessLog = {
  id: 'r2',
  sessionLogId: 's1',
  date: '2026-04-27',
  sleepHours: 6,
  soreness: 4,
  motivation: 2,
  hrvSkipped: false,
  hrvRmssd: 35,
  sleepInterruptions: 2,
  createdAt: '2026-04-27T10:00:00.000Z',
};

describe('recovery scoring', () => {
  it('returns null scores when logs are missing', () => {
    const score = buildRecoveryScore({ date: '2026-04-27' });
    expect(score.sleepScore).toBeNull();
    expect(score.hydrationScore).toBeNull();
    expect(score.nutritionScore).toBeNull();
    expect(score.readinessScore).toBeNull();
    expect(score.compositeScore).toBeNull();
    expect(score.band).toBeNull();
    expect(score.present).toEqual([]);
    expect(score.missing).toEqual(['sleep', 'hydration', 'nutrition', 'readiness']);
    expect(score.stressScore).toBeUndefined();
    expect(sleepScore()).toBeNull();
    expect(hydrationScore()).toBeNull();
    expect(nutritionScore()).toBeNull();
    expect(readinessScore()).toBeNull();
    expect(recoveryInsufficientDataLine(score)).toBe(
      'Not enough data. Log at least two of sleep, readiness, hydration, and nutrition.',
    );
  });

  it('pins the composite for two fully logged days', () => {
    const calm = buildRecoveryScore({
      date: '2026-04-27',
      sleep: sleepGood,
      hydration: hydrationGood,
      nutrition: nutritionGood,
      readiness: readinessGood,
    });
    expect(calm.sleepScore).toBe(100);
    expect(calm.hydrationScore).toBe(100);
    expect(calm.nutritionScore).toBe(100);
    expect(calm.readinessScore).toBe(83);
    expect(calm.compositeScore).toBe(97);
    expect(calm.band).toBe('push');
    expect(calm.present).toEqual(['sleep', 'hydration', 'nutrition', 'readiness']);
    expect(calm.missing).toEqual([]);

    const strained = buildRecoveryScore({
      date: '2026-04-27',
      sleep: sleepMixed,
      hydration: hydrationMixed,
      nutrition: nutritionMixed,
      readiness: readinessMixed,
      stress: [{ id: 's', date: '2026-04-27', loggedAt: '2026-04-27T10:00:00.000Z', rating: 4 }],
      mindfulness: [{ id: 'm1', date: '2026-04-27', loggedAt: '2026-04-27T09:00:00.000Z', durationMin: 15 }],
    });
    expect(strained.sleepScore).toBe(76);
    expect(strained.hydrationScore).toBe(52);
    expect(strained.nutritionScore).toBe(47);
    expect(strained.readinessScore).toBe(48);
    expect(strained.stressScore).toBe(40);
    expect(strained.mindfulnessScore).toBe(78);
    expect(strained.compositeScore).toBe(59);
    expect(strained.band).toBe('conservative');
  });

  it('returns a null composite when only one core pillar is logged', () => {
    const score = buildRecoveryScore({ date: '2026-04-27', sleep: sleepGood });
    expect(score.sleepScore).toBe(100);
    expect(score.hydrationScore).toBeNull();
    expect(score.nutritionScore).toBeNull();
    expect(score.readinessScore).toBeNull();
    expect(score.compositeScore).toBeNull();
    expect(score.band).toBeNull();
    expect(score.present).toEqual(['sleep']);
    expect(score.missing).toEqual(['hydration', 'nutrition', 'readiness']);
    expect(recoveryInsufficientDataLine(score)).toBe(
      'Not enough data. Log hydration, nutrition, or readiness to get a score.',
    );
  });

  it('re-normalises weights when two core pillars are logged', () => {
    const score = buildRecoveryScore({
      date: '2026-04-27',
      sleep: sleepMixed,
      hydration: hydrationMixed,
    });
    // Published weights are sleep 0.4 and hydration 0.2 (sum 0.6) → 2/3 and 1/3.
    // 76 * (2/3) + 52 * (1/3) = 68. The old placeholder fill (nutrition 60, readiness 60) was 65.
    expect(score.sleepScore).toBe(76);
    expect(score.hydrationScore).toBe(52);
    expect(score.nutritionScore).toBeNull();
    expect(score.readinessScore).toBeNull();
    expect(score.compositeScore).toBe(68);
    expect(score.band).toBe('conservative');
    expect(score.present).toEqual(['sleep', 'hydration']);
  });

  it('recoveryPlan(null) carries no adjustment', () => {
    expect(recoveryPlan(null)).toEqual({
      band: null,
      intensityNote: 'Not enough data to adjust training.',
      cardioNote: '',
      nutritionNote: '',
    });
  });

  it('emits null for a missing score in a day series', () => {
    const rows = buildRecoveryScoreSeries({
      sleepLogs: [sleepGood],
      hydrationLogs: [],
      nutritionLogs: [],
      readinessLogs: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2026-04-27');
    expect(rows[0]?.sleepScore).toBe(100);
    expect(rows[0]?.hydrationScore).toBeNull();
    expect(rows[0]?.nutritionScore).toBeNull();
    expect(rows[0]?.readinessScore).toBeNull();
    expect(rows[0]?.compositeScore).toBeNull();
    expect(rows[0]?.band).toBeNull();
  });

  it('includes mindfulness in composite when mindfulness logs include duration', () => {
    const readiness = {
      id: 'r',
      sessionLogId: 's1',
      date: '2026-04-27',
      sleepHours: 8,
      soreness: 2,
      motivation: 3,
      hrvSkipped: true,
      createdAt: '2026-04-27T12:00:00.000Z',
    };
    expect(mindfulnessScore(30)).toBeGreaterThan(mindfulnessScore(0));

    const base = {
      date: '2026-04-27',
      readiness,
      sleep: sleepMixed,
      hydration: hydrationMixed,
      nutrition: nutritionMixed,
    };
    const withLow = buildRecoveryScore({ ...base, mindfulness: [] });
    const withHigh = buildRecoveryScore({
      ...base,
      mindfulness: [
        {
          id: 'm1',
          date: '2026-04-27',
          loggedAt: '2026-04-27T08:00:00.000Z',
          durationMin: 30,
        },
      ],
    });
    expect(withHigh.mindfulnessScore).toBeDefined();
    expect(withLow.mindfulnessScore).toBeUndefined();
    expect(withHigh.compositeScore).not.toBeNull();
    expect(withLow.compositeScore).not.toBeNull();
    expect(withHigh.compositeScore!).toBeGreaterThan(withLow.compositeScore!);
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
      createdAt: '2026-04-27T12:00:00.000Z',
    };
    const core = {
      date: '2026-04-27',
      sleep: sleepGood,
      hydration: hydrationGood,
      nutrition: nutritionGood,
      readiness,
    };
    const both = buildRecoveryScore({
      ...core,
      stress,
      mindfulness: [
        {
          id: 'm1',
          date: '2026-04-27',
          loggedAt: '2026-04-27T09:00:00.000Z',
          durationMin: 30,
        },
      ],
    });
    const stressOnly = buildRecoveryScore({ ...core, stress });
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

    const base = {
      date: '2026-04-27',
      sleep: sleepGood,
      hydration: hydrationGood,
      nutrition: nutritionGood,
      readiness: readinessGood,
    };
    const withLow = buildRecoveryScore({ ...base, stress: stressLow });
    const withHigh = buildRecoveryScore({ ...base, stress: stressHigh });
    expect(withLow.stressScore).toBeDefined();
    expect(withLow.compositeScore).not.toBeNull();
    expect(withHigh.compositeScore).not.toBeNull();
    expect(withLow.compositeScore!).toBeGreaterThan(withHigh.compositeScore!);
  });

  it('maps composite thresholds to correct bands', () => {
    expect(recoveryBand(90)).toBe('push');
    expect(recoveryBand(75)).toBe('normal');
    expect(recoveryBand(65)).toBe('conservative');
    expect(recoveryBand(40)).toBe('recovery');
    expect(recoveryBand(0)).toBe('recovery');
    expect(recoveryBand(null)).toBeNull();
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
    const base: SleepLog = { id: 's', date: '2026-04-27', sleepHours: 8, sleepQuality: 5 };
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

  it('penalizes readiness for higher sleep interruptions', () => {
    const base = {
      id: 'r1',
      sessionLogId: 's1',
      date: '2026-04-27',
      sleepHours: 8,
      soreness: 2,
      motivation: 4,
      hrvSkipped: true,
      createdAt: '2026-04-27T10:00:00.000Z',
    };
    const smooth = readinessScore({ ...base, sleepInterruptions: 0 });
    const broken = readinessScore({ ...base, sleepInterruptions: 5 });
    expect(smooth).toBeGreaterThan(broken);
  });
});
