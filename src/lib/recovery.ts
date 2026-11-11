import { kcalFromMacros } from './macros';
import { effectiveMealCount } from './mealTiming';
import { addDaysIso } from './time';
import type {
  HydrationLog,
  MindfulnessLog,
  NutritionLog,
  ReadinessLog,
  RecoveryBand,
  RecoveryCoreComponent,
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

function scoreLoggedSleep(log: SleepLog): number {
  const durationScore = sleepDurationScore(log.sleepHours);
  const qualityScore = clamp((log.sleepQuality / 5) * 100, 0, 100);
  const fragScore = sleepFragmentationScore(log);
  return Math.round(durationScore * 0.62 + qualityScore * 0.28 + fragScore * 0.1);
}

/** Null when there is no sleep log. A logged night keeps the previous formula. */
export function sleepScore(log: SleepLog): number;
export function sleepScore(log?: SleepLog): number | null;
export function sleepScore(log?: SleepLog): number | null {
  if (!log) return null;
  return scoreLoggedSleep(log);
}

/** 1 = clearest … 8 = darkest; unknown → no penalty. Monotonic penalty, capped. */
function urineColorPenalty(color?: HydrationLog['urineColor']): number {
  if (color == null) return 0;
  if (color <= 2) return 0;
  if (color >= 7) return 10;
  return (color - 2) * 2;
}

/** Null when there is no hydration log. */
export function hydrationScore(log: HydrationLog): number;
export function hydrationScore(log?: HydrationLog): number | null;
export function hydrationScore(log?: HydrationLog): number | null {
  if (!log) return null;
  const water = pct(log.waterActualMl, log.waterTargetMl);
  const waterScore = clamp(water * 100, 0, 100);
  const electrolyteBonus = log.electrolytes ? 5 : 0;
  const colorPenalty = urineColorPenalty(log.urineColor);
  return Math.round(clamp(waterScore + electrolyteBonus - colorPenalty, 0, 100));
}

/** Null when there is no nutrition log. */
export function nutritionScore(log: NutritionLog): number;
export function nutritionScore(log?: NutritionLog): number | null;
export function nutritionScore(log?: NutritionLog): number | null {
  if (!log) return null;
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

/** Null when there is no readiness log. */
export function readinessScore(log: ReadinessLog): number;
export function readinessScore(log?: ReadinessLog): number | null;
export function readinessScore(log?: ReadinessLog): number | null {
  if (!log) return null;
  const syntheticSleepLog: SleepLog = {
    id: `readiness-sleep-${log.id}`,
    date: log.date ?? '',
    sleepHours: log.sleepHours ?? 0,
    sleepQuality: 3,
    wakeCount: log.sleepInterruptions ?? undefined,
    sleepOnsetLatencyMin: undefined,
  };
  const sleep = scoreLoggedSleep(syntheticSleepLog);
  // Nap recovery bonus: adds to the sleep component.
  // A well-timed nap meaningfully improves next-day readiness;
  // a late nap partially offsets tonight's sleep quality.
  function napBonus(durationMin?: number, timing?: 'early' | 'late'): number {
    if (!durationMin || durationMin <= 0) return 0;
    let bonus = 0;
    if (durationMin <= 30) bonus = 6; // 20–30 min: light restorative
    else if (durationMin <= 60) bonus = 10; // 60 min: full slow-wave cycle
    else bonus = 12; // 90 min: full cycle + REM
    if (timing === 'late') bonus -= 4; // late nap risks tonight's sleep
    return Math.max(0, bonus);
  }
  const napAdj = napBonus(log.napDurationMin, log.napTiming);
  const sleepWithNap = clamp(sleep + napAdj, 0, 100);
  const soreness = clamp(((6 - log.soreness) / 5) * 100, 0, 100);
  const motivation = clamp((log.motivation / 5) * 100, 0, 100);
  const base = sleepWithNap * 0.35 + soreness * 0.35 + motivation * 0.3;
  if (log.hrvSkipped || log.hrvRmssd == null) return Math.round(base);
  // Lightweight HRV signal (RMSSD): low suppresses readiness, high supports it.
  const hrvScore = clamp(((log.hrvRmssd - 20) / 50) * 100, 0, 100);
  return Math.round(base * 0.8 + hrvScore * 0.2);
}

/** Null composite → null band. Zero stays in the recovery band; it is a real low score. */
export function recoveryBand(compositeScore: number | null): RecoveryBand | null {
  if (compositeScore == null) return null;
  if (compositeScore >= 85) return 'push';
  if (compositeScore >= 70) return 'normal';
  if (compositeScore >= 50) return 'conservative';
  return 'recovery';
}

export function recoveryPlan(band: RecoveryBand | null): RecoveryPlan {
  if (band == null) {
    return {
      band: null,
      intensityNote: 'Not enough data to adjust training.',
      cardioNote: '',
      nutritionNote: '',
    };
  }
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

/** Sum of logged durations for the day; time-only entries add 0. */
export function mindfulnessMinutesFromLogs(logs: MindfulnessLog[]): number {
  let s = 0;
  for (const e of logs) {
    if (e.durationMin != null) s += e.durationMin;
  }
  return s;
}

/** Logged mindfulness minutes (capped); empty logs → excluded from composite pillar. */
export function mindfulnessScore(minutes: number): number {
  const m = Math.max(0, minutes);
  return Math.round(clamp(55 + (Math.min(m, 30) / 30) * 45, 0, 100));
}

export type RecoveryCompositeWeights = {
  sleep: number;
  hydration: number;
  nutrition: number;
  readiness: number;
  stress?: number;
  mindfulness?: number;
};

/** Shares the same branching rules as `buildRecoveryScore` for UI copy + math. */
export function compositeWeightsForRecovery(
  hasStress: boolean,
  hasMindfulness: boolean,
): RecoveryCompositeWeights {
  if (hasStress && hasMindfulness) {
    return { sleep: 0.33, hydration: 0.17, nutrition: 0.21, readiness: 0.12, stress: 0.11, mindfulness: 0.06 };
  }
  if (hasStress) {
    return { sleep: 0.35, hydration: 0.18, nutrition: 0.22, readiness: 0.13, stress: 0.12 };
  }
  if (hasMindfulness) {
    return { sleep: 0.36, hydration: 0.18, nutrition: 0.24, readiness: 0.14, mindfulness: 0.08 };
  }
  return { sleep: 0.4, hydration: 0.2, nutrition: 0.25, readiness: 0.15 };
}

/** Yesterday's nap affects tonight's sleep architecture — lagged sleep modifier. */
function laggedNapModifier(log?: ReadinessLog): number {
  if (!log?.napDurationMin || log.napDurationMin <= 0) return 0;
  let mod = 0;
  if (log.napDurationMin <= 30) mod = 3;
  else if (log.napDurationMin <= 60) mod = 6;
  else mod = 8;
  if (log.napTiming === 'late') mod -= 5;
  return Math.max(-4, mod);
}

const CORE_ORDER: RecoveryCoreComponent[] = ['sleep', 'hydration', 'nutrition', 'readiness'];

function splitCorePresence(
  flags: Record<RecoveryCoreComponent, boolean>,
): Pick<RecoveryScore, 'present' | 'missing'> {
  const present: RecoveryCoreComponent[] = [];
  const missing: RecoveryCoreComponent[] = [];
  for (const key of CORE_ORDER) {
    if (flags[key]) present.push(key);
    else missing.push(key);
  }
  return { present, missing };
}

export function buildRecoveryScore(input: {
  date: string;
  sleep?: SleepLog;
  hydration?: HydrationLog;
  nutrition?: NutritionLog;
  readiness?: ReadinessLog;
  /** Yesterday's readiness (nap lagged into today's sleep pillar). */
  yesterdayReadiness?: ReadinessLog;
  /** All stress check-ins for this calendar day (any count). */
  stress?: StressLog[];
  /** All mindfulness entries for this calendar day (any count). */
  mindfulness?: MindfulnessLog[];
}): RecoveryScore {
  const s = sleepScore(input.sleep);
  const napLag = laggedNapModifier(input.yesterdayReadiness);
  const sAdjusted = s == null ? null : clamp(s + napLag, 0, 100);
  const h = hydrationScore(input.hydration);
  const n = nutritionScore(input.nutrition);
  const r = readinessScore(input.readiness);
  const avgR =
    input.stress && input.stress.length > 0 ? averageStressRating(input.stress) : null;
  const st = avgR != null ? stressScoreFromAverageRating(avgR) : undefined;
  const mindLogs = input.mindfulness ?? [];
  const mindMinTotal = mindfulnessMinutesFromLogs(mindLogs);
  const legacyMin = input.readiness?.mindfulnessMinutes;
  const effectiveMin =
    mindLogs.length > 0 ? mindMinTotal : legacyMin != null ? Math.max(0, legacyMin) : undefined;
  const mind = effectiveMin != null ? mindfulnessScore(effectiveMin) : undefined;

  const hasStress = (input.stress?.length ?? 0) > 0;
  const hasMindfulness = mindLogs.length > 0 || input.readiness?.mindfulnessMinutes != null;

  const w = compositeWeightsForRecovery(hasStress, hasMindfulness);
  const parts: Array<{ value: number; weight: number }> = [];
  if (sAdjusted != null) parts.push({ value: sAdjusted, weight: w.sleep });
  if (h != null) parts.push({ value: h, weight: w.hydration });
  if (n != null) parts.push({ value: n, weight: w.nutrition });
  if (r != null) parts.push({ value: r, weight: w.readiness });
  if (w.stress != null && st != null) parts.push({ value: st, weight: w.stress });
  if (w.mindfulness != null && mind != null) parts.push({ value: mind, weight: w.mindfulness });

  const { present, missing } = splitCorePresence({
    sleep: sAdjusted != null,
    hydration: h != null,
    nutrition: n != null,
    readiness: r != null,
  });

  let compositeScore: number | null = null;
  if (present.length >= 2) {
    if (present.length === CORE_ORDER.length) {
      // Every core pillar is logged, so the published weights already sum to 1.
      compositeScore = Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0));
    } else {
      const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
      compositeScore = Math.round(
        parts.reduce((sum, part) => sum + part.value * (part.weight / weightSum), 0),
      );
    }
  }

  return {
    date: input.date,
    sleepScore: sAdjusted,
    hydrationScore: h,
    nutritionScore: n,
    readinessScore: r,
    ...(st != null ? { stressScore: st } : {}),
    ...(mind != null ? { mindfulnessScore: mind } : {}),
    compositeScore,
    band: recoveryBand(compositeScore),
    present,
    missing,
  };
}

const CORE_LABEL: Record<RecoveryCoreComponent, string> = {
  sleep: 'sleep',
  hydration: 'hydration',
  nutrition: 'nutrition',
  readiness: 'readiness',
};

/** One line for a null composite. Empty when a composite exists. */
export function recoveryInsufficientDataLine(
  score: Pick<RecoveryScore, 'present' | 'missing' | 'compositeScore'>,
): string {
  if (score.compositeScore != null) return '';
  if (score.present.length === 0) {
    return 'Not enough data. Log at least two of sleep, readiness, hydration, and nutrition.';
  }
  const names = score.missing.map((key) => CORE_LABEL[key]);
  const list = names.length <= 1
    ? names[0] ?? 'sleep, readiness, hydration, and nutrition'
    : names.length === 2
      ? `${names[0]} or ${names[1]}`
      : `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
  return `Not enough data. Log ${list} to get a score.`;
}

function groupByDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.date);
    if (list) list.push(row);
    else map.set(row.date, [row]);
  }
  return map;
}

function firstById<T extends { id: string }>(rows: T[]): T | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function latestReadiness(rows: ReadinessLog[]): ReadinessLog | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * One score per day that has any core signal, using the same lag as the Recovery screen:
 * hydration and nutrition come from the previous calendar day. Missing pillars are null.
 */
export function buildRecoveryScoreSeries(input: {
  sleepLogs: SleepLog[];
  hydrationLogs: HydrationLog[];
  nutritionLogs: NutritionLog[];
  readinessLogs: ReadinessLog[];
  stressLogs?: StressLog[];
  mindfulnessLogs?: MindfulnessLog[];
}): RecoveryScore[] {
  const sleepByDate = groupByDate(input.sleepLogs);
  const hydrationByDate = groupByDate(input.hydrationLogs);
  const nutritionByDate = groupByDate(input.nutritionLogs);
  const readinessByDate = groupByDate(input.readinessLogs);
  const stressByDate = groupByDate(input.stressLogs ?? []);
  const mindByDate = groupByDate(input.mindfulnessLogs ?? []);

  const dates = new Set<string>();
  for (const date of sleepByDate.keys()) dates.add(date);
  for (const date of readinessByDate.keys()) dates.add(date);
  for (const date of stressByDate.keys()) dates.add(date);
  for (const date of mindByDate.keys()) dates.add(date);
  for (const date of hydrationByDate.keys()) dates.add(addDaysIso(date, 1));
  for (const date of nutritionByDate.keys()) dates.add(addDaysIso(date, 1));

  return [...dates].sort((a, b) => a.localeCompare(b)).map((date) => {
    const yesterday = addDaysIso(date, -1);
    return buildRecoveryScore({
      date,
      sleep: firstById(sleepByDate.get(date) ?? []),
      hydration: firstById(hydrationByDate.get(yesterday) ?? []),
      nutrition: firstById(nutritionByDate.get(yesterday) ?? []),
      readiness: latestReadiness(readinessByDate.get(date) ?? []),
      yesterdayReadiness: latestReadiness(readinessByDate.get(yesterday) ?? []),
      stress: stressByDate.get(date) ?? [],
      mindfulness: mindByDate.get(date) ?? [],
    });
  });
}
