'use client';

import type { MindfulnessLog } from './types';

/** Per-entry duration when logging minutes (not used for wellness goal clamps). */
export const MINDFULNESS_ENTRY_DURATION_MIN = 1;
export const MINDFULNESS_ENTRY_DURATION_MAX = 60;

/** Upper bound for wellness target fields (`WellnessTargets`) in minutes. */
export const WELLNESS_GOAL_MINDFULNESS_MAX = 180;

export function clampMindfulnessEntryDuration(n: number): number {
  if (!Number.isFinite(n)) return MINDFULNESS_ENTRY_DURATION_MIN;
  return Math.min(
    MINDFULNESS_ENTRY_DURATION_MAX,
    Math.max(MINDFULNESS_ENTRY_DURATION_MIN, Math.round(n)),
  );
}

/** Total logged minutes for a calendar day (time-only entries contribute 0). */
export function mindfulnessDurationTotalForDay(logs: MindfulnessLog[]): number {
  let s = 0;
  for (const e of logs) {
    if (e.durationMin != null && Number.isFinite(e.durationMin)) s += e.durationMin;
  }
  return s;
}
