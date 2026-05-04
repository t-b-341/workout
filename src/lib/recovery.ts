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
  StressLog,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 1;
  return clamp(actual / target, 0, 1.2);
}

/**
 * Map sleep duration to 0–100. Short sleep (<7h) is penalized sharply.
 * 7–10h is treated as adequate (no penalty vs aiming only at 8h), so extra rest
 * is not scored worse than insufficient sleep. Beyond ~10h, apply a mild taper only.
 */
function sleepDurationScore(hours: number): number {
  const adequateLow = 7;
  const adequateHigh = 10;
  if (hours >= adequateLow && hours <= adequateHigh) return 100;
  if (hours < adequateLow) {
    const shortBy = adequateLow - hours;
    return clamp(100 - shortBy * 18, 0, 100);
  }
  const longBy = hours - adequateHigh;
  return clamp(100 - longBy * 14, 55, 100);
}

/**
 * Fragmentation from optional latency + wakes. Omitted fields = neutral (excluded from average).
 * - Wake count: −12 per wake, floor 45.
 * - Onset latency: up to −35 by 90+ minutes, floor 60.
 */
function sleepFragmentationScore(log: SleepLog): number {
  const parts: number[] = [];
  if (log.wakeCount != null && Number.isFinite(log.wakeCount)) {
    const w = Math.max(0, log.wakeCount);
    parts.push(clamp(100 - w * 12, 45, 100));
  }
  if (log.sleepOnsetLatencyMin != null && Number.isFinite(log.sleepOnsetLatencyMin)) {
    const lat = Math.max(0, log.sleepOnsetLatencyMin);
    const t = clamp(lat / 90, 0, 1);
    parts.push(clamp(100 - t * 35, 60, 100));
  }
  if (parts.length === 0) return 100;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function sleepScore(log?: SleepLog): number {
  if (!log) return 60;
  const durationScore = sleepDurationScore(log.sleepHours);
  const qualityScore = clamp((log.sleepQuality / 5) * 100, 0, 100);
  const fragScore = sleepFragmentationScore(log);
  return Math.round(durationScore * 0.62 + qualityScore * 0.28 + fragScore * 0.1);
}

/** 1 = clearest … 8 = darkest; unknown → no penalty. Monotonic penalty, capped. */
function urineColorPenalty(color?: HydrationLog['urineColor']): number {
  if (color == null) return 0;
  if (color <= 2) return 0;
  if (color >= 7) return 10;
  return (color - 2) * 2;
}

export function hydrationScore(log?: HydrationLog): number {
  if (!log) return 60;
  const water = pct(log.waterActualMl, log.waterTargetMl);
  const waterScore = clamp(water * 100, 0, 100);
  const electrolyteBonus = log.electrolytes ? 5 : 0;
  const colorPenalty = urineColorPenalty(log.urineColor);
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

/** Mean rating for the day; empty → null */
export function averageStressRating(entries: StressLog[]): number | null {
  if (entries.length === 0) return null;
  const sum = entries.reduce((a, x) => a + x.rating, 0);
  return sum / entries.length;
}

/** Lower average stress rating (1–5) → higher score (0–100). */
export function stressScoreFromAverageRating(avgRating: number): number {
  return Math.round(clamp(((6 - avgRating) / 5) * 100, 0, 100));
}

/** Logged mindfulness minutes (capped); omitted readiness field → excluded from composite. */
export function mindfulnessScore(minutes: number): number {
  const m = Math.max(0, minutes);
  return Math.round(clamp(55 + (Math.min(m, 30) / 30) * 45, 0, 100));
}

export function buildRecoveryScore(input: {
  date: string;
  sleep?: SleepLog;
  hydration?: HydrationLog;
  nutrition?: NutritionLog;
  readiness?: ReadinessLog;
  /** All stress check-ins for this calendar day (any count). */
  stress?: StressLog[];
}): RecoveryScore {
  const s = sleepScore(input.sleep);
  const h = hydrationScore(input.hydration);
  const n = nutritionScore(input.nutrition);
  const r = readinessScore(input.readiness);
  const avgR =
    input.stress && input.stress.length > 0 ? averageStressRating(input.stress) : null;
  const st = avgR != null ? stressScoreFromAverageRating(avgR) : undefined;
  const mind =
    input.readiness?.mindfulnessMinutes != null
      ? mindfulnessScore(input.readiness.mindfulnessMinutes)
      : undefined;

  let compositeScore: number;
  if (st != null && mind != null) {
    compositeScore = Math.round(s * 0.33 + h * 0.17 + n * 0.21 + r * 0.12 + st * 0.11 + mind * 0.06);
  } else if (st != null) {
    compositeScore = Math.round(s * 0.35 + h * 0.18 + n * 0.22 + r * 0.13 + st * 0.12);
  } else if (mind != null) {
    compositeScore = Math.round(s * 0.36 + h * 0.18 + n * 0.24 + r * 0.14 + mind * 0.08);
  } else {
    compositeScore = Math.round(s * 0.4 + h * 0.2 + n * 0.25 + r * 0.15);
  }

  return {
    date: input.date,
    sleepScore: s,
    hydrationScore: h,
    nutritionScore: n,
    readinessScore: r,
    ...(st != null ? { stressScore: st } : {}),
    ...(mind != null ? { mindfulnessScore: mind } : {}),
    compositeScore,
    band: recoveryBand(compositeScore),
  };
}
