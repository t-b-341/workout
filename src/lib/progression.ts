import { LIFTS } from './seed';
import type { Lift, Prescription, SessionLog, SetLog } from './types';

/** P1 pull-up variants with added load (or eccentric negatives): snap in 2.5 lb steps. */
export const LIFT_IDS_PULLUP_ADDED_LOAD = new Set<string>(['p1_eccentric', 'p1_assisted', 'p1_bw']);

export type SnapLiftRef = Pick<Lift, 'id' | 'equipment' | 'loadUnit'>;

export function liftForSnap(liftId: string): SnapLiftRef {
  const l = LIFTS.find((x) => x.id === liftId);
  if (l) return { id: l.id, equipment: l.equipment, loadUnit: l.loadUnit };
  return { id: liftId, equipment: 'barbell', loadUnit: 'lb' };
}

/** Default progression / step size from catalog (lb). Fallback 5 for unknown IDs. */
export function catalogLiftIncrementLb(liftId: string): number {
  return LIFTS.find((x) => x.id === liftId)?.increment ?? 5;
}

/** Nearest 2.5 lb. */
export function snapQuarterLb(weight: number): number {
  return Math.round(weight / 2.5) * 2.5;
}

/** Nearest 5 lb (assistance counterweight on `p1_assisted`; 0 = unassisted). */
export function snapAssistedPullupLb(weight: number): number {
  return Math.round(weight / 5) * 5;
}

/**
 * Snap logged / prescribed working weight for the lift.
 * - Barbell: nearest 5 lb (`snapBarbell`).
 * - Dumbbell / farmer carry: `snapDbLoad` ladder.
 * - `p1_assisted`: assistance amount snaps in **5 lb** steps (50 → 0 toward unassisted); optional negatives still snap in 5s.
 * - Other weighted pull-ups (`p1_eccentric`, `p1_bw`): 2.5 lb added load.
 * - `loadUnit === 'none'` or pure cardio/time: unchanged.
 */
export function snapWorkingWeight(weight: number, lift: SnapLiftRef): number {
  if (lift.loadUnit === 'none' || lift.equipment === 'cardio' || lift.equipment === 'time') {
    return weight;
  }

  if (LIFT_IDS_PULLUP_ADDED_LOAD.has(lift.id)) {
    if (lift.id === 'p1_assisted') {
      if (weight >= 0) return Math.max(0, snapAssistedPullupLb(weight));
      return Math.max(-200, snapAssistedPullupLb(weight));
    }
    return Math.max(0, snapQuarterLb(weight));
  }

  if (lift.equipment === 'barbell') {
    return snapBarbell(weight);
  }

  if (lift.equipment === 'dumbbell' || lift.equipment === 'carry') {
    return snapDbLoad(Math.max(5, weight));
  }

  if (lift.loadUnit === 'lb') {
    return snapBarbell(weight);
  }

  return weight;
}

export type ProgressionDecision = {
  liftId: string;
  prescriptionId: string;
  /** New weight to use next session. */
  nextWeight: number;
  /** Whether the weight changed. */
  advanced: boolean;
  /** Whether progression was held due to non-completion. */
  held: boolean;
  /** Whether progression was skipped because session was light/skip/deload. */
  skipped: boolean;
  reason: string;
};

/**
 * Double-progression rule:
 * - Sets are FIXED (never auto-add).
 * - Advance weight only when ALL completed-status sets hit `repMax`.
 * - Light, skip, and deload sessions never advance.
 * - Any non-completed set (reduced/skipped/substituted) blocks advance.
 */
