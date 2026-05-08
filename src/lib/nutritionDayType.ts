import { kcalFromMacros } from './macros';
import type { CardioLog, NutritionDayType, NutritionLog, SessionLog } from './types';

type MacroTargets = {
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function isLissLikeCardioType(type: string | undefined): boolean {
  return type === 'liss' || type === 'walk';
}

function dateLeq(a: string, b: string): boolean {
  return a <= b;
}

function bucketForTargets(dayType: NutritionDayType): 'training' | 'rest' {
  return dayType === 'training' ? 'training' : 'rest';
}

/**
 * Preference when saving a nutrition row: classify the calendar day without persisting cardio-only cues
 * unless the caller passes an explicit selection.
 */
export function defaultNutritionDayType(
  date: string,
  sessions: Pick<SessionLog, 'date'>[],
  cardioLogs: Pick<CardioLog, 'date' | 'type'>[] = [],
): NutritionDayType {
  if (sessions.some((s) => s.date === date)) return 'training';
  if (cardioLogs.some((c) => c.date === date && isLissLikeCardioType(c.type))) return 'liss';
  return 'rest';
}

/**
 * Resolve macro targets for a date/dayType using historical snapshots when available.
 * - Prefer latest nutrition row on/before date with matching target bucket
 *   (training bucket or rest/liss bucket).
 * - Fallback to current targets when no historical snapshot exists.
 */
export function resolveNutritionTargetsForDate(args: {
  date: string;
  resolvedDayType: NutritionDayType;
  nutritionLogs: NutritionLog[];
  currentTargets: MacroTargets;
  resolvedDayTypeByDate?: Map<string, NutritionDayType>;
}): { proteinG: number; carbsG: number; fatG: number; calories: number } {
  const wantedBucket = bucketForTargets(args.resolvedDayType);
  const prior = args.nutritionLogs
    .filter((n) => dateLeq(n.date, args.date))
    .map((n) => ({
      log: n,
      effectiveDayType: args.resolvedDayTypeByDate?.get(n.date) ?? n.dayType ?? 'rest',
    }))
    .filter(({ log, effectiveDayType }) => {
      if (!Number.isFinite(log.proteinTargetG) || !Number.isFinite(log.carbsTargetG) || !Number.isFinite(log.fatTargetG)) {
        return false;
      }
      return bucketForTargets(effectiveDayType) === wantedBucket;
    })
    .sort((a, b) => (a.log.date < b.log.date ? 1 : a.log.date > b.log.date ? -1 : 0));

  const src = prior[0]?.log;
  const proteinG = src?.proteinTargetG ?? args.currentTargets.proteinG;
  const carbsG = src?.carbsTargetG ?? args.currentTargets.carbsG;
  const fatG = src?.fatTargetG ?? args.currentTargets.fatG;
  return {
    proteinG,
    carbsG,
    fatG,
    calories: kcalFromMacros(proteinG, carbsG, fatG),
  };
}
