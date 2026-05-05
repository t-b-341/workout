import type { Lift, Prescription } from './types';

const INTENSITY = 0.6;

/** Isolation / core / cardio slots get ~half volume during a deload week. */
export const DELOAD_ACCESSORY_LIFT_IDS = new Set<string>([
  'jm_press',
  'pec_flyes',
  'rdf',
  'supinated_barbell_curls',
  'ubr',
  'planks',
  'ab_rollouts',
  'liss',
  'echo_intervals',
]);

export function deloadVolumeGroup(lift: Pick<Lift, 'id'>): 'main' | 'accessory' {
  return DELOAD_ACCESSORY_LIFT_IDS.has(lift.id) ? 'accessory' : 'main';
}

function hasScalableLoad(lift: Pick<Lift, 'loadUnit'>): boolean {
  return lift.loadUnit === 'lb' || lift.loadUnit === 'kg' || lift.loadUnit === 'bodyweight';
}

function halfAccessorySets(sets: number): number {
  return Math.max(1, Math.round(sets / 2));
}

/** Halve a rep or interval-count target range. */
function halfRepRange(lo: number, hi: number): { repMin: number; repMax: number } {
  const rMin = Math.max(1, Math.round(lo / 2));
  const rMax = Math.max(rMin, Math.round(hi / 2));
  return { repMin: rMin, repMax: rMax };
}

/**
 * Standard deload Rx (matches docs/program.md intent):
 * - **Main** lifts: ~60% prescribed load; same sets/reps structure.
 * - **Accessory** lifts: same ~60% load when weighted; roughly **half** set count for typical strength work.
 * - **LISS**: one structural set expressing duration — ~half duration (minimum 5 minutes).
 * - **Echo intervals**: rep fields are sprint rounds (~halve rounds); steady-minutes branching does not apply.
 * - **Planks**: multiple sets → half set count only; single set → ~half hold (minimum 10s).
 *
 * Applies only when the session uses `deload: true`; does not mutate stored prescriptions.
 */
export function applyStandardDeload(p: Prescription, lift: Lift): Prescription {
  const group = deloadVolumeGroup(lift);

  let weight = p.weight;
  if (hasScalableLoad(lift)) {
    weight = Math.round(p.weight * INTENSITY);
  }

  if (group === 'main') {
    return { ...p, weight };
  }

  let sets = p.sets;
  let repMin = p.repMin;
  let repMax = p.repMax;

  const singleStructuralSet = sets === 1;

  // Steady-state cardio duration (minutes live in rep fields).
  if (lift.id === 'liss' && lift.repUnit === 'minutes' && singleStructuralSet) {
    const hr = halfRepRange(p.repMin, p.repMax);
    repMin = Math.max(5, hr.repMin);
    repMax = Math.max(repMin, hr.repMax);
    return { ...p, weight, sets, repMin, repMax };
  }

  // Echo bike: lift.repUnit is "minutes" in seed but prescriptions store round counts — halve rounds.
  if (lift.id === 'echo_intervals' && singleStructuralSet) {
    const hr = halfRepRange(p.repMin, p.repMax);
    repMin = Math.max(1, hr.repMin);
    repMax = Math.max(repMin, hr.repMax);
    return { ...p, weight, sets, repMin, repMax };
  }

  if (lift.repUnit === 'seconds') {
    if (singleStructuralSet) {
      const hr = halfRepRange(p.repMin, p.repMax);
      repMin = Math.max(10, hr.repMin);
      repMax = Math.max(repMin, hr.repMax);
      return { ...p, weight, sets, repMin, repMax };
    }
    sets = halfAccessorySets(p.sets);
    return { ...p, weight, sets, repMin: p.repMin, repMax: p.repMax };
  }

  sets = halfAccessorySets(p.sets);
  return { ...p, weight, sets, repMin, repMax };
}