export function decideProgression(
  prescription: Prescription,
  setLogs: SetLog[],
  sessionLog: SessionLog,
  liftIncrementOverride?: number,
  liftById?: Map<string, Lift>,
): ProgressionDecision {
  const base = {
    liftId: prescription.liftId,
    prescriptionId: prescription.id,
    nextWeight: prescription.weight,
    advanced: false,
    held: false,
    skipped: false,
  };

  if (sessionLog.mode !== 'standard' || sessionLog.deload) {
    return { ...base, skipped: true, reason: 'Light / skip / deload — no progression' };
  }

  const setsForLift = setLogs.filter((s) => s.prescriptionId === prescription.id);
  if (setsForLift.length === 0) {
    return { ...base, skipped: true, reason: 'No sets logged' };
  }

  // Per-side lifts log 2 entries per set; we group by setIndex.
  const byIndex = new Map<number, SetLog[]>();
  for (const s of setsForLift) {
    const arr = byIndex.get(s.setIndex) ?? [];
    arr.push(s);
    byIndex.set(s.setIndex, arr);
  }

  const expectedSets = prescription.sets;
  if (byIndex.size < expectedSets) {
    return { ...base, held: true, reason: `Only ${byIndex.size}/${expectedSets} sets logged` };
  }

  for (const [, group] of byIndex) {
    for (const s of group) {
      if (s.status !== 'completed') {
        return { ...base, held: true, reason: `Set ${s.setIndex + 1} not completed (${s.status})` };
      }
      if (s.reps < prescription.repMax) {
        return {
          ...base,
          held: true,
          reason: `Set ${s.setIndex + 1}: ${s.reps} reps < top of range (${prescription.repMax})`,
        };
      }
    }
  }

  // RPE gate: if every set with a logged RPE is at RPE ≥ 9,
  // the lifter is likely near their limit at this weight.
  // Hold progression until at least one set lands at RPE ≤ 8.
  const rpeLoggedSets = setsForLift.filter(
    (s) => s.rpe != null && Number.isFinite(s.rpe),
  );
  if (rpeLoggedSets.length > 0) {
    const allAtOrAbove9 = rpeLoggedSets.every((s) => (s.rpe ?? 0) >= 9);
    if (allAtOrAbove9) {
      return {
        ...base,
        held: true,
        reason: `All sets RPE ≥ 9 — consolidate at this load before advancing`,
      };
    }
  }

  const liftMeta = liftForSnap(prescription.liftId);
  const catalogLift = liftById?.get(prescription.liftId) ?? LIFTS.find((l) => l.id === prescription.liftId);
  if (catalogLift?.lockedWeight) {
    return {
      ...base,
      nextWeight: prescription.weight,
      advanced: false,
      held: false,
      skipped: false,
      reason: 'Weight locked for this lift',
    };
  }

  const step =
    prescription.increment ?? liftIncrementOverride ?? catalogLiftIncrementLb(prescription.liftId);

  /** Positive weight = counterweight assistance; progress by reducing assist toward 0 (unassisted). */
  if (prescription.liftId === 'p1_assisted' && prescription.weight > 0) {
    const rawNext = prescription.weight - step;
    return {
      ...base,
      nextWeight: snapWorkingWeight(rawNext, liftMeta),
      advanced: true,
      reason: `All sets hit ${prescription.repMax} reps — −${step} lb assist`,
    };
  }

  if (prescription.liftId === 'p1_assisted' && prescription.weight <= 0) {
    return {
      ...base,
      nextWeight: snapWorkingWeight(prescription.weight, liftMeta),
      advanced: false,
      reason:
        prescription.weight === 0
          ? 'Unassisted (0 lb assist) — no assist to reduce'
          : 'Non-positive assist load — no auto progression',
    };
  }

  const rawNext = prescription.weight + step;
  return {
    ...base,
    nextWeight: snapWorkingWeight(rawNext, liftMeta),
    advanced: true,
    reason: `All sets hit ${prescription.repMax} reps — +${step}`,
  };
}

/** Normalize a DB load to nearest valid increment (5–52.5 by 2.5). */
export function snapDbLoad(weight: number): number {
  const min = 5;
  const max = 52.5;
  const step = 2.5;
  if (weight <= min) return min;
  if (weight >= max) return max;
  return Math.round((weight - min) / step) * step + min;
}

/** Snap a barbell load to nearest 5 lb. */
export function snapBarbell(weight: number): number {
  return Math.max(0, Math.round(weight / 5) * 5);
}
