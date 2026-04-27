import type { Prescription, SessionLog } from './types';

export function effortLabel(scale: SessionLog['effortScale']): string {
  if (scale === -1) return 'Easier';
  if (scale === 1) return 'Harder';
  return 'Normal';
}

function adjustedWeight(weight: number, scale: SessionLog['effortScale']): number {
  if (scale === -1) return Math.max(0, Math.round(weight * 0.9));
  if (scale === 1) return Math.max(0, Math.round(weight * 1.05));
  return weight;
}

function adjustedSets(sets: number, scale: SessionLog['effortScale']): number {
  if (scale === -1) return Math.max(1, sets - 1);
  if (scale === 1) return sets + 1;
  return sets;
}

/**
 * Apply session-level effort scaling for lifters who don't use RPE:
 * - Easier: ~10% lighter and one fewer set
 * - Harder: ~5% heavier and one extra set
 */
export function applyEffortScale(
  prescription: Prescription,
  session: SessionLog,
): Prescription {
  const scale = session.effortScale ?? 0;
  if (scale === 0) return prescription;
  return {
    ...prescription,
    weight: adjustedWeight(prescription.weight, scale),
    sets: adjustedSets(prescription.sets, scale),
  };
}
