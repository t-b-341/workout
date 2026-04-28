import { describe, expect, it } from 'vitest';
import { DEFAULT_RECOVERY_PREFS, normalizeRecoveryPrefsValue } from '../src/lib/recoveryPrefs';

describe('normalizeRecoveryPrefsValue', () => {
  it('returns defaults for missing or invalid meta', () => {
    expect(normalizeRecoveryPrefsValue(undefined)).toEqual(DEFAULT_RECOVERY_PREFS);
    expect(normalizeRecoveryPrefsValue(null)).toEqual(DEFAULT_RECOVERY_PREFS);
    expect(normalizeRecoveryPrefsValue('x')).toEqual(DEFAULT_RECOVERY_PREFS);
  });

  it('merges partial prefs and clamps bottle oz', () => {
    const out = normalizeRecoveryPrefsValue({
      bottleRefillOz: 200,
      nutritionTargets: { calories: 2000 },
    });
    expect(out.bottleRefillOz).toBe(64);
    expect(out.nutritionTargets.calories).toBe(2000);
    expect(out.nutritionTargets.proteinG).toBe(DEFAULT_RECOVERY_PREFS.nutritionTargets.proteinG);
  });
});
