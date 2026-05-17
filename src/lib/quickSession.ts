import { QUICK_DEFAULT_LIFT_IDS } from './seed';
import { mostRecentWorkingWeight } from './stats';
import type { Prescription, SessionLog, SetLog } from './types';

export const QUICK_MIN_LIFTS = 1;
export const QUICK_MAX_LIFTS = 8;

const QUICK_SETS = 1;
const QUICK_REP_MIN = 1;
const QUICK_REP_MAX = 2;

/**
 * Build synthetic Prescription objects for a quick session.
 * Weight comes from mostRecentWorkingWeight(); falls back to
 * prescriptionFallback map (current prescription weights).
 * These are never stored in the DB — runtime only.
 */
export function buildQuickPrescriptions(
  liftIds: string[],
  allSets: SetLog[],
  allSessions: SessionLog[],
  prescriptionFallback: Map<string, number>,
): Prescription[] {
  return liftIds.map((liftId, i) => {
    const recent = mostRecentWorkingWeight(liftId, allSets, allSessions);
    const weight = recent ?? prescriptionFallback.get(liftId) ?? 0;
    return {
      id: `quick-${liftId}`,
      templateId: 'QUICK',
      liftId,
      order: i,
      weight,
      sets: QUICK_SETS,
      repMin: QUICK_REP_MIN,
      repMax: QUICK_REP_MAX,
      notes: 'Quick session — singles or doubles',
    };
  });
}

export { QUICK_DEFAULT_LIFT_IDS };
