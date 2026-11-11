import { beforeEach, describe, expect, it, vi } from 'vitest';

type MetaRow = { key: string; value: unknown };

const metaState = new Map<string, MetaRow>();

vi.mock('../src/lib/db', () => {
  return {
    getDb: () => ({
      meta: {
        get: async (key: string) => metaState.get(key),
        put: async (row: MetaRow) => {
          metaState.set(row.key, row);
        },
      },
    }),
  };
});

import {
  DEFAULT_RECOVERY_PREFS,
  loadRecoveryPrefs,
  patchRecoveryPrefs,
  type RecoveryPrefs,
} from '../src/lib/recoveryPrefs';

describe('patchRecoveryPrefs', () => {
  beforeEach(() => {
    metaState.clear();
  });

  it('updates nutrition defaults while preserving other prefs', async () => {
    await patchRecoveryPrefs({
      hydrationTargetMl: 3000,
      bottleRefillOz: 24,
      nutritionTargets: { calories: 2200, proteinG: 180, carbsG: 240, fatG: 70 },
    });

    await patchRecoveryPrefs({
      nutritionTargets: { calories: 2600, proteinG: 200, carbsG: 280, fatG: 80 },
    });

    const prefs = await loadRecoveryPrefs();
    expect(prefs.hydrationTargetMl).toBe(3000);
    expect(prefs.bottleRefillOz).toBe(24);
    expect(prefs.nutritionTargets).toEqual({
      calories: 2600,
      proteinG: 200,
      carbsG: 280,
      fatG: 80,
    });
  });

  it('keeps previous nutrition fields when patch is partial', async () => {
    await patchRecoveryPrefs({
      nutritionTargets: {
        calories: 2300,
        proteinG: 190,
        carbsG: 250,
        fatG: 75,
      },
    });

    await patchRecoveryPrefs({
      // Nested targets are merged at runtime; Partial<RecoveryPrefs> still requires a full object.
      nutritionTargets: { proteinG: 205 } as RecoveryPrefs['nutritionTargets'],
    });

    const prefs = await loadRecoveryPrefs();
    expect(prefs.nutritionTargets).toEqual({
      calories: 2300,
      proteinG: 205,
      carbsG: 250,
      fatG: 75,
    });
    expect(prefs.hydrationTargetMl).toBe(DEFAULT_RECOVERY_PREFS.hydrationTargetMl);
    expect(prefs.bottleRefillOz).toBe(DEFAULT_RECOVERY_PREFS.bottleRefillOz);
  });
});
