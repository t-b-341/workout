'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';

/** US fluid ounces → milliliters (nutrition labels / gallon water). */
export const ML_PER_US_FLOZ = 29.5735295625;

/** Default daily hydration target: 128 fl oz (1 US gallon). */
export const DEFAULT_HYDRATION_TARGET_ML = Math.round(128 * ML_PER_US_FLOZ);

export function mlToUsFloz(ml: number): number {
  return ml / ML_PER_US_FLOZ;
}

export function usFlozToMl(oz: number): number {
  return Math.round(oz * ML_PER_US_FLOZ);
}

export type RecoveryPrefs = {
  hydrationTargetMl: number;
  /** Single “bottle” increment for quick refills (fl oz). */
  bottleRefillOz: number;
  nutritionTargets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
};

/** Default macro targets; carbs rounded from remaining kcal after protein & fat. */
const DEFAULT_CALORIES = 2910;
const DEFAULT_PROTEIN_G = 185;
const DEFAULT_FAT_G = 75;
const DEFAULT_CARBS_G = 374;

export const DEFAULT_RECOVERY_PREFS: RecoveryPrefs = {
  hydrationTargetMl: DEFAULT_HYDRATION_TARGET_ML,
  bottleRefillOz: 16,
  nutritionTargets: {
    calories: DEFAULT_CALORIES,
    proteinG: DEFAULT_PROTEIN_G,
    carbsG: DEFAULT_CARBS_G,
    fatG: DEFAULT_FAT_G,
  },
};

const META_KEY = 'recovery:prefs';

export async function loadRecoveryPrefs(): Promise<RecoveryPrefs> {
  const row = await getDb().meta.get(META_KEY);
  const v = row?.value as Partial<RecoveryPrefs> | undefined;
  if (!v) return { ...DEFAULT_RECOVERY_PREFS };
  const bo = v.bottleRefillOz ?? DEFAULT_RECOVERY_PREFS.bottleRefillOz;
  return {
    hydrationTargetMl: v.hydrationTargetMl ?? DEFAULT_RECOVERY_PREFS.hydrationTargetMl,
    bottleRefillOz: Math.min(64, Math.max(8, bo)),
    nutritionTargets: {
      calories: v.nutritionTargets?.calories ?? DEFAULT_RECOVERY_PREFS.nutritionTargets.calories,
      proteinG: v.nutritionTargets?.proteinG ?? DEFAULT_RECOVERY_PREFS.nutritionTargets.proteinG,
      carbsG: v.nutritionTargets?.carbsG ?? DEFAULT_RECOVERY_PREFS.nutritionTargets.carbsG,
      fatG: v.nutritionTargets?.fatG ?? DEFAULT_RECOVERY_PREFS.nutritionTargets.fatG,
    },
  };
}

export async function saveRecoveryPrefs(p: RecoveryPrefs) {
  await getDb().meta.put({ key: META_KEY, value: p });
}

export async function patchRecoveryPrefs(patch: Partial<RecoveryPrefs>) {
  const cur = await loadRecoveryPrefs();
  await saveRecoveryPrefs({
    ...cur,
    ...patch,
    nutritionTargets: {
      ...cur.nutritionTargets,
      ...(patch.nutritionTargets ?? {}),
    },
  });
}

export function useRecoveryPrefs(): RecoveryPrefs | undefined {
  return useLiveQuery(() => loadRecoveryPrefs(), []);
}
