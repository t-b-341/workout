import { getDb } from './db';
import { sortMealTimestamps } from './mealTiming';
import { kcalFromMacros } from './macros';
import { defaultNutritionDayType, resolveNutritionTargetsForDate } from './nutritionDayType';
import { localUpsert } from './sync';
import type { RecoveryPrefs } from './recoveryPrefs';

/**
 * Replace meal timestamps for a day using **saved** macro values from Dexie
 * (or prefs defaults). Use from quick meal log UIs; full nutrition form save
 * may still use different in-form state until the user saves.
 */
export async function replaceMealTimestampsForDay(
  date: string,
  prefs: RecoveryPrefs,
  mealTimestamps: string[],
): Promise<void> {
  const id = `nutrition-${date}`;
  const row = await getDb().nutrition_logs.get(id);
  const nt = prefs.nutritionTargets;
  const sessions = await getDb().session_logs.where('date').equals(date).toArray();
  const cardioLogs = await getDb().cardio_logs.where('date').equals(date).toArray();
  const dayType = row?.dayType ?? defaultNutritionDayType(date, sessions, cardioLogs);
  const allNutrition = await getDb().nutrition_logs.toArray();
  const fallbackTargets = resolveNutritionTargetsForDate({
    date,
    resolvedDayType: dayType,
    nutritionLogs: allNutrition,
    currentTargets: {
      proteinG: nt.proteinG,
      carbsG: nt.carbsG,
      fatG: nt.fatG,
    },
  });
  const pT = row?.proteinTargetG ?? fallbackTargets.proteinG;
  const cT = row?.carbsTargetG ?? fallbackTargets.carbsG;
  const fT = row?.fatTargetG ?? fallbackTargets.fatG;
  const pA = row?.proteinActualG ?? 0;
  const cA = row?.carbsActualG ?? 0;
  const fA = row?.fatActualG ?? 0;
  const targetKcal = kcalFromMacros(pT, cT, fT);
  const actualKcal = kcalFromMacros(pA, cA, fA);
  const sorted = sortMealTimestamps(mealTimestamps);
  const migrated = row?.mealTimestamps != null;
  let mealsLoggedCount: number;
  let mealTimestampsOut: string[] | undefined;
  if (sorted.length > 0) {
    mealsLoggedCount = sorted.length;
    mealTimestampsOut = sorted;
  } else if (!migrated && (row?.mealsLoggedCount ?? 0) > 0) {
    mealsLoggedCount = row!.mealsLoggedCount;
    mealTimestampsOut = undefined;
  } else {
    mealsLoggedCount = 0;
    mealTimestampsOut = [];
  }
  await localUpsert('nutrition_logs', {
    id,
    date,
    dayType,
    caloriesTarget: targetKcal,
    caloriesActual: actualKcal,
    proteinTargetG: pT,
    proteinActualG: pA,
    carbsTargetG: cT,
    carbsActualG: cA,
    fatTargetG: fT,
    fatActualG: fA,
    mealsLoggedCount,
    ...(mealTimestampsOut !== undefined ? { mealTimestamps: mealTimestampsOut } : {}),
  });
}
