import type { SessionMode } from '@/lib/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type ReadinessRecommendation = {
  mode: SessionMode;
  reason: string;
};

export type RecommendModeHrvInput = {
  hrvRmssd?: number;
  hrvSkipped?: boolean;
};

function baseRecommendMode(
  sleepHours: number,
  soreness: number,
  motivation: number,
): ReadinessRecommendation {
  if (motivation <= 1 || (sleepHours < 4 && soreness >= 4)) {
    return { mode: 'skip', reason: 'Energy is in the floor — take the recovery day.' };
  }
  if (motivation <= 2 || soreness >= 4 || sleepHours < 5) {
    return { mode: 'light', reason: 'Drop to a light day; keep the groove without digging the hole deeper.' };
  }
  return { mode: 'standard', reason: 'Green across the board — hit it.' };
}

/**
 * Session mode from check-in sliders, with optional HRV downgrades only (never upgrades past base rules).
 */
export function recommendMode(
  sleepHours: number,
  soreness: number,
  motivation: number,
  hrv?: RecommendModeHrvInput,
): ReadinessRecommendation {
  const base = baseRecommendMode(sleepHours, soreness, motivation);
  if (hrv?.hrvSkipped || hrv?.hrvRmssd == null || !Number.isFinite(hrv.hrvRmssd)) {
    return base;
  }
  const hrvScore = clamp(((hrv.hrvRmssd - 20) / 50) * 100, 0, 100);
  if (base.mode === 'skip') return base;
  if (base.mode === 'standard' && hrvScore < 30) {
    return {
      mode: 'light',
      reason: 'Morning HRV reads low — favor a light day unless warm-ups feel surprisingly good.',
    };
  }
  if (base.mode === 'light' && hrvScore < 18 && sleepHours < 7) {
    return {
      mode: 'skip',
      reason: 'Short sleep plus crushed HRV — take the recovery day.',
    };
  }
  return base;
}
