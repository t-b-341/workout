import { format } from 'date-fns';
import type { NutritionLog } from './types';

/** Sorted ascending ISO strings (invalid dropped, duplicates removed). */
export function sortMealTimestamps(isoList: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of isoList) {
    if (Number.isNaN(Date.parse(s))) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.sort((a, b) => Date.parse(a) - Date.parse(b));
}

export type MealDerivedMetrics = {
  occasions: number;
  firstMealTimeLabel: string | null;
  lastMealTimeLabel: string | null;
  /** Longest gap between two consecutive eating occasions (minutes). */
  longestGapMinutes: number | null;
  /** Mean gap between consecutive occasions (minutes). */
  avgGapMinutes: number | null;
};

/**
 * Metrics from logged meal timestamps only (no “eating window” / metabolic framing).
 */
export function deriveMealMetrics(isoList: string[]): MealDerivedMetrics {
  const sortedMs = sortMealTimestamps(isoList).map((s) => Date.parse(s));
  const n = sortedMs.length;
  if (n === 0) {
    return {
      occasions: 0,
      firstMealTimeLabel: null,
      lastMealTimeLabel: null,
      longestGapMinutes: null,
      avgGapMinutes: null,
    };
  }

  const first = sortedMs[0]!;
  const last = sortedMs[n - 1]!;

  let longestGapMin = 0;
  for (let i = 1; i < n; i++) {
    const gapMin = (sortedMs[i]! - sortedMs[i - 1]!) / 60000;
    if (gapMin > longestGapMin) longestGapMin = gapMin;
  }

  const spanMin = (last - first) / 60000;
  const avgGapMinutes = n >= 2 ? spanMin / (n - 1) : null;

  return {
    occasions: n,
    firstMealTimeLabel: format(new Date(first), 'h:mm a'),
    lastMealTimeLabel: format(new Date(last), 'h:mm a'),
    longestGapMinutes: n >= 2 ? longestGapMin : null,
    avgGapMinutes,
  };
}

/** Prefer timed check-ins; fall back to legacy manual meal count when never migrated. */
export function effectiveMealCount(log: NutritionLog): number {
  if (log.mealTimestamps != null && log.mealTimestamps.length > 0) {
    return log.mealTimestamps.length;
  }
  return log.mealsLoggedCount;
}
