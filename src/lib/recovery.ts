import { kcalFromMacros } from './macros';
import { effectiveMealCount } from './mealTiming';
import type {
  HydrationLog,
  NutritionLog,
  ReadinessLog,
  RecoveryBand,
  RecoveryPlan,
  RecoveryScore,
  SleepLog,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 1;
  return clamp(actual / target, 0, 1.2);
}

export function sleepScore(log?: SleepLog): number {
  if (!log) return 60;
  const durationDelta = Math.abs(log.sleepHours - 8);
  const durationScore = clamp(100 - durationDelta * 18, 0, 100);
  const qualityScore = clamp((log.sleepQuality / 5) * 100, 0, 100);
  return Math.round(durationScore * 0.7 + qualityScore * 0.3);
}

export function hydrationScore(log?: HydrationLog): number {
  if (!log) return 60;
  const water = pct(log.waterActualMl, log.waterTargetMl);
  const waterScore = clamp(water * 100, 0, 100);
  const electrolyteBonus = log.electrolytes ? 5 : 0;
  const colorPenalty = log.urineColor && log.urineColor >= 7 ? 10 : 0;
  return Math.round(clamp(waterScore + electrolyteBonus - colorPenalty, 0, 100));
}

export function nutritionScore(log?: NutritionLog): number {
  if (!log) return 60;
  const protein = pct(log.proteinActualG, log.proteinTargetG);
  const calActual = kcalFromMacros(log.proteinActualG, log.carbsActualG, log.fatActualG);
  const calTarget = kcalFromMacros(log.proteinTargetG, log.carbsTargetG, log.fatTargetG);
  const calories = pct(calActual, calTarget);
  const carbs = pct(log.carbsActualG, log.carbsTargetG);
  const fats = pct(log.fatActualG, log.fatTargetG);
  const mealsBonus = effectiveMealCount(log) >= 3 ? 3 : 0;
  const score = protein * 45 + calories * 30 + carbs * 15 + fats * 10;
  return Math.round(clamp(score + mealsBonus, 0, 100));
}

export function readinessScore(log?: ReadinessLog): number {
  if (!log) return 60;
  const sleep = clamp((log.sleepHours / 8) * 100, 0, 100);
  const soreness = clamp(((6 - log.soreness) / 5) * 100, 0, 100);
  const motivation = clamp((log.motivation / 5) * 100, 0, 100);
  const base = sleep * 0.35 + soreness * 0.35 + motivation * 0.3;
  if (log.hrvSkipped || log.hrvRmssd == null) return Math.round(base);
  // Lightweight HRV signal (RMSSD): low suppresses readiness, high supports it.
  const hrvScore = clamp(((log.hrvRmssd - 20) / 50) * 100, 0, 100);
  return Math.round(base * 0.8 + hrvScore * 0.2);
}

export function recoveryBand(compositeScore: number): RecoveryBand {
  if (compositeScore >= 85) return 'push';
  if (compositeScore >= 70) return 'normal';
  if (compositeScore >= 50) return 'conservative';
  return 'recovery';
}

export function recoveryPlan(band: RecoveryBand): RecoveryPlan {
  if (band === 'push') {
    return {
      band,
      intensityNote: 'Push day: run normal progression or small top-set increase.',
      cardioNote: 'Keep cardio target as planned.',
      nutritionNote: 'Hit full macro targets; keep protein at or above target.',
    };
  }
  if (band === 'normal') {
    return {
      band,
      intensityNote: 'Normal day: follow planned sets and loads.',
      cardioNote: 'Maintain weekly cardio target.',
      nutritionNote: 'Stay close to calories and protein target today.',
    };
  }
  if (band === 'conservative') {
    return {
      band,
      intensityNote: 'Conservative day: trim 1-2 accessory sets or lower effort by ~1 RPE.',
      cardioNote: 'Favor lower-intensity cardio today.',
      nutritionNote: 'Prioritize hydration and protein before session.',
    };
  }
  return {
    band,
    intensityNote: 'Recovery day: technique work, deload, or rest.',
    cardioNote: 'Keep cardio light (walk/zone 2).',
    nutritionNote: 'Focus on sleep setup, hydration, and baseline calories/protein.',
  };
}

export function buildRecoveryScore(input: {
  date: string;
  sleep?: SleepLog;
  hydration?: HydrationLog;
  nutrition?: NutritionLog;
  readiness?: ReadinessLog;
}): RecoveryScore {
  const s = sleepScore(input.sleep);
  const h = hydrationScore(input.hydration);
  const n = nutritionScore(input.nutrition);
  const r = readinessScore(input.readiness);
  const compositeScore = Math.round(s * 0.4 + h * 0.2 + n * 0.25 + r * 0.15);
  return {
    date: input.date,
    sleepScore: s,
    hydrationScore: h,
    nutritionScore: n,
    readinessScore: r,
    compositeScore,
    band: recoveryBand(compositeScore),
  };
}
