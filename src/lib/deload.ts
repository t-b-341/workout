import {
  catalogLiftIncrementLb,
  liftForSnap,
  snapWorkingWeight,
} from './progression';
import type { Lift, Prescription, SetLog } from './types';

const DELOAD_INTENSITY = 0.85;

/** Isolation / core / cardio slots get ~half volume during a deload week. */
export const DELOAD_ACCESSORY_LIFT_IDS = new Set<string>([
  'jm_press',
  'pec_flyes',
  'rdf',
  'supinated_barbell_curls',
  'pronated_barbell_curls',
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
 * - **Main** lifts: ~85% of recent working weight (or prescription when unknown); same sets/reps structure.
 * - **Accessory** lifts: same ~85% load when weighted; roughly **half** set count for typical strength work.
 * - **LISS**: one structural set expressing duration — ~half duration (minimum 5 minutes).
 * - **Echo intervals**: rep fields are sprint rounds (~halve rounds); steady-minutes branching does not apply.
 * - **Planks**: multiple sets → half set count only; single set → ~half hold (minimum 10s).
 *
 * Applies only when the session uses `deload: true`; does not mutate stored prescriptions.
 */
export function applyStandardDeload(
  p: Prescription,
  lift: Lift,
  recentWorkingWeight?: number | null,
): Prescription {
  const group = deloadVolumeGroup(lift);

  const baseWeight = recentWorkingWeight ?? p.weight;
  let weight = p.weight;
  if (hasScalableLoad(lift)) {
    weight = Math.round(baseWeight * DELOAD_INTENSITY);
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

/**
 * Compute the recommended Meso 2 starting weight for a lift.
 * If the lift was ready to progress (all recent working sets
 * hit repMax before deload), advance by one increment.
 * Otherwise hold at current weight.
 */
export function mesoTransitionWeight(
  prescription: Prescription,
  lift: Lift,
  recentWorkingSets: SetLog[],
): { weight: number; advanced: boolean; reason: string } {
  if (lift.lockedWeight) {
    return {
      weight: prescription.weight,
      advanced: false,
      reason: 'Weight locked',
    };
  }

  const dated = recentWorkingSets as Array<SetLog & { date?: string }>;

  // Get the last N sets for this prescription (N = sets in rx)
  const lastSets = dated
    .filter(
      (s) =>
        s.prescriptionId === prescription.id &&
        s.status === 'completed' &&
        (s.intent ?? 'working') === 'working',
    )
    .sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1))
    .slice(0, prescription.sets);

  if (lastSets.length < prescription.sets) {
    return {
      weight: prescription.weight,
      advanced: false,
      reason: 'Insufficient data — hold weight',
    };
  }

  // Near-miss rule: last set may be repMax-1, all others repMax
  const allReady = lastSets.every((s, i) => {
    const isLast = i === lastSets.length - 1;
    return s.reps >= prescription.repMax - (isLast ? 1 : 0);
  });

  if (!allReady) {
    return {
      weight: prescription.weight,
      advanced: false,
      reason: 'Not all sets hit ceiling — hold weight',
    };
  }

  const step = prescription.increment ?? catalogLiftIncrementLb(prescription.liftId);
  const nextWeight = snapWorkingWeight(
    prescription.weight + step,
    liftForSnap(prescription.liftId),
  );

  return {
    weight: nextWeight,
    advanced: true,
    reason: `Ceiling hit last meso — advancing +${step} lb`,
  };
}
