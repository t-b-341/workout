import { getDb } from './db';
import { sortMealTimestamps } from './mealTiming';
import { kcalFromMacros } from './macros';
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
  const pT = row?.proteinTargetG ?? nt.proteinG;
  const cT = row?.carbsTargetG ?? nt.carbsG;
  const fT = row?.fatTargetG ?? nt.fatG;
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
