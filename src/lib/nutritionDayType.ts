import type { NutritionDayType, SessionLog } from './types';

/**
 * Preference when saving a nutrition row: classify the calendar day without persisting cardio-only cues
 * unless the caller passes an explicit selection.
 */
export function defaultNutritionDayType(
  date: string,
  sessions: Pick<SessionLog, 'date' | 'completedAt' | 'mode'>[],
): NutritionDayType {
  const hasTraining = sessions.some(
    (s) => s.date === date && Boolean(s.completedAt) && s.mode !== 'skip',
  );
  return hasTraining ? 'training' : 'rest';
}
