import type { SessionMode } from '@/lib/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type ReadinessRecommendation = {
  mode: SessionMode;
  reason: string;
  /** Session-length guidance (e.g. school workload); does not change mode. */
  note?: string;
};

export type RecommendModeOptions = {
  hrvRmssd?: number;
  hrvSkipped?: boolean;
  schoolLoad?: 0 | 1 | 2 | 3;
};

/** @deprecated Use {@link RecommendModeOptions}. */
export type RecommendModeHrvInput = RecommendModeOptions;

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
  opts?: RecommendModeOptions,
): ReadinessRecommendation {
  const base = baseRecommendMode(sleepHours, soreness, motivation);
  let rec: ReadinessRecommendation = base;

  if (!opts?.hrvSkipped && opts?.hrvRmssd != null && Number.isFinite(opts.hrvRmssd)) {
    const hrvScore = clamp(((opts.hrvRmssd - 20) / 50) * 100, 0, 100);
    if (rec.mode !== 'skip') {
      if (rec.mode === 'standard' && hrvScore < 30) {
        rec = {
          mode: 'light',
          reason: 'Morning HRV reads low — favor a light day unless warm-ups feel surprisingly good.',
        };
      } else if (rec.mode === 'light' && hrvScore < 18 && sleepHours < 7) {
        rec = {
          mode: 'skip',
          reason: 'Short sleep plus crushed HRV — take the recovery day.',
        };
      }
    }
  }

  // Heavy school load reduces recommended session scope.
  // Heavy (3) → suggest abbreviated if otherwise standard.
  // Moderate (2) → note to prioritize main lifts.
  if (opts?.schoolLoad === 3 && rec.mode === 'standard') {
    rec.note =
      (rec.note ? rec.note + ' · ' : '') +
      'Heavy school day — consider prioritizing main lifts only.';
  }
  if (opts?.schoolLoad === 2) {
    rec.note =
      (rec.note ? rec.note + ' · ' : '') +
      'Moderate study load today — keep accessory work brief.';
  }

  return rec;
}
