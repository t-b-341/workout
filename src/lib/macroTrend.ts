import { format, subDays } from 'date-fns';
import type { HydrationLog, NutritionLog } from './types';

export type DayFuel = {
  date: string;
  nutrition?: NutritionLog;
  hydration?: HydrationLog;
};

export type MacroTrendAdvice = {
  /** Short, optional user-facing lines (no auto-progression). */
  lines: string[];
};

/** Calendar days strictly before `endIso` (newest → oldest), length `count`. */
export function priorDatesExclusive(endIso: string, count: number): string[] {
  const end = new Date(`${endIso}T12:00:00`);
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(format(subDays(end, i), 'yyyy-MM-dd'));
  }
  return out;
}

const PROTEIN_LOW = 0.82;
const CAL_LOW = 0.82;
const HYDRATION_LOW = 0.72;

function proteinLow(n: NutritionLog): boolean {
  if (n.proteinTargetG < 40) return false;
  return n.proteinActualG / n.proteinTargetG < PROTEIN_LOW;
}

function caloriesLow(n: NutritionLog): boolean {
  if (n.caloriesTarget < 1200) return false;
  return n.caloriesActual / n.caloriesTarget < CAL_LOW;
}

function hydrationLow(h: HydrationLog): boolean {
  if (h.waterTargetMl < 500) return false;
  return h.waterActualMl / h.waterTargetMl < HYDRATION_LOW;
}

/**
 * Fueling trend using **completed prior days only** (excludes `endIso` so
 * same-day partial logs do not skew “leading into today”).
 */
export function buildMacroTrendAdvice(days: DayFuel[]): MacroTrendAdvice {
  const lines: string[] = [];

  const withNutrition = days.filter((d) => d.nutrition);
  const withHydration = days.filter((d) => d.hydration);

  if (withNutrition.length >= 3) {
    const lowP = withNutrition.filter((d) => proteinLow(d.nutrition!)).length;
    const lowC = withNutrition.filter((d) => caloriesLow(d.nutrition!)).length;
    const n = withNutrition.length;
    if (lowP >= 2 || lowP / n >= 0.5) {
      lines.push(
        'Protein has been under target on most logged days leading into today — if the session feels heavy, favor holding loads over chasing PRs.',
      );
    }
    if (lowC >= 2 || lowC / n >= 0.5) {
      lines.push(
        'Calories have been low vs target on several recent logged days — consider a solid pre-workout meal if energy feels off.',
      );
    }
  }

  if (withHydration.length >= 3) {
    const lowH = withHydration.filter((d) => hydrationLow(d.hydration!)).length;
    const n = withHydration.length;
    if (lowH >= 2 || lowH / n >= 0.5) {
      lines.push(
        'Hydration has been under target on most recent logged days — front-load fluids before your main lifts today.',
      );
    }
  }

  return { lines };
}
