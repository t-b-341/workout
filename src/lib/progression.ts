import type { Prescription, SessionLog, SetLog } from './types';

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

  const inc = prescription.increment ?? liftIncrementOverride ?? 5;
  return {
    ...base,
    nextWeight: prescription.weight + inc,
    advanced: true,
    reason: `All sets hit ${prescription.repMax} reps — +${inc}`,
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
